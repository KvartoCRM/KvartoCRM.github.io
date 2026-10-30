import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Phone, PhoneCall, Star, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClientRecords } from '../hooks/useClientRecords'
import { usePropertyCatalog } from '../hooks/usePropertyCatalog'
import { useCallActivities } from '../hooks/useCallActivities'
import { useEvents } from '../hooks/useEvents'
import NewEventForm from './NewEventForm'
import { contactName, contactInitials, contactStatus } from '../lib/contactPresentation'
import type { Client, Event } from '../types'
import OwnerForm from './OwnerForm'
import BuyerForm from './BuyerForm'
import QuickCallForm from './QuickCallForm'
import Contact360Panel from './Contact360Panel'
import ActivityTimeline from './ActivityTimeline'
import EntityFilesPanel from './EntityFilesPanel'

export default function ContactDetails({ client, clients, onDeleted }: { client: Client; clients: Client[]; onDeleted: () => void }) {
  const { user } = useAuth()
  const { toggleFavorite, removeClient, mutationPending } = useClientRecords(user?.id)
  const catalog = usePropertyCatalog(user?.id)
  const callQuery = useCallActivities(user?.id)
  const eventQuery = useEvents(user?.id)
  const [editingEvent,setEditingEvent] = useState<Event | null>(null)
  const upcoming = (eventQuery.data || []).filter(event => !event.isCompleted && event.relatedClientId === client.id).sort((a,b) => `${a.eventDate} ${a.eventTime || ''}`.localeCompare(`${b.eventDate} ${b.eventTime || ''}`))
  const [tab, setTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const [calling, setCalling] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const roles = client.roles || []
  const buyer = client.type === 'buyer'
  const rent = roles.includes(buyer ? 'tenant' : 'landlord')
  const properties = (catalog.data?.properties || []).filter(property => property.ownerId === client.id || (catalog.data?.propertyOwners[property.id] || []).some(owner => owner.clientId === client.id))
  const calls = (callQuery.data || []).filter(call => call.metadata?.client_id === client.id)
  const act = async (operation: () => Promise<unknown>) => {
    setError('')
    try { await operation() } catch { setError('Изменение не сохранено. Проверьте соединение и повторите.') }
  }
  return <div className="min-w-0 space-y-5">
    <header className="flex items-start gap-3">
      <div className="lumi-accent-soft flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold">{contactInitials(client)}</div>
      <div className="min-w-0 flex-1"><h2 className="lumi-text break-words text-xl font-semibold">{contactName(client)}</h2><p className="lumi-muted mt-1 text-sm">{contactStatus(client.status)}{client.source ? ` · ${client.source}` : ''}</p></div>
      <button aria-label={client.isFavorite ? 'Убрать из избранного' : 'В избранное'} aria-pressed={client.isFavorite} disabled={mutationPending} onClick={() => void act(() => toggleFavorite(client))} className="lumi-control rounded-lg p-2"><Star className={`h-5 w-5 ${client.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} /></button>
    </header>
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => setCalling(true)} className="lumi-gradient-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"><PhoneCall className="h-4 w-4" />Записать звонок</button>
      <button onClick={() => setEditing(true)} className="lumi-control inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"><Pencil className="h-4 w-4" />Изменить</button>
      <button aria-label="Переместить контакт в корзину" onClick={() => setConfirmDelete(true)} className="lumi-muted rounded-lg p-2.5 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
    </div>
    {confirmDelete && <div className="lumi-panel-muted space-y-3 rounded-xl border p-3"><p className="lumi-text text-sm">Переместить контакт в корзину? Его можно восстановить в течение 5 дней.</p><div className="flex gap-2"><button disabled={mutationPending} onClick={() => void act(async () => { await removeClient(client.id); onDeleted() })} className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">В корзину</button><button onClick={() => setConfirmDelete(false)} className="lumi-control rounded-lg px-3 py-2 text-sm">Оставить</button></div></div>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <section className="lumi-panel-muted rounded-xl border p-3"><h3 className="lumi-text mb-2 text-sm font-semibold">Ближайшие дела</h3>{eventQuery.error ? <p className="text-sm text-red-400">Не удалось загрузить расписание.</p> : eventQuery.isPending ? <p className="lumi-muted text-sm">Загрузка…</p> : upcoming.length ? <div className="space-y-2">{upcoming.slice(0,3).map(event => <button key={event.id} onClick={()=>setEditingEvent(event)} className="lumi-control block w-full rounded-lg p-2 text-left text-sm"><span className="lumi-text block">{event.title}</span><span className="lumi-muted">{new Date(`${event.eventDate}T12:00`).toLocaleDateString('ru-RU')}{event.eventTime ? ` · ${event.eventTime.slice(0,5)}` : ''}</span></button>)}{upcoming.length > 3 && <Link to="/work" className="lumi-accent-text text-xs">Все дела · {upcoming.length}</Link>}</div> : <p className="lumi-muted text-sm">Следующий контакт пока не назначен.</p>}</section>
    <div className="lumi-border flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Карточка контакта">{[['overview', 'Обзор'], ['history', 'История'], ['files', 'Документы'], ['connections', 'Связи']].map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`shrink-0 border-b-2 px-3 py-3 text-sm ${tab === id ? 'lumi-accent-text border-current font-semibold' : 'lumi-muted border-transparent'}`}>{label}</button>)}</div>
    <div role="tabpanel">
      {tab === 'overview' && <div className="space-y-5">
        <div className="space-y-2"><a className="lumi-text inline-flex items-center gap-2 text-lg font-medium" href={`tel:${client.phone.replace(/[^+\d]/g, '')}`}><Phone className="lumi-muted h-4 w-4" />{client.phone || 'Телефон не указан'}</a>{client.email && <p><a className="lumi-accent-text text-sm" href={`mailto:${client.email}`}>{client.email}</a></p>}</div>
        {client.contactComment && <p className="lumi-text whitespace-pre-wrap text-sm leading-relaxed">{client.contactComment}</p>}
        {client.description && <section><h3 className="lumi-text mb-2 text-sm font-semibold">Заметки</h3><p className="lumi-muted whitespace-pre-wrap text-sm leading-relaxed">{client.description}</p></section>}
        {buyer && <section className="lumi-panel-muted rounded-xl border p-4"><h3 className="lumi-text text-sm font-semibold">Что ищет</h3><p className="lumi-muted mt-2 text-sm">{client.propertyType || 'Тип недвижимости не указан'}{client.budget ? ` · до ${client.budget.toLocaleString('ru-RU')} ₽` : ''}{client.rooms ? ` · ${client.rooms} комн.` : ''}</p>{client.preferredDistricts?.length ? <p className="lumi-muted mt-1 text-sm">{client.preferredDistricts.join(', ')}</p> : null}</section>}
        <section><h3 className="lumi-text mb-2 text-sm font-semibold">Связанные объекты</h3>{catalog.isPending ? <p className="lumi-muted text-sm">Загрузка…</p> : catalog.error ? <p role="alert" className="text-sm text-red-400">Не удалось загрузить объекты.</p> : properties.length ? <div className="space-y-2">{properties.map(property => <Link key={property.id} to={`/properties/${property.id}`} className="lumi-control block rounded-xl p-3 text-sm"><span className="lumi-text block font-medium">{property.address}</span><span className="lumi-muted">{property.price ? `${property.price.toLocaleString('ru-RU')} ₽` : 'Цена не указана'}</span></Link>)}</div> : <p className="lumi-muted text-sm">Объектов пока нет.</p>}</section>
        {client.tags.length > 0 && <div className="flex flex-wrap gap-2">{client.tags.map(tag => <span key={tag} className="lumi-accent-soft rounded-full px-2 py-1 text-xs">{tag}</span>)}</div>}
      </div>}
      {tab === 'history' && <div className="space-y-5"><section><h3 className="lumi-text mb-3 font-semibold">Звонки</h3>{callQuery.isPending ? <p className="lumi-muted text-sm">Загрузка…</p> : callQuery.error ? <p role="alert" className="text-sm text-red-400">Не удалось загрузить звонки.</p> : calls.length ? calls.map(call => <article key={call.id} className="lumi-border border-b py-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong className="lumi-text">{call.metadata?.status || call.outcome || 'Звонок'}</strong><time className="lumi-muted">{call.occurred_at ? new Date(call.occurred_at).toLocaleString('ru-RU') : ''}</time></div><p className="lumi-muted mt-2 whitespace-pre-wrap text-sm">{call.notes}</p></article>) : <p className="lumi-muted text-sm">Запишите первый звонок из этой карточки.</p>}</section><ActivityTimeline clientId={client.id} /></div>}
      {tab === 'files' && <EntityFilesPanel clientId={client.id} title="Документы контакта" />}
      {tab === 'connections' && <Contact360Panel client={client} clients={clients} />}
    </div>
    {editing && (buyer ? <BuyerForm isOpen buyer={client} defaultPurpose={rent ? 'rent' : 'sale'} onClose={() => setEditing(false)} /> : <OwnerForm isOpen owner={client} mode={rent ? 'rent' : 'sale'} onClose={() => setEditing(false)} />)}
    {calling && <QuickCallForm contact={client} onClose={() => setCalling(false)} />}
    {editingEvent && <NewEventForm isOpen editData={editingEvent} onClose={()=>setEditingEvent(null)} />}
  </div>
}
