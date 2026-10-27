import { useRef, useState } from 'react'
import Modal from './Modal'
import { useAuth } from '../context/AuthContext'
import { useClientRecords } from '../hooks/useClientRecords'
import { useCallActivities } from '../hooks/useCallActivities'
import { contactName, localDate } from '../lib/contactPresentation'
import type { Client } from '../types'
import type { CallType } from '../lib/callActivityMapping'

export default function QuickCallForm({ contact, onClose }: { contact?: Client; onClose: () => void }) {
  const { user } = useAuth()
  const { data: clients = [] } = useClientRecords(user?.id)
  const { saveCall, mutationPending } = useCallActivities(user?.id)
  const submitting = useRef(false)
  const [clientId, setClientId] = useState(contact?.id || '')
  const [name, setName] = useState(contact ? contactName(contact) : '')
  const [phone, setPhone] = useState(contact?.phone || '')
  const [status, setStatus] = useState('Состоялся')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(localDate())
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5))
  const [type, setType] = useState<CallType>('warm')
  const [error, setError] = useState('')
  const field = 'lumi-control mt-1.5 w-full min-w-0 rounded-xl px-3 py-2.5'

  const selectContact = (id: string) => {
    const person = clients.find(item => item.id === id)
    setClientId(id)
    setName(person ? contactName(person) : '')
    setPhone(person?.phone || '')
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting.current || !user) return
    if (!name.trim() && !phone.trim()) { setError('Укажите имя или телефон собеседника.'); return }
    const occurred = new Date(`${date}T${time}`)
    if (Number.isNaN(occurred.getTime())) { setError('Укажите дату и время звонка.'); return }
    submitting.current = true
    setError('')
    try {
      await saveCall({ title: name.trim() || phone.trim(), occurred_at: occurred.toISOString(), source: contact?.source || null, outcome: status, notes: notes.trim() || null,
        metadata: { client_id: clientId || undefined, contact_name: name.trim(), phone: phone.trim(), status, call_type: type, contact_method: 'Телефон' } })
      onClose()
    } catch { setError('Звонок не сохранён. Проверьте соединение и повторите. Введённые данные остались в форме.') }
    finally { submitting.current = false }
  }
  return <Modal isOpen onClose={() => { if (!submitting.current) onClose() }} title="Записать звонок" closeOnBackdrop={false}>
    <form onSubmit={save} className="space-y-5">
      <p className="lumi-muted text-sm">Зафиксируйте результат разговора. Запись появится в журнале и карточке выбранного контакта.</p>
      <label className="lumi-text block text-sm font-medium">Контакт<select className={field} value={clientId} onChange={e => selectContact(e.target.value)} disabled={Boolean(contact)}><option value="">Без привязки к контакту</option>{clients.map(person => <option key={person.id} value={person.id}>{contactName(person)} · {person.phone}</option>)}</select></label>
      {!clientId && <div className="grid gap-3 sm:grid-cols-2"><label className="lumi-text text-sm">Имя<input className={field} value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label><label className="lumi-text text-sm">Телефон<input className={field} type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></label></div>}
      <fieldset><legend className="lumi-text mb-2 text-sm font-medium">Результат звонка</legend><div className="flex flex-wrap gap-2">{['Состоялся', 'Не ответил', 'Перезвонить', 'Отказ'].map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={`rounded-xl px-3 py-2 text-sm ${status === value ? 'lumi-accent-bg' : 'lumi-control'}`}>{value}</button>)}</div></fieldset>
      <label className="lumi-text block text-sm font-medium">Что обсудили<textarea data-autofocus className={field} rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Договорённости, пожелания и следующий шаг" /></label>
      <details className="lumi-border border-t pt-3"><summary className="lumi-muted cursor-pointer text-sm">Дата, время и тип звонка</summary><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="lumi-text text-sm">Дата<input type="date" required className={field} value={date} onChange={e => setDate(e.target.value)} /></label><label className="lumi-text text-sm">Время<input type="time" required className={field} value={time} onChange={e => setTime(e.target.value)} /></label><label className="lumi-text text-sm">Тип<select className={field} value={type} onChange={e => setType(e.target.value as CallType)}><option value="warm">Тёплый</option><option value="cold">Холодный</option><option value="inbound">Входящий</option><option value="selection">По подбору</option></select></label></div></details>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={mutationPending} onClick={onClose} className="lumi-control rounded-xl px-4 py-2.5">Отмена</button><button disabled={mutationPending} className="lumi-gradient-button rounded-xl px-5 py-2.5 font-semibold disabled:opacity-50">{mutationPending ? 'Сохраняем…' : 'Сохранить звонок'}</button></div>
    </form>
  </Modal>
}


