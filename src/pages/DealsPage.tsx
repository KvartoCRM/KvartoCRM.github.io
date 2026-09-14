import { useMemo, useState } from 'react'
import { BriefcaseBusiness, Building2, CircleDollarSign, Edit, FileText, ListChecks, Plus, Trash2, TrendingUp, Users } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useContacts } from '../hooks/useContacts'
import { useDeals } from '../hooks/useDeals'
import { useDealProperties } from '../hooks/usePropertyCatalog'
import { formatMoney } from '../lib/dealFinance'
import { participantIdsWithLegacyFallback } from '../lib/dealParticipants'
import { dealPropertyOptions } from '../lib/dealPropertySelection'
import Modal from '../components/Modal'
import type { Deal } from '../types'
import type { ContactSummary } from '../lib/contacts'

type DealFormData = {
  propertyId: string
  buyerIds: string[]
  ownerIds: string[]
  price: number | undefined
  agencyIncome: number | undefined
  agentIncome: number | undefined
  expenses: number | undefined
  stage: NonNullable<Deal['stage']>
  lossReason: string
  checklist: NonNullable<Deal['checklist']>
  status: Deal['status']
  notes: string
}

type DealClient = ContactSummary

const emptyForm: DealFormData = {
  propertyId: '',
  buyerIds: [''],
  ownerIds: [''],
  price: undefined,
  agencyIncome: undefined,
  agentIncome: undefined,
  expenses: undefined,
  stage: 'preparation',
  lossReason: '',
  checklist: [],
  status: 'active',
  notes: '',
}

const clientName = (client?: DealClient) => client
  ? [client.lastName, client.firstName].filter(Boolean).join(' ') || client.phone || 'Без имени'
  : 'Не выбран'

