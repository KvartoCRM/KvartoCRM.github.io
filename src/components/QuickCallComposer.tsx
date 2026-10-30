import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { useAuth } from '../context/AuthContext'
import { useClientRecords } from '../hooks/useClientRecords'
import { contactName, localDate } from '../lib/contactPresentation'
import { accountKey, readAccountValue, writeAccountValue } from '../lib/accountStorage'
import { validQuickDraft, quickCallError, type QuickCallDraft } from '../lib/quickCall'
import { saveQuickCall } from '../lib/saveQuickCall'
import { crmQueryKeys, queryClient } from '../lib/queryClient'
import { syncNativeReminders } from '../lib/nativeReminders'
import type { Client, Event as CrmEvent } from '../types'

export default function QuickCallComposer({ contact, scheduledEvent, onClose }: { contact?: Client; scheduledEvent?: CrmEvent; onClose: () => void }) {
  const { user } = useAuth()
  const { data: clients = [] } = useClientRecords(user?.id)
  const key = user ? accountKey(user.id, `draft:quick-call:${scheduledEvent?.id || contact?.id || 'new'}`) : ''
  const [restored] = useState(() => { try { return validQuickDraft(JSON.parse(readAccountValue(key) || 'null')) } catch { return false } })
  const [draft, setDraft] = useState<QuickCallDraft>(() => {
    try { const value: unknown = JSON.parse(readAccountValue(key) || 'null'); if (validQuickDraft(value)) return value } catch { /* Ignore corrupt draft. */ }
    return { id: crypto.randomUUID(), nextId: crypto.randomUUID(), updatedAt: Date.now(), clientId: contact?.id || scheduledEvent?.relatedClientId || '', name: contact ? contactName(contact) : scheduledEvent?.title || '', phone: contact?.phone || '', status: 'Состоялся', notes: '', date: localDate(), time: new Date().toTimeString().slice(0,5), type: 'warm', schedule: false, nextDate: '', nextTime: '' }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [closePrompt, setClosePrompt] = useState(false)
  const [durable, setDurable] = useState(true)
  const submitting = useRef(false)
  const saved = useRef(false)
  const dirty = Boolean(draft.notes || draft.schedule || draft.status !== 'Состоялся' || (!contact && (draft.name || draft.phone)))
  useEffect(() => {
    if (!key || !dirty || saved.current) return
    const raw = JSON.stringify(draft)
    writeAccountValue(key, raw)
    try { setDurable(localStorage.getItem(key) === raw) } catch { setDurable(false) }
  }, [key, dirty, draft])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && !saved.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const change = (patch: Partial<QuickCallDraft>) => setDraft(current => ({ ...current, ...patch, updatedAt: Date.now() }))
  const close = () => { if (!submitting.current) { if (dirty) setClosePrompt(true); else onClose() } }
  const selectContact = (id: string) => { const person = clients.find(item => item.id === id); change({clientId:id,name:person ? contactName(person) : '',phone:person?.phone || ''}) }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting.current || !user) return
    const problem = quickCallError(draft)
    if (problem) { setError(problem); return }
    submitting.current = true; setSaving(true); setError('')
    try {
      const person = contact || clients.find(item => item.id === draft.clientId)
      if (draft.clientId && !person) throw new Error('Не удалось загрузить выбранный контакт. Проверьте соединение и повторите.')
      await saveQuickCall(user.id, draft, person ? person.type === 'seller' ? 'owner' : 'buyer' : undefined, scheduledEvent?.id)
      saved.current = true
      writeAccountValue(key, null)
      await Promise.all([queryClient.invalidateQueries({queryKey:crmQueryKeys.calls(user.id)}),queryClient.invalidateQueries({queryKey:crmQueryKeys.events(user.id)}),queryClient.invalidateQueries({queryKey:crmQueryKeys.overview(user.id)})])
      void syncNativeReminders(user.id).catch(() => undefined)
      onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Сохранение не подтверждено. Проверьте соединение и повторите. Данные остались в форме.') }
    finally { submitting.current = false; setSaving(false) }
  }
  const field = 'lumi-control mt-1.5 w-full min-w-0 rounded-xl px-3 py-2.5'
  return <Modal isOpen onClose={close} title="Итог звонка" closeOnBackdrop={false}>
    <form onSubmit={save} className="space-y-4">
      <p className="lumi-muted text-sm">Результат разговора и следующий контакт в одной форме.</p>
      {(restored || dirty) && <p className="lumi-muted text-xs" role="status">{durable ? restored ? 'Черновик восстановлен. Хранится на устройстве до 7 дней и удаляется при выходе из аккаунта.' : 'Черновик сохранён на этом устройстве.' : 'Хранилище недоступно. До сохранения в облаке не закрывайте приложение.'}</p>}
      <fieldset disabled={saving} className="space-y-4 disabled:opacity-60">
        <label className="lumi-text block text-sm font-medium">Контакт<select className={field} value={draft.clientId} onChange={e => selectContact(e.target.value)} disabled={Boolean(contact || scheduledEvent?.relatedClientId)}><option value="">Без привязки к контакту</option>{clients.map(person => <option key={person.id} value={person.id}>{contactName(person)} · {person.phone}</option>)}</select></label>
        {!draft.clientId && <div className="grid gap-3 sm:grid-cols-2"><label className="lumi-text text-sm">Имя<input className={field} value={draft.name} onChange={e => change({name:e.target.value})} /></label><label className="lumi-text text-sm">Телефон<input className={field} type="tel" value={draft.phone} onChange={e => change({phone:e.target.value})} /></label></div>}
        <fieldset><legend className="lumi-text mb-2 text-sm font-medium">Результат</legend><div className="flex flex-wrap gap-2">{['Состоялся','Не ответил','Перезвонить','Отказ'].map(status => <button key={status} type="button" aria-pressed={draft.status === status} onClick={() => change({status,...(status === 'Перезвонить' ? {schedule:true} : {})})} className={`rounded-xl px-3 py-2 text-sm ${draft.status === status ? 'lumi-accent-bg' : 'lumi-control'}`}>{status}</button>)}</div></fieldset>
        <label className="lumi-text block text-sm">Что обсудили<textarea data-autofocus className={field} rows={3} value={draft.notes} onChange={e => change({notes:e.target.value})} placeholder="Договорённости и пожелания" /></label>
        <label className="lumi-text flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.schedule} disabled={draft.status === 'Перезвонить'} onChange={e => change({schedule:e.target.checked})} />Назначить следующий звонок</label>
        {draft.schedule && <div className="lumi-panel-muted rounded-xl border p-3"><div className="grid grid-cols-2 gap-3"><label className="lumi-text text-sm">Дата<input className={field} type="date" min={localDate()} required value={draft.nextDate} onChange={e => change({nextDate:e.target.value})} /></label><label className="lumi-text text-sm">Время<input className={field} type="time" required value={draft.nextTime} onChange={e => change({nextTime:e.target.value})} /></label></div><p className="lumi-muted mt-2 text-xs">Появится в «Сегодня» в назначенный день. Уведомления зависят от разрешений устройства.</p></div>}
        <details className="lumi-border border-t pt-3"><summary className="lumi-muted cursor-pointer text-sm">Дата, время и тип состоявшегося звонка</summary><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="lumi-text text-sm">Дата<input type="date" required className={field} value={draft.date} onChange={e => change({date:e.target.value})} /></label><label className="lumi-text text-sm">Время<input type="time" required className={field} value={draft.time} onChange={e => change({time:e.target.value})} /></label><label className="lumi-text text-sm">Тип<select className={field} value={draft.type} onChange={e => change({type:e.target.value as QuickCallDraft['type']})}><option value="warm">Тёплый</option><option value="cold">Холодный</option><option value="inbound">Входящий</option><option value="selection">По подбору</option></select></label></div></details>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {closePrompt && <div role="alert" className="lumi-panel-muted space-y-3 rounded-xl border p-3"><p className="lumi-text text-sm">Оставить черновик для продолжения?</p><div className="flex flex-wrap gap-2"><button type="button" onClick={onClose} className="lumi-control rounded-lg px-3 py-2 text-sm">Оставить и закрыть</button><button type="button" onClick={() => { saved.current = true; writeAccountValue(key,null); onClose() }} className="rounded-lg px-3 py-2 text-sm text-red-400">Удалить черновик</button><button type="button" onClick={() => setClosePrompt(false)} className="lumi-control rounded-lg px-3 py-2 text-sm">Продолжить</button></div></div>}
      <div className="lumi-panel sticky bottom-0 flex flex-wrap justify-end gap-2 border-t py-3"><button type="button" disabled={saving} onClick={close} className="lumi-control rounded-xl px-4 py-2.5">Закрыть</button><button disabled={saving} className="lumi-gradient-button rounded-xl px-5 py-2.5 font-semibold disabled:opacity-50">{saving ? 'Сохраняем…' : draft.schedule ? 'Сохранить и запланировать' : 'Сохранить звонок'}</button></div>
    </form>
  </Modal>
}
