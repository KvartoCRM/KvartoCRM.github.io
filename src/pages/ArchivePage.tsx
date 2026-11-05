import {Link} from 'react-router-dom'
import { useState } from 'react'
import { Archive, Building2, LoaderCircle, RotateCcw, Trash2, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useArchiveRecords } from '../hooks/useRecordCollections'

const ArchivePage = () => {
  const { user } = useAuth()
  const archiveQuery = useArchiveRecords(user?.id)
  const [activeTab, setActiveTab] = useState<'properties' | 'clients'>('properties')
  const properties = archiveQuery.data?.properties || []
  const clients = archiveQuery.data?.clients || []
  const [actionError, setActionError] = useState('')

  const restoreProperty = async (id: string) => {
    setActionError('')
    try { await archiveQuery.restoreRecord('property', id) }
    catch { setActionError('Не удалось восстановить объект.') }
  }

  const restoreClient = async (id: string) => {
    setActionError('')
    try { await archiveQuery.restoreRecord('client', id) }
    catch { setActionError('Не удалось восстановить клиента.') }
  }

  const trashProperty = async (id: string) => {
    setActionError('')
    try { await archiveQuery.trashRecord('property', id) }
    catch { setActionError('Не удалось переместить объект в корзину.') }
  }

  const trashClient = async (id: string) => {
    setActionError('')
    try { await archiveQuery.trashRecord('client', id) }
    catch { setActionError('Не удалось переместить клиента в корзину.') }
  }

  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="lumi-text text-3xl font-bold">Архив</h1><p className="lumi-muted mt-2">Проданные и временно скрытые записи.</p></div><Archive className="lumi-muted h-8 w-8" /></div>
    {(actionError || archiveQuery.error) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-800/50 bg-red-950/25 px-4 py-3 text-sm text-red-300"><span>{actionError || 'Не удалось загрузить архив.'}</span>{archiveQuery.error && <button type="button" onClick={() => void archiveQuery.refetch()} className="font-semibold underline">Повторить</button>}</div>}
    <div className="lumi-control grid w-full max-w-md grid-cols-2 rounded-xl p-1"><button type="button" onClick={() => setActiveTab('properties')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${activeTab === 'properties' ? 'lumi-panel lumi-text shadow-sm' : 'lumi-muted'}`}><Building2 className="h-4 w-4" />Объекты · {properties.length}</button><button type="button" onClick={() => setActiveTab('clients')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${activeTab === 'clients' ? 'lumi-panel lumi-text shadow-sm' : 'lumi-muted'}`}><Users className="h-4 w-4" />Клиенты · {clients.length}</button></div>
    {archiveQuery.isLoading ? <div className="lumi-muted flex justify-center py-20"><LoaderCircle className="h-9 w-9 animate-spin" /></div> : activeTab === 'properties' ? properties.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{properties.map(property => <article key={property.id} className="lumi-panel rounded-2xl border p-5"><h2 className="lumi-text font-semibold">{property.address}</h2><p className="lumi-muted mt-2 text-sm">{property.price ? `${Number(property.price).toLocaleString('ru-RU')} ₽` : 'Цена не указана'} · {property.rooms ?? '—'}-комн. · {property.area ?? '—'} м²</p><span className="mt-3 inline-flex rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-400">{property.status === 'sold' ? 'Продан' : 'Архив'}</span><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={archiveQuery.mutationPending} onClick={() => void restoreProperty(property.id)} className="lumi-accent-soft inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold disabled:opacity-60"><RotateCcw className="h-4 w-4" />Вернуть</button><button type="button" disabled={archiveQuery.mutationPending} onClick={() => void trashProperty(property.id)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-500/15 px-3 py-2.5 text-sm font-semibold text-red-400 disabled:opacity-60"><Trash2 className="h-4 w-4" />В корзину</button></div></article>)}</div> : <Empty text="В архиве нет объектов" /> : clients.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{clients.map(client => <article key={client.id} className="lumi-panel rounded-2xl border p-5"><h2 className="lumi-text font-semibold">{client.lastName} {client.firstName} {client.middleName}</h2><Link className="lumi-accent-text text-sm" to={`/contacts?client=${client.id}`}>Карточка и история</Link><p className="lumi-muted mt-2 text-sm">{client.type === 'seller' ? 'Собственник' : 'Покупатель'} · {client.phone || 'Телефон не указан'}</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={archiveQuery.mutationPending} onClick={() => void restoreClient(client.id)} className="lumi-accent-soft inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold disabled:opacity-60"><RotateCcw className="h-4 w-4" />Вернуть</button><button type="button" disabled={archiveQuery.mutationPending} onClick={() => void trashClient(client.id)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-500/15 px-3 py-2.5 text-sm font-semibold text-red-400 disabled:opacity-60"><Trash2 className="h-4 w-4" />В корзину</button></div></article>)}</div> : <Empty text="В архиве нет клиентов" />}
  </div>
}

const Empty = ({ text }: { text: string }) => <div className="lumi-panel-muted lumi-muted flex flex-col items-center rounded-2xl border border-dashed py-20"><Archive className="mb-4 h-14 w-14" /><p className="lumi-text font-semibold">{text}</p></div>

export default ArchivePage
