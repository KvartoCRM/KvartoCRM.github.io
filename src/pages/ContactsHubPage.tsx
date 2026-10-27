import ListFilters, { filterOptions } from '../components/ListFilters'
import { matchesText, inDateRange, sortRecords } from '../lib/listFiltering'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, ChevronRight, Mail, Plus, RefreshCw, Search, Star, Users } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClientRecords } from '../hooks/useClientRecords'
import { inferContactRoles } from '../lib/contactRoles'
import { contactName, contactInitials, contactStatus } from '../lib/contactPresentation'
import ContactDetails from '../components/ContactDetails'
import Modal from '../components/Modal'
import type { ContactRole, ContactSummary } from '../lib/contacts'
import AnchoredPopover from '../components/AnchoredPopover'
import BuyerForm from '../components/BuyerForm'
import OwnerForm from '../components/OwnerForm'

type ContactFilter = 'all' | ContactRole

const roleOptions: Array<{ id: ContactRole; label: string; shortLabel: string }> = [
  { id: 'seller', label: 'Собственник', shortLabel: 'Собственники' },
  { id: 'buyer', label: 'Покупатель', shortLabel: 'Покупатели' },
  { id: 'landlord', label: 'Арендодатель', shortLabel: 'Арендодатели' },
  { id: 'tenant', label: 'Арендатор', shortLabel: 'Арендаторы' },
]


const roleLabel = new Map(roleOptions.map(item => [item.id, item.label]))

const fullName = contactName

const formatContactDate = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

