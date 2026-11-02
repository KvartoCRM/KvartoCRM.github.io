import { calendarParts, conflictsFor, nextFreeTime, zonedInstant, DEFAULT_ZONE } from '../lib/scheduling'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import Modal from './Modal'
import type { Event } from '../types'
import { getErrorMessage } from '../lib/errors'
import { useContacts } from '../hooks/useContacts'
import { usePropertyCatalog } from '../hooks/usePropertyCatalog'
import { useEvents } from '../hooks/useEvents'
import { syncNativeReminders } from '../lib/nativeReminders'

interface NewEventFormProps {
  isOpen: boolean
  onClose: () => void
  defaultType?: 'meeting' | 'call'
  editData?: Event | null
  initialDate?: string
  initialTime?: string
}

const NewEventForm = ({ isOpen, onClose, defaultType = 'meeting', editData = null, initialDate = '', initialTime = '' }: NewEventFormProps) => {
  const { user } = useAuth()
  const { data: contacts = [] } = useContacts(user?.id)
  const { data: propertyCatalog } = usePropertyCatalog(user?.id)
  const { data: events = [], saveEvent, mutationPending: saving } = useEvents(user?.id)
  const owners = contacts.filter(contact => contact.roles.includes('seller') || contact.roles.includes('landlord'))
  const buyers = contacts.filter(contact => contact.roles.includes('buyer') || contact.roles.includes('tenant'))
  const properties = propertyCatalog?.properties || []
  const [eventType, setEventType] = useState<'meeting' | 'call'>(defaultType)
  const stableId = useRef(crypto.randomUUID())
  const [duration, setDuration] = useState(60)
  const [zone, setZone] = useState(DEFAULT_ZONE)
  const [allowConflict, setAllowConflict] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [relatedClientType, setRelatedClientType] = useState<'owner' | 'buyer' | ''>('')
  const [relatedClientId, setRelatedClientId] = useState('')
  const [relatedPropertyId, setRelatedPropertyId] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (editData) {
      setDuration(editData.durationMinutes || (editData.type === 'call' ? 15 : 60))
      setZone(editData.timeZone || DEFAULT_ZONE)
      setTitle(editData.title)
      setDate(editData.eventDate)
      setTime(editData.eventTime || '')
      setRelatedClientId(editData.relatedClientId || '')
      setRelatedClientType(editData.relatedClientType || '')
      setNotes(editData.notes || '')
      if (editData.type === 'meeting') {
        setEventType('meeting')
        setLocation(editData.location || '')
        setRelatedPropertyId(editData.relatedPropertyId || '')
      } else {
        setEventType('call')
      }
    } else {
      resetForm()
      setEventType(defaultType)
      setDate(initialDate); setTime(initialTime); setDuration(defaultType === 'call' ? 15 : 60)
    }
  }, [editData, defaultType, initialDate, initialTime])

  const resetForm = () => {
    setTitle('')
    setDate('')
    setTime('')
    setRelatedClientType('')
    setRelatedClientId('')
    setRelatedPropertyId('')
    setLocation('')
    setNotes('')
  }

  useEffect(() => { setAllowConflict(false) }, [date,time,duration,zone,events])
  let start: Date | null = null
  try { if (date && time) start = zonedInstant(date,time,zone) } catch { /* Validated before saving. */ }
  const conflicts = start ? conflictsFor(events,start,duration,editData?.id) : []
  const dirty = zone !== (editData?.timeZone || DEFAULT_ZONE) || eventType !== (editData?.type || defaultType) || title !== (editData?.title || '') || notes !== (editData?.notes || '') || date !== (editData?.eventDate || initialDate) || time !== (editData?.eventTime || initialTime) || location !== (editData?.location || '') || relatedClientId !== (editData?.relatedClientId || '') || relatedPropertyId !== (editData?.relatedPropertyId || '') || duration !== (editData?.durationMinutes || (defaultType === 'call' ? 15 : 60))
  const close = () => { if (!saving && (!dirty || window.confirm('Изменения не сохранены. Закрыть форму и отказаться от них?'))) onClose() }
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (!title.trim()) { setSaveError('Укажите название.'); return }
    if (time && !start) { setSaveError('Проверьте дату, время и часовой пояс.'); return }
    if (conflicts.length && !allowConflict) { setSaveError('Выберите свободное время или подтвердите пересечение.'); return }
    const eventData = {
      durationMinutes: duration, timeZone: zone, expectedUpdatedAt: editData?.updatedAt,
      type: eventType,
      title,
      eventDate: date,
      eventTime: time || undefined,
      location: eventType === 'meeting' ? location || undefined : undefined,
      notes: notes || undefined,
      relatedClientId: relatedClientId || undefined,
      relatedClientType: relatedClientType || undefined,
      relatedPropertyId: eventType === 'meeting' ? relatedPropertyId || undefined : undefined,
    }

    setSaveError('')
    try {
      await saveEvent(eventData, editData?.id, stableId.current)
      resetForm()
      onClose()
      await syncNativeReminders(user.id).catch(() => undefined)
    } catch (error) {
      setSaveError(`Не удалось сохранить событие: ${getErrorMessage(error, 'проверьте подключение и повторите')}`)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title={editData ? 'Редактировать событие' : 'Новое событие'}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset disabled={saving} className="space-y-5">
        {saveError && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{saveError}</div>}
        {!editData && (
          <div>
            <label className="block text-sm font-medium lumi-text mb-3">Тип события</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="eventType"
                  value="meeting"
                  checked={eventType === 'meeting'}
                  onChange={(e) => setEventType(e.target.value as 'meeting' | 'call')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="lumi-text">Встреча</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="eventType"
                  value="call"
                  checked={eventType === 'call'}
                  onChange={(e) => setEventType(e.target.value as 'meeting' | 'call')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="lumi-text">Звонок</span>
              </label>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium lumi-text mb-2">Название</label>
          <input
            type="text"
            required
            aria-label="Название" value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 rounded-xl lumi-control focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            placeholder="Например, Показ квартиры"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium lumi-text mb-2">Дата</label>
            <input
              type="date"
              required
              aria-label="Дата" value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl lumi-control focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium lumi-text mb-2">Время</label>
            <input
              type="time"
              aria-label="Время" value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-4 py-3 rounded-xl lumi-control focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="lumi-text text-sm font-medium">Длительность, мин<input aria-label="Длительность, мин" type="number" min="5" max="1440" step="5" required value={duration} onChange={e=>setDuration(Number(e.target.value))} className="lumi-control mt-2 w-full rounded-xl px-4 py-3" /></label>
          <label className="lumi-text text-sm font-medium">Часовой пояс<select aria-label="Часовой пояс" value={zone} onChange={e=>setZone(e.target.value)} className="lumi-control mt-2 w-full rounded-xl px-4 py-3">{Array.from(new Set([zone,DEFAULT_ZONE,Intl.DateTimeFormat().resolvedOptions().timeZone,'Europe/Kaliningrad','Asia/Yekaterinburg','Asia/Novosibirsk','Asia/Vladivostok','UTC'])).map(z=><option key={z} value={z}>{{'Europe/Moscow':'Москва · UTC+3','Europe/Kaliningrad':'Калининград · UTC+2','Asia/Yekaterinburg':'Екатеринбург · UTC+5','Asia/Novosibirsk':'Новосибирск · UTC+7','Asia/Vladivostok':'Владивосток · UTC+10','UTC':'Всемирное время · UTC'}[z] || z}</option>)}</select></label>
        </div>
        {editData && !editData.durationMinutes && <p className="lumi-muted text-xs">У старой записи нет длительности. Для встречи предложено 60 минут, для звонка 15. Значение можно изменить.</p>}
        {conflicts.length > 0 && <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4" role="status"><h3 className="lumi-text font-semibold">Время уже занято</h3><ul className="lumi-text my-2 text-sm">{conflicts.map(item=><li key={item.id}>{item.title} · {item.eventTime?.slice(0,5)}</li>)}</ul><button type="button" className="lumi-control rounded-lg px-3 py-2 text-sm" onClick={()=>{if(start){const next=calendarParts(nextFreeTime(events,start,duration,editData?.id),zone);setDate(next.date);setTime(next.time)}}}>Выбрать ближайшее свободное время</button><label className="lumi-text mt-3 flex gap-2 text-sm"><input type="checkbox" checked={allowConflict} onChange={e=>setAllowConflict(e.target.checked)}/>Сохранить с пересечением</label></section>}

        <div>
          <label className="block text-sm font-medium lumi-text mb-2">Тип клиента</label>
          <select
            aria-label="Тип клиента" value={relatedClientType}
            onChange={(e) => {
              setRelatedClientType(e.target.value as 'owner' | 'buyer' | '')
              setRelatedClientId('')
            }}
            className="w-full px-4 py-3 rounded-xl lumi-control focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
          >
            <option value="">Не выбран</option>
            <option value="owner">Собственник</option>
            <option value="buyer">Покупатель</option>
          </select>
        </div>

        {relatedClientType && (
          <div>
            <label className="block text-sm font-medium lumi-text mb-2">Клиент</label>
            <select
              aria-label="Клиент" value={relatedClientId}
              onChange={(e) => setRelatedClientId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl lumi-control focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            >
              <option value="">Не выбран</option>
              {relatedClientType === 'owner'
                ? owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.lastName} {owner.firstName}
                    </option>
                  ))
                : buyers.map((buyer) => (
                    <option key={buyer.id} value={buyer.id}>
                      {buyer.lastName} {buyer.firstName}
                    </option>
                  ))}
            </select>
          </div>
        )}

        {eventType === 'meeting' && (
          <div>
            <label className="block text-sm font-medium lumi-text mb-2">Объект</label>
            <select
              aria-label="Объект" value={relatedPropertyId}
              onChange={(e) => setRelatedPropertyId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl lumi-control focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            >
              <option value="">Не выбран</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.address}
                </option>
              ))}
            </select>
          </div>
        )}

        {eventType === 'meeting' && (
          <div>
            <label className="block text-sm font-medium lumi-text mb-2">Локация</label>
            <input
              type="text"
              aria-label="Локация" value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-3 rounded-xl lumi-control focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
              placeholder="Адрес встречи"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium lumi-text mb-2">Заметки</label>
          <textarea
            aria-label="Заметки" value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 rounded-xl lumi-control focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
            placeholder="Дополнительные заметки"
          />
        </div>

        <div className="lumi-panel sticky bottom-0 flex gap-3 border-t py-3">
          <button
            type="button"
            onClick={close}
            className="flex-1 px-6 py-3 lumi-control rounded-xl font-medium hover:bg-gray-50 transition-all"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-all disabled:opacity-60"
          >
            {saving ? 'Сохраняем…' : editData ? 'Сохранить изменения' : 'Сохранить'}
          </button>
        </div>
        </fieldset>
      </form>
    </Modal>
  )
}

export default NewEventForm
