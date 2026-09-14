import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { supabase } from './supabase'
import { mapTaskRow } from './taskMapping'
import { setTaskStatus } from './tasks'

type ReminderSource = {
  sourceType: 'task' | 'event'
  sourceId: string
  title: string
  body: string
  route: string
  dueAt: Date
}

const OFFSETS = [1440, 60, 5, 0] as const
const ID_MODULO = 2_000_000_000
const REMINDER_CHANNEL = 'lumicrm-reminders-v2'
const REMINDER_ACTION_TYPE = 'LUMICRM_REMINDER_ACTIONS'
const SNOOZE_ACTION = 'SNOOZE_15'
const COMPLETE_ACTION = 'COMPLETE'

const notificationId = (sourceType: string, sourceId: string, minutes: number) => {
  let hash = 2166136261
  const input = `${sourceType}:${sourceId}:${minutes}`
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash) % ID_MODULO || 1
}

const reminderSuffix = (minutes: number) => minutes === 1440
  ? 'за день'
  : minutes === 60
    ? 'за час'
    : minutes === 5
      ? 'за 5 минут'
      : 'сейчас'

export const requestNativeNotificationPermission = async () => {
  if (!Capacitor.isNativePlatform()) return false
  let permission = await LocalNotifications.checkPermissions()
  if (permission.display === 'prompt' || permission.display === 'prompt-with-rationale') {
    permission = await LocalNotifications.requestPermissions()
  }
  return permission.display === 'granted'
}

export const requestExactAlarmPermission = async () => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return true
  const current = await LocalNotifications.checkExactNotificationSetting()
  if (current.exact_alarm === 'granted') return true
  const changed = await LocalNotifications.changeExactNotificationSetting()
  return changed.exact_alarm === 'granted'
}

const configureNativeNotifications = async () => {
  if (!Capacitor.isNativePlatform()) return
  await LocalNotifications.registerActionTypes({
    types: [{
      id: REMINDER_ACTION_TYPE,
      actions: [{ id: COMPLETE_ACTION, title: 'Выполнено' }, { id: SNOOZE_ACTION, title: 'Отложить на 15 минут' }],
    }],
  })
  if (Capacitor.getPlatform() === 'android') {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL,
      name: 'Задачи, звонки и встречи',
      description: 'Точные рабочие напоминания KvartoCRM',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#4F46E5',
    })
  }
}

export const syncNativeReminders = async (userId: string) => {
  if (!Capacitor.isNativePlatform() || !userId) return
  await configureNativeNotifications()
  const granted = await requestNativeNotificationPermission()
  if (!granted) return

  const [tasksResult, eventsResult] = await Promise.all([
    supabase.from('tasks').select('id,title,description,due_date,due_time,status,is_completed').eq('user_id', userId).is('deleted_at', null).eq('is_completed', false).neq('status', 'done').not('due_date', 'is', null).not('due_time', 'is', null),
    supabase.from('events').select('id,type,title,event_date,event_time,location,notes,is_completed').eq('user_id', userId).is('deleted_at', null).eq('is_completed', false).not('event_time', 'is', null),
  ])
  if (tasksResult.error || eventsResult.error) return

  const sources: ReminderSource[] = [
    ...(tasksResult.data ?? []).map(task => ({
      sourceType: 'task' as const,
      sourceId: task.id,
      title: `Задача: ${task.title}`,
      body: task.description || 'Пришло время выполнить задачу',
      route: '/tasks',
      dueAt: new Date(`${task.due_date}T${String(task.due_time).slice(0, 8)}`),
    })),
    ...(eventsResult.data ?? []).map(event => ({
      sourceType: 'event' as const,
      sourceId: event.id,
      title: `${event.type === 'call' ? 'Звонок' : 'Встреча'}: ${event.title}`,
      body: event.location || event.notes || 'Запланированное событие KvartoCRM',
      route: event.type === 'call' ? '/calls' : '/calendar',
      dueAt: new Date(`${event.event_date}T${String(event.event_time).slice(0, 8)}`),
    })),
  ].filter(source => !Number.isNaN(source.dueAt.getTime()))

  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map(item => ({ id: item.id })) })
  }

  const now = Date.now()
  const notifications = sources.flatMap(source => OFFSETS.flatMap(minutes => {
    const at = new Date(source.dueAt.getTime() - minutes * 60_000)
    if (at.getTime() <= now + 1_000) return []
    return [{
      id: notificationId(source.sourceType, source.sourceId, minutes),
      title: source.title,
      body: `${source.body} · напоминание ${reminderSuffix(minutes)}`,
      schedule: { at, allowWhileIdle: true },
      channelId: REMINDER_CHANNEL,
      actionTypeId: REMINDER_ACTION_TYPE,
      autoCancel: true,
      extra: { route: source.route, sourceType: source.sourceType, sourceId: source.sourceId, userId, reminderBody: source.body },
    }]
  }))

  for (let start = 0; start < notifications.length; start += 48) {
    await LocalNotifications.schedule({ notifications: notifications.slice(start, start + 48) })
  }
}

export const installNativeNotificationHandlers = async () => {
  if (!Capacitor.isNativePlatform()) return
  await configureNativeNotifications()
  await LocalNotifications.addListener('localNotificationActionPerformed', action => {
    if (action.actionId === COMPLETE_ACTION) {
      const extra = action.notification.extra || {}
      const sourceType = String(extra.sourceType || '')
      const sourceId = String(extra.sourceId || '')
      const userId = String(extra.userId || '')
      if (sourceType === 'task' && sourceId && userId) {
        void supabase.from('tasks').select('*').eq('id', sourceId).eq('user_id', userId).maybeSingle().then(({ data }) => {
          if (data) return setTaskStatus(userId, mapTaskRow(data), 'done')
        }).then(() => window.dispatchEvent(new CustomEvent('lumicrm:remote-data-changed')))
      } else if (sourceType === 'event' && sourceId && userId) {
        void supabase.from('events').update({ is_completed: true }).eq('id', sourceId).eq('user_id', userId)
          .then(() => window.dispatchEvent(new CustomEvent('lumicrm:remote-data-changed')))
      }
      return
    }
    if (action.actionId === SNOOZE_ACTION) {
      const extra = action.notification.extra || {}
      const next = new Date(Date.now() + 15 * 60_000)
      const sourceType = String(extra.sourceType || '')
      const sourceId = String(extra.sourceId || '')
      const userId = String(extra.userId || '')
      if (sourceId && (sourceType === 'task' || sourceType === 'event')) {
        const date = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
        const time = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}:00`
        const update = sourceType === 'task' ? { due_date: date, due_time: time } : { event_date: date, event_time: time }
        let query = supabase.from(sourceType === 'task' ? 'tasks' : 'events').update(update).eq('id', sourceId)
        if (userId) query = query.eq('user_id', userId)
        void query.then(() => window.dispatchEvent(new CustomEvent('lumicrm:remote-data-changed')))
      }
      void LocalNotifications.schedule({ notifications: [{
        id: notificationId(sourceType || 'reminder', sourceId || String(action.notification.id), Math.floor(Date.now() / 60_000)),
        title: action.notification.title || 'Напоминание KvartoCRM',
        body: `${extra.reminderBody || action.notification.body || 'Рабочее напоминание'} · отложено на 15 минут`,
        schedule: { at: next, allowWhileIdle: true },
        channelId: REMINDER_CHANNEL,
        actionTypeId: REMINDER_ACTION_TYPE,
        autoCancel: true,
        extra,
      }] })
      return
    }
    const route = action.notification.extra?.route
    if (typeof route === 'string' && route.startsWith('/')) window.location.assign(route)
  })
}