const ContactsHubPage = () => {
  const { user } = useAuth()
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1280px)').matches)
  useEffect(() => { const media = window.matchMedia('(min-width: 1280px)'); const update = () => setWide(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update) }, [])
  const [params, setParams] = useSearchParams()
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const { data: clients = [], isPending: loading, error: loadError, refetch } = useClientRecords(user?.id)
  const contacts = useMemo(() => clients.map(client => ({ ...client, roles: inferContactRoles(client as unknown as Record<string, unknown>), middleName: client.middleName || '', email: client.email || '' })), [clients])
  const selected = clients.find(client => client.id === params.get('client'))
  const closeContact = () => setParams(current => { const next = new URLSearchParams(current); next.delete('client'); return next }, { replace: true })
  const [filter, setFilter] = useState<ContactFilter>((['seller', 'buyer', 'landlord', 'tenant'].includes(params.get('role') || '') ? params.get('role') : 'all') as ContactFilter)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [newRole, setNewRole] = useState<ContactRole | null>(null)
  const error = loadError instanceof Error ? loadError.message : loadError ? 'Не удалось загрузить контакты.' : ''

  const counts = useMemo(() => Object.fromEntries(roleOptions.map(role => [role.id, contacts.filter(contact => contact.roles.includes(role.id)).length])) as Record<ContactRole, number>, [contacts])

  const visibleContacts = useMemo(() => {
    return sortRecords(contacts.filter(contact => {
      if (filter !== 'all' && !contact.roles.includes(filter)) return false
      if (filters.status && contact.status !== filters.status || filters.source && contact.source !== filters.source || filters.favorite && !contact.isFavorite) return false
      return matchesText(query, [fullName(contact), contact.phone, contact.email, contact.source]) && inDateRange(contact.createdAt, filters.from, filters.to)
    }), contact => filters.sort === 'created' ? Date.parse(contact.createdAt) : filters.sort === 'updated' ? Date.parse(contact.updatedAt) : filters.sort === 'next' ? contact.nextContactDate : filters.sort === 'status' ? contactStatus(contact.status) : fullName(contact), filters.direction || 'asc')
  }, [contacts, filter, query, filters])

  const openContact = (contact: ContactSummary) => {
    setParams(current => { const next = new URLSearchParams(current); next.set('client', contact.id); return next })
  }

  const openCreateForm = (role: ContactRole) => {
    setAddMenuOpen(false)
    setNewRole(role)
  }

  const closeCreateForm = () => {
    setNewRole(null)
    void refetch()
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="lumi-accent-text text-sm font-semibold">Единая клиентская база</p>
          <h1 className="lumi-text mt-1 text-3xl font-bold">Контакты</h1>
          <p className="lumi-muted mt-2 break-words">Люди, разговоры и договорённости. Всё под рукой.</p>
        </div>
        <div className="relative">
          <button ref={addButtonRef} type="button" onClick={() => setAddMenuOpen(value => !value)} className="lumi-gradient-button inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold sm:w-auto"><Plus className="h-5 w-5" />Добавить контакт</button>
          <AnchoredPopover open={addMenuOpen} anchorRef={addButtonRef} onClose={() => setAddMenuOpen(false)} width={300} ariaLabel="Выбор роли нового контакта" className="p-2">
            <p className="lumi-muted px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide">Кого добавить</p>
            {roleOptions.map(role => <button key={role.id} type="button" onClick={() => openCreateForm(role.id)} className="lumi-nav-item flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-medium"><span>{role.label}</span><ChevronRight className="h-4 w-4" /></button>)}
          </AnchoredPopover>
        </div>
      </div>

      <section className="lumi-panel w-full min-w-0 max-w-full rounded-2xl border p-3">
        <div className="relative">
          <Search className="lumi-muted absolute left-3 top-3.5 h-5 w-5" />
          <input value={query} onChange={event => setQuery(event.target.value)} className="lumi-control w-full rounded-xl py-3 pl-10 pr-4 outline-none" placeholder="Имя, телефон, email или источник" />
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Фильтр контактов">
          <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${filter === 'all' ? 'lumi-nav-item-active' : 'lumi-control'}`}>Все · {contacts.length}</button>
          {roleOptions.map(role => <button key={role.id} type="button" role="tab" aria-selected={filter === role.id} onClick={() => setFilter(role.id)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${filter === role.id ? 'lumi-nav-item-active' : 'lumi-control'}`}>{role.shortLabel} · {counts[role.id]}</button>)}
        </div>
      </section>

      <ListFilters values={filters} onChange={(key, value) => setFilters(current => ({ ...current, [key]: value }))} onReset={() => { setFilters({}); setQuery(''); setFilter('all') }} count={visibleContacts.length} total={contacts.length} defaultSort="name" defaultDirection="asc" sortOptions={[{value:'name',label:'Имя'},{value:'created',label:'Дата создания'},{value:'updated',label:'Дата изменения'},{value:'next',label:'Следующий контакт'},{value:'status',label:'Статус'}]} fields={[
        {key:'status',label:'Статус',options:filterOptions(contacts.map(contact => contact.status)).map(option => ({...option,label:contactStatus(option.value)}))},
        {key:'source',label:'Источник',options:filterOptions(contacts.map(contact => contact.source))},
        {key:'favorite',label:'Избранное',options:[{value:'yes',label:'Только избранные'}]},
        {key:'from',label:'Создан с',type:'date'},{key:'to',label:'Создан по',type:'date'},
      ]} />
      {error && <div className="flex flex-col gap-3 rounded-xl border border-red-800/50 bg-red-950/25 px-4 py-3 text-sm text-red-300 sm:flex-row sm:items-center sm:justify-between"><span>Не удалось загрузить контакты: {error}</span><button type="button" onClick={() => void refetch()} className="lumi-control inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-semibold"><RefreshCw className="h-4 w-4" />Повторить</button></div>}

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
      <div className="min-w-0">
      {loading && contacts.length === 0 ? (
        <div className="lumi-muted py-20 text-center">Загружаем контакты…</div>
      ) : visibleContacts.length === 0 ? (
        <div className="lumi-panel lumi-muted flex flex-col items-center rounded-2xl border border-dashed py-20 text-center"><Users className="mb-4 h-14 w-14" /><p className="lumi-text text-lg font-semibold">Контакты не найдены</p><p className="mt-2 text-sm">Измените фильтр или добавьте нового клиента.</p></div>
      ) : (
        <div className="grid gap-2">
          {visibleContacts.map(contact => (
            <button key={contact.id} type="button" onClick={() => openContact(contact)} aria-pressed={selected?.id === contact.id} className={`lumi-panel min-w-0 max-w-full rounded-xl border p-3 text-left transition hover:border-blue-400/60 ${selected?.id === contact.id ? 'ring-2 ring-blue-500' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="lumi-accent-bg flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-bold">{contactInitials(contact)}</div>
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="lumi-text truncate font-semibold">{fullName(contact)}</h2>{contact.isFavorite && <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />}</div><div className="mt-2 flex flex-wrap gap-1.5">{contact.roles.map(role => <span key={role} className="lumi-accent-soft rounded-full px-2.5 py-1 text-xs font-medium">{roleLabel.get(role)}</span>)}</div></div>
                <ChevronRight className="lumi-muted h-5 w-5 shrink-0" />
              </div>
              <div className="lumi-muted mt-2 pl-0 space-y-1 text-sm">
                <p className="truncate">{contact.phone || 'Телефон не указан'}</p>
                {contact.email && <p className="flex items-center gap-2 truncate"><Mail className="h-4 w-4 shrink-0" />{contact.email}</p>}
                {contact.nextContactDate && <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4 shrink-0" />Следующий контакт: {formatContactDate(contact.nextContactDate)}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      </div>
      {wide && <aside className="lumi-panel hidden min-w-0 rounded-2xl border p-5 xl:block" aria-label="Выбранный контакт">
        {selected ? <ContactDetails key={selected.id} client={selected} clients={clients} onDeleted={closeContact} /> : <div className="py-16 text-center"><Users className="lumi-muted mx-auto mb-3 h-8 w-8" /><p className="lumi-text font-semibold">Выберите контакт</p><p className="lumi-muted mt-2 text-sm">Карточка откроется здесь. Фильтр по роли менять не нужно.</p></div>}
      </aside>}
      </div>
      {!wide && selected && <Modal isOpen onClose={closeContact} title="Карточка контакта"><ContactDetails key={selected.id} client={selected} clients={clients} onDeleted={closeContact} /></Modal>}
      {newRole === 'seller' && <OwnerForm isOpen mode="sale" onClose={closeCreateForm} />}
      {newRole === 'landlord' && <OwnerForm isOpen mode="rent" onClose={closeCreateForm} />}
      {newRole === 'buyer' && <BuyerForm isOpen defaultPurpose="sale" onClose={closeCreateForm} />}
      {newRole === 'tenant' && <BuyerForm isOpen defaultPurpose="rent" onClose={closeCreateForm} />}
    </div>
  )
}

export default ContactsHubPage
