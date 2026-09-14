import { useMemo, useState } from 'react'
import { Building2, Heart, LoaderCircle, Phone, Star, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useFavoriteRecords } from '../hooks/useRecordCollections'

const FavoritesPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const favoritesQuery = useFavoriteRecords(user?.id)
  const [activeTab, setActiveTab] = useState<'properties' | 'clients'>('properties')
  const properties = favoritesQuery.data?.properties || []
  const clients = favoritesQuery.data?.clients || []
  const [actionError, setActionError] = useState('')

  const removeProperty = async (id: string) => {
    setActionError('')
    try { await favoritesQuery.removeFavorite('property', id) }
    catch { setActionError('Не удалось изменить избранное.') }
  }

  const removeClient = async (id: string) => {
    setActionError('')
    try { await favoritesQuery.removeFavorite('client', id) }
    catch { setActionError('Не удалось изменить избранное.') }
  }

  const counts = useMemo(() => ({ properties: properties.length, clients: clients.length }), [clients.length, properties.length])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><div><h1 className="lumi-text text-3xl font-bold">Избранное</h1><p className="lumi-muted mt-2">Важные объекты и контакты вашей рабочей базы.</p></div><Star className="h-8 w-8 fill-amber-400 text-amber-400" /></div>
      {(actionError || favoritesQuery.error) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-800/50 bg-red-950/25 px-4 py-3 text-sm text-red-300"><span>{actionError || 'Не удалось загрузить избранное. Повторите попытку.'}</span>{favoritesQuery.error && <button type="button" onClick={() => void favoritesQuery.refetch()} className="font-semibold underline">Повторить</button>}</div>}
      <div className="lumi-control flex w-fit rounded-xl p-1">
        <button type="button" onClick={() => setActiveTab('properties')} className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold ${activeTab === 'properties' ? 'lumi-panel lumi-text shadow-sm' : 'lumi-muted'}`}><Building2 className="h-4 w-4" />Объекты · {counts.properties}</button>
        <button type="button" onClick={() => setActiveTab('clients')} className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold ${activeTab === 'clients' ? 'lumi-panel lumi-text shadow-sm' : 'lumi-muted'}`}><Users className="h-4 w-4" />Клиенты · {counts.clients}</button>
      </div>
      {favoritesQuery.isLoading ? <div className="lumi-muted flex justify-center py-20"><LoaderCircle className="h-9 w-9 animate-spin" /></div> : activeTab === 'properties' ? (
        properties.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{properties.map(property => <article key={property.id} className="lumi-panel overflow-hidden rounded-2xl border"><div className="lumi-panel-muted flex h-32 items-center justify-center"><Building2 className="lumi-muted h-12 w-12" /></div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="lumi-text text-xl font-bold">{property.price ? `${property.price.toLocaleString('ru-RU')} ₽` : 'Цена не указана'}</p><p className="lumi-muted mt-1 text-sm">{property.rooms ?? '—'}-комн. · {property.area ?? '—'} м²</p></div><button type="button" disabled={favoritesQuery.mutationPending} aria-label="Удалить из избранного" onClick={() => void removeProperty(property.id)} className="rounded-xl p-2 text-amber-400 hover:bg-amber-400/10 disabled:opacity-60"><Star className="h-5 w-5 fill-current" /></button></div><p className="lumi-text mt-4 font-semibold">{property.address}</p><button type="button" onClick={() => navigate(`/properties/${property.id}`)} className="lumi-accent-soft mt-5 w-full rounded-xl py-2.5 text-sm font-semibold">Открыть объект</button></div></article>)}</div> : <Empty icon={Building2} title="Нет избранных объектов" />
      ) : clients.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{clients.map(client => <article key={client.id} className="lumi-panel rounded-2xl border p-5"><div className="flex items-start justify-between"><div className="lumi-gradient-button flex h-12 w-12 items-center justify-center rounded-2xl font-bold">{client.firstName[0]}{client.lastName[0]}</div><button type="button" disabled={favoritesQuery.mutationPending} aria-label="Удалить из избранного" onClick={() => void removeClient(client.id)} className="rounded-xl p-2 text-amber-400 hover:bg-amber-400/10 disabled:opacity-60"><Star className="h-5 w-5 fill-current" /></button></div><h2 className="lumi-text mt-4 text-lg font-bold">{client.lastName} {client.firstName} {client.middleName}</h2><p className="lumi-muted mt-1 text-sm">{client.type === 'seller' ? 'Собственник / арендодатель' : 'Покупатель / арендатор'}</p><p className="lumi-muted-strong mt-4 flex items-center gap-2 text-sm"><Phone className="h-4 w-4" />{client.phone || 'Телефон не указан'}</p><button type="button" onClick={() => navigate(client.type === 'seller' ? '/owners' : '/buyers')} className="lumi-accent-soft mt-5 w-full rounded-xl py-2.5 text-sm font-semibold">Открыть раздел</button></article>)}</div> : <Empty icon={Heart} title="Нет избранных клиентов" />}
    </div>
  )
}

const Empty = ({ icon: Icon, title }: { icon: typeof Building2; title: string }) => <div className="lumi-panel-muted lumi-muted flex flex-col items-center justify-center rounded-2xl border border-dashed py-20"><Icon className="mb-4 h-14 w-14" /><p className="lumi-text font-semibold">{title}</p><p className="mt-2 text-sm">Нажмите звезду в карточке, чтобы добавить запись.</p></div>

export default FavoritesPage