const DealsPage = () => {
  const { user } = useAuth()
  const dealsQuery = useDeals(user?.id)
  const propertyQuery = useDealProperties(user?.id)
  const contactsQuery = useContacts(user?.id)
  const deals = dealsQuery.data || []
  const properties = propertyQuery.data || []
  const clients = contactsQuery.data || []
  const loading = dealsQuery.isLoading || propertyQuery.isLoading || contactsQuery.isLoading
  const loadError = dealsQuery.error || propertyQuery.error || contactsQuery.error
  const [actionError, setActionError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [formData, setFormData] = useState<DealFormData>(emptyForm)

  const buyers = useMemo(
    () => clients.filter(client => client.roles.includes('buyer') || client.roles.includes('tenant')),
    [clients],
  )
  const owners = useMemo(
    () => clients.filter(client => client.roles.includes('seller') || client.roles.includes('landlord')),
    [clients],
  )
  const selectableProperties = useMemo(
    () => dealPropertyOptions(properties, editingDeal?.propertyId),
    [editingDeal?.propertyId, properties],
  )

  const openModal = (deal?: Deal) => {
    setActionError('')
    setEditingDeal(deal ?? null)
    setFormData(deal ? {
      propertyId: deal.propertyId,
      buyerIds: participantIdsWithLegacyFallback(deal.buyerIds, deal.buyerId).length > 0 ? participantIdsWithLegacyFallback(deal.buyerIds, deal.buyerId) : [''],
      ownerIds: participantIdsWithLegacyFallback(deal.ownerIds, deal.ownerId || properties.find(property => property.id === deal.propertyId)?.ownerId).length > 0
        ? participantIdsWithLegacyFallback(deal.ownerIds, deal.ownerId || properties.find(property => property.id === deal.propertyId)?.ownerId)
        : [''],
      price: deal.price,
      agencyIncome: deal.agencyIncome,
      agentIncome: deal.agentIncome,
      expenses: deal.expenses,
      stage: deal.stage || 'preparation',
      lossReason: deal.lossReason || '',
      checklist: deal.checklist || [],
      status: deal.status,
      notes: deal.notes || '',
    } : emptyForm)
    setIsModalOpen(true)
  }

  const handlePropertyChange = (propertyId: string) => {
    const property = properties.find(item => item.id === propertyId)
    setFormData(current => ({
      ...current,
      propertyId,
      ownerIds: property?.ownerId && !current.ownerIds.some(Boolean) ? [property.ownerId] : current.ownerIds,
      price: current.price ?? property?.price ?? undefined,
    }))
  }

  const addParticipant = (field: 'buyerIds' | 'ownerIds') => {
    setFormData(current => ({ ...current, [field]: [...current[field], ''] }))
  }

  const changeParticipant = (field: 'buyerIds' | 'ownerIds', index: number, clientId: string) => {
    setFormData(current => ({ ...current, [field]: current[field].map((value, itemIndex) => itemIndex === index ? clientId : value) }))
  }

  const removeParticipant = (field: 'buyerIds' | 'ownerIds', index: number) => {
    setFormData(current => ({ ...current, [field]: current[field].filter((_, itemIndex) => itemIndex !== index) }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return
    setActionError('')
    try {
      const buyerIds = [...new Set(formData.buyerIds.filter(Boolean))]
      const ownerIds = [...new Set(formData.ownerIds.filter(Boolean))]
      if (buyerIds.length === 0 || ownerIds.length === 0) throw new Error('Выберите хотя бы одного покупателя и одного собственника')
      await dealsQuery.saveDeal({
        propertyId: formData.propertyId,
        buyerIds,
        ownerIds,
        price: formData.price,
        agencyIncome: formData.agencyIncome,
        agentIncome: formData.agentIncome,
        expenses: formData.expenses,
        stage: formData.stage,
        lossReason: formData.lossReason || undefined,
        checklist: formData.checklist,
        status: formData.status,
        notes: formData.notes || undefined,
      }, editingDeal?.id)

      setIsModalOpen(false)
      setEditingDeal(null)
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить сделку')
    }
  }

  const handleRemoveDeal = async (deal: Deal) => {
    if (!user) return
    setActionError('')
    try {
      await dealsQuery.removeDeal(deal.id)
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить сделку')
    }
  }

  const statusLabel: Record<Deal['status'], string> = {
    pending: 'Подготовка',
    active: 'Активна',
    closed: 'Закрыта',
    cancelled: 'Отменена',
  }
  const statusClass: Record<Deal['status'], string> = {
    pending: 'bg-amber-500/15 text-amber-500',
    active: 'bg-emerald-500/15 text-emerald-500',
    closed: 'lumi-accent-soft',
    cancelled: 'bg-red-500/15 text-red-500',
  }
  const stageLabel: Record<NonNullable<Deal['stage']>, string> = {
    preparation: 'Подготовка',
    documents: 'Документы',
    approval: 'Согласование',
    registration: 'Регистрация',
    settlement: 'Расчёты',
    completed: 'Завершена',
    lost: 'Потеряна',
  }
  const closedDeals = deals.filter(deal => deal.status === 'closed').length
  const lostDeals = deals.filter(deal => deal.status === 'cancelled' || deal.stage === 'lost').length
  const conversionBase = closedDeals + lostDeals
  const conversion = conversionBase > 0 ? Math.round((closedDeals / conversionBase) * 100) : 0
  const totalExpenses = deals.reduce((sum, deal) => sum + (deal.expenses || 0), 0)
  const expectedAgentIncome = deals.reduce((sum, deal) => sum + (deal.agentIncome || 0) - (deal.expenses || 0), 0)
  const stageCounts = Object.entries(stageLabel).map(([stage, label]) => ({
    stage: stage as NonNullable<Deal['stage']>,
    label,
    count: deals.filter(deal => (deal.stage || 'preparation') === stage).length,
  }))
  const maxStageCount = Math.max(1, ...stageCounts.map(item => item.count))

  const addChecklistItem = () => setFormData(current => ({
    ...current,
    checklist: [...current.checklist, { id: crypto.randomUUID(), title: '', completed: false }],
  }))

  const updateChecklistItem = (id: string, patch: Partial<NonNullable<Deal['checklist']>[number]>) => setFormData(current => ({
    ...current,
    checklist: current.checklist.map(item => item.id === id ? { ...item, ...patch } : item),
  }))

  const removeChecklistItem = (id: string) => setFormData(current => ({
    ...current,
    checklist: current.checklist.filter(item => item.id !== id),
  }))

  const changeDealStatus = (status: Deal['status']) => setFormData(current => ({
    ...current,
    status,
    stage: status === 'closed' ? 'completed' : status === 'cancelled' ? 'lost' : current.stage === 'completed' || current.stage === 'lost' ? 'preparation' : current.stage,
  }))

  const changeDealStage = (stage: NonNullable<Deal['stage']>) => setFormData(current => ({
    ...current,
    stage,
    status: stage === 'completed' ? 'closed' : stage === 'lost' ? 'cancelled' : current.status === 'closed' || current.status === 'cancelled' ? 'active' : current.status,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="lumi-text text-3xl font-bold">Сделки</h1>
          <p className="lumi-muted mt-1 text-sm">Объекты и участники выбираются из вашей рабочей базы.</p>
        </div>
        <button type="button" onClick={() => openModal()} className="lumi-gradient-button flex items-center gap-2 rounded-xl px-5 py-3 font-semibold">
          <Plus className="h-5 w-5" />Новая сделка
        </button>
      </div>

      {(actionError || loadError) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400"><span>{actionError || (loadError instanceof Error ? loadError.message : 'Не удалось загрузить сделки')}</span>{loadError && <button type="button" onClick={() => void Promise.all([dealsQuery.refetch(), propertyQuery.refetch(), contactsQuery.refetch()])} className="font-semibold underline">Повторить</button>}</div>}
      {!loading && deals.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="lumi-panel rounded-2xl border p-4"><TrendingUp className="lumi-accent-text h-5 w-5" /><p className="lumi-muted mt-3 text-xs">Конверсия закрытия</p><p className="lumi-text mt-1 text-2xl font-bold">{conversion}%</p></div>
            <div className="lumi-panel rounded-2xl border p-4"><BriefcaseBusiness className="lumi-accent-text h-5 w-5" /><p className="lumi-muted mt-3 text-xs">Закрыто / потеряно</p><p className="lumi-text mt-1 text-2xl font-bold">{closedDeals} / {lostDeals}</p></div>
            <div className="lumi-panel rounded-2xl border p-4"><CircleDollarSign className="lumi-accent-text h-5 w-5" /><p className="lumi-muted mt-3 text-xs">Расходы</p><p className="lumi-text mt-1 text-xl font-bold">{formatMoney(totalExpenses)}</p></div>
            <div className="lumi-panel rounded-2xl border p-4"><CircleDollarSign className="lumi-accent-text h-5 w-5" /><p className="lumi-muted mt-3 text-xs">Прогноз чистого дохода</p><p className="lumi-text mt-1 text-xl font-bold">{formatMoney(expectedAgentIncome)}</p></div>
          </div>
          <section className="lumi-panel rounded-2xl border p-5">
            <h2 className="lumi-text font-semibold">Воронка сделок</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stageCounts.map(item => <div key={item.stage} className="lumi-panel-muted rounded-xl border p-3"><div className="flex items-center justify-between gap-3 text-sm"><span className="lumi-muted-strong">{item.label}</span><strong className="lumi-text">{item.count}</strong></div><div className="lumi-control mt-2 h-1.5 overflow-hidden rounded-full"><div className="h-full rounded-full bg-[var(--lumi-accent)]" style={{ width: `${item.count / maxStageCount * 100}%` }} /></div></div>)}</div>
          </section>
        </>
      )}
      {loading ? (
        <div className="lumi-muted py-20 text-center">Загружаем сделки…</div>
      ) : deals.length === 0 ? (
        <div className="lumi-panel lumi-muted flex flex-col items-center justify-center rounded-2xl border py-20 text-center">
          <FileText className="mb-4 h-16 w-16" />
          <p className="lumi-text text-lg font-medium">Сделок пока нет</p>
          <p className="mt-2 text-sm">Создайте сделку и свяжите объект с клиентами</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {deals.map((deal, index) => {
            const property = properties.find(item => item.id === deal.propertyId)
            const dealBuyers = participantIdsWithLegacyFallback(deal.buyerIds, deal.buyerId).map(id => buyers.find(item => item.id === id)).filter((client): client is DealClient => Boolean(client))
            const dealOwners = participantIdsWithLegacyFallback(deal.ownerIds, deal.ownerId || property?.ownerId).map(id => owners.find(item => item.id === id)).filter((client): client is DealClient => Boolean(client))
            return (
              <motion.article key={deal.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.025 }} className="lumi-panel rounded-2xl border p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="lumi-text truncate text-lg font-semibold">{property?.address || 'Объект не найден'}</p>
                    <p className="lumi-text mt-1 text-2xl font-bold">{formatMoney(deal.price)}</p>
                    <p className="lumi-muted mt-1 text-xs">Итоговая стоимость объекта</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusClass[deal.status]}`}>{statusLabel[deal.status]}</span>
                </div>
                <div className="lumi-muted mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="lumi-accent-soft rounded-full px-3 py-1 font-medium">Этап: {stageLabel[deal.stage || 'preparation']}</span>{deal.checklist && deal.checklist.length > 0 && <span>{deal.checklist.filter(item => item.completed).length} из {deal.checklist.length} пунктов</span>}</div>
                <div className="mt-5 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="lumi-panel-muted rounded-xl border p-3"><p className="lumi-muted text-xs">Приход агентства</p><p className="lumi-text mt-1 font-semibold">{formatMoney(deal.agencyIncome)}</p></div>
                    <div className="lumi-panel-muted rounded-xl border p-3"><p className="lumi-muted text-xs">Доход агента</p><p className="lumi-text mt-1 font-semibold">{formatMoney(deal.agentIncome)}</p></div>
                    <div className="lumi-panel-muted rounded-xl border p-3"><p className="lumi-muted text-xs">Расходы</p><p className="lumi-text mt-1 font-semibold">{formatMoney(deal.expenses)}</p></div>
                  </div>
                  <div className="lumi-panel-muted flex items-center gap-3 rounded-xl border p-3"><Building2 className="lumi-accent-text h-4 w-4" /><span className="lumi-muted-strong text-sm">{property?.address || 'Объект не найден'}</span></div>
                  <div className="lumi-panel-muted flex items-start gap-3 rounded-xl border p-3"><Users className="lumi-accent-text mt-0.5 h-4 w-4 shrink-0" /><span className="lumi-muted-strong text-sm">Покупатели: {dealBuyers.length > 0 ? dealBuyers.map(clientName).join(', ') : 'Не выбраны'}</span></div>
                  <div className="lumi-panel-muted flex items-start gap-3 rounded-xl border p-3"><Users className="lumi-accent-text mt-0.5 h-4 w-4 shrink-0" /><span className="lumi-muted-strong text-sm">Собственники: {dealOwners.length > 0 ? dealOwners.map(clientName).join(', ') : 'Не выбраны'}</span></div>
                  {deal.lossReason && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">Причина потери: {deal.lossReason}</div>}
                  {deal.notes && <p className="lumi-muted whitespace-pre-wrap text-sm">{deal.notes}</p>}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => openModal(deal)} className="lumi-control rounded-lg p-2" aria-label="Редактировать сделку"><Edit className="h-4 w-4" /></button>
                  <button type="button" onClick={() => void handleRemoveDeal(deal)} className="rounded-lg bg-red-500/10 p-2 text-red-500" aria-label="Удалить сделку"><Trash2 className="h-4 w-4" /></button>
                </div>
              </motion.article>
            )
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingDeal ? 'Редактировать сделку' : 'Новая сделка'}>
        <form onSubmit={event => void handleSubmit(event)} className="space-y-5">
          {(selectableProperties.length === 0 || buyers.length === 0 || owners.length === 0) && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              Для сделки нужны объект, покупатель и собственник. Создайте отсутствующие карточки в соответствующих разделах.
            </div>
          )}
          <div>
            <label className="lumi-muted-strong mb-2 block text-sm font-medium">Объект *</label>
            <select required value={formData.propertyId} onChange={event => handlePropertyChange(event.target.value)} className="lumi-control w-full rounded-xl px-4 py-3 outline-none">
              <option value="">Выберите объект</option>
              {selectableProperties.map(property => <option key={property.id} value={property.id}>{property.address}{property.status === 'archived' ? ' · Архив' : ''}</option>)}
            </select>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3"><label className="lumi-muted-strong text-sm font-medium">Покупатели *</label><button type="button" onClick={() => addParticipant('buyerIds')} className="lumi-accent-text flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold"><Plus className="h-4 w-4" />Добавить</button></div>
            <div className="space-y-2">{formData.buyerIds.map((buyerId, index) => <div key={index} className="flex items-center gap-2"><select required value={buyerId} onChange={event => changeParticipant('buyerIds', index, event.target.value)} className="lumi-control min-w-0 flex-1 rounded-xl px-4 py-3 outline-none"><option value="">Выберите покупателя</option>{buyers.map(buyer => <option key={buyer.id} value={buyer.id} disabled={buyer.id !== buyerId && formData.buyerIds.includes(buyer.id)}>{clientName(buyer)}{buyer.phone ? ` · ${buyer.phone}` : ''}</option>)}</select>{formData.buyerIds.length > 1 && <button type="button" onClick={() => removeParticipant('buyerIds', index)} className="rounded-xl bg-red-500/10 p-3 text-red-500" aria-label={`Удалить покупателя ${index + 1}`}><Trash2 className="h-5 w-5" /></button>}</div>)}</div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3"><label className="lumi-muted-strong text-sm font-medium">Собственники *</label><button type="button" onClick={() => addParticipant('ownerIds')} className="lumi-accent-text flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold"><Plus className="h-4 w-4" />Добавить</button></div>
            <div className="space-y-2">{formData.ownerIds.map((ownerId, index) => <div key={index} className="flex items-center gap-2"><select required value={ownerId} onChange={event => changeParticipant('ownerIds', index, event.target.value)} className="lumi-control min-w-0 flex-1 rounded-xl px-4 py-3 outline-none"><option value="">Выберите собственника</option>{owners.map(owner => <option key={owner.id} value={owner.id} disabled={owner.id !== ownerId && formData.ownerIds.includes(owner.id)}>{clientName(owner)}{owner.phone ? ` · ${owner.phone}` : ''}</option>)}</select>{formData.ownerIds.length > 1 && <button type="button" onClick={() => removeParticipant('ownerIds', index)} className="rounded-xl bg-red-500/10 p-3 text-red-500" aria-label={`Удалить собственника ${index + 1}`}><Trash2 className="h-5 w-5" /></button>}</div>)}</div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="lumi-muted-strong mb-2 flex min-h-10 items-end text-sm font-medium">Итоговая стоимость объекта *</label>
              <input type="number" required min="0" step="any" value={formData.price ?? ''} onChange={event => setFormData(current => ({ ...current, price: event.target.value ? Number(event.target.value) : undefined }))} className="lumi-control w-full rounded-xl px-4 py-3 outline-none" placeholder="0" />
            </div>
            <div>
              <label className="lumi-muted-strong mb-2 flex min-h-10 items-end text-sm font-medium">Приход агентства</label>
              <input type="number" min="0" step="any" value={formData.agencyIncome ?? ''} onChange={event => setFormData(current => ({ ...current, agencyIncome: event.target.value ? Number(event.target.value) : undefined }))} className="lumi-control w-full rounded-xl px-4 py-3 outline-none" placeholder="0" />
            </div>
            <div>
              <label className="lumi-muted-strong mb-2 flex min-h-10 items-end text-sm font-medium">Доход агента</label>
              <input type="number" min="0" step="any" value={formData.agentIncome ?? ''} onChange={event => setFormData(current => ({ ...current, agentIncome: event.target.value ? Number(event.target.value) : undefined }))} className="lumi-control w-full rounded-xl px-4 py-3 outline-none" placeholder="0" />
            </div>
            <div>
              <label className="lumi-muted-strong mb-2 flex min-h-10 items-end text-sm font-medium">Расходы</label>
              <input type="number" min="0" step="any" value={formData.expenses ?? ''} onChange={event => setFormData(current => ({ ...current, expenses: event.target.value ? Number(event.target.value) : undefined }))} className="lumi-control w-full rounded-xl px-4 py-3 outline-none" placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="lumi-muted-strong mb-2 block text-sm font-medium">Статус</label>
              <select value={formData.status} onChange={event => changeDealStatus(event.target.value as Deal['status'])} className="lumi-control w-full rounded-xl px-4 py-3 outline-none">
                {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="lumi-muted-strong mb-2 block text-sm font-medium">Этап сделки</label>
              <select value={formData.stage} onChange={event => changeDealStage(event.target.value as NonNullable<Deal['stage']>)} className="lumi-control w-full rounded-xl px-4 py-3 outline-none">
                {Object.entries(stageLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          {(formData.status === 'cancelled' || formData.stage === 'lost') && <div><label className="lumi-muted-strong mb-2 block text-sm font-medium">Причина потери</label><input value={formData.lossReason} onChange={event => setFormData(current => ({ ...current, lossReason: event.target.value }))} className="lumi-control w-full rounded-xl px-4 py-3 outline-none" placeholder="Почему сделка не состоялась" /></div>}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3"><label className="lumi-muted-strong flex items-center gap-2 text-sm font-medium"><ListChecks className="h-4 w-4" />Чек-лист сделки</label><button type="button" onClick={addChecklistItem} className="lumi-accent-text flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold"><Plus className="h-4 w-4" />Добавить</button></div>
            <div className="space-y-2">{formData.checklist.map((item, index) => <div key={item.id} className="flex items-center gap-2"><input type="checkbox" checked={item.completed} onChange={event => updateChecklistItem(item.id, { completed: event.target.checked })} className="h-5 w-5 rounded" aria-label={`Выполнить пункт ${index + 1}`} /><input required value={item.title} onChange={event => updateChecklistItem(item.id, { title: event.target.value })} className="lumi-control min-w-0 flex-1 rounded-xl px-4 py-3 outline-none" placeholder="Пункт чек-листа" /><button type="button" onClick={() => removeChecklistItem(item.id)} className="rounded-xl bg-red-500/10 p-3 text-red-500" aria-label={`Удалить пункт ${index + 1}`}><Trash2 className="h-5 w-5" /></button></div>)}</div>
          </div>
          <div>
            <label className="lumi-muted-strong mb-2 block text-sm font-medium">Заметки</label>
            <textarea value={formData.notes} onChange={event => setFormData(current => ({ ...current, notes: event.target.value }))} rows={4} className="lumi-control w-full resize-none rounded-xl px-4 py-3 outline-none" placeholder="Условия и договорённости по сделке" />
          </div>
          {actionError && <p className="text-sm text-red-500">{actionError}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button type="button" onClick={() => setIsModalOpen(false)} className="lumi-control flex-1 rounded-xl px-6 py-3 font-medium">Отмена</button>
            <button type="submit" disabled={dealsQuery.mutationPending || !selectableProperties.length || !buyers.length || !owners.length} className="lumi-gradient-button flex-1 rounded-xl px-6 py-3 font-semibold disabled:opacity-50"><BriefcaseBusiness className="mr-2 inline h-4 w-4" />{dealsQuery.mutationPending ? 'Сохраняем…' : editingDeal ? 'Сохранить' : 'Создать сделку'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default DealsPage
