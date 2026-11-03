import { localDate } from '../lib/contactPresentation'
import { useEffect, useState, type ReactNode } from 'react'
import { Building2, FileText, Home, MapPin, Megaphone, Plus, Settings2, Tag, Trash2, WalletCards, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Modal from './Modal'
import type { Client, Property } from '../types'
import { usePropertyCatalog, usePropertyDetails } from '../hooks/usePropertyCatalog'
import type { PropertyUpsertInput } from '../lib/propertyRecordMapping'
import { propertyOwnerShareError, type PropertyOwnerAssignment } from '../lib/propertyOwners'

interface PropertyFormProps {
  isOpen: boolean
  onClose: () => void
  property?: Property | null
  clients?: Client[]
}

type PropertyFormData = PropertyUpsertInput

type PropertyOwnerFormRow = {
  key: string
  relationId?: string
  clientId: string
  ownershipShare: string
}

type PropertyDetailsForm = {
  saleType: string
  firstSale: boolean
  auctionSale: boolean
  mortgageAllowed: boolean
  ownerPaysCommission: boolean
  sharedCommission: boolean
  onlineShowing: boolean
  rentalDuration: string
  availableFrom: string
  depositRequired: boolean
  depositAmount: string
  prepaymentMonths: string
  utilities: string
  meters: string
  ownerRentCommission: boolean
  tenantCommissionPercent: string
  tenantAgentCommissionPercent: string
  apartmentType: string
  ownershipShare: string
  apartmentLevels: string
  garbageChute: boolean
  sleepingPlaces: string
  airConditioner: boolean
  television: boolean
  washingMachine: boolean
  dishwasher: boolean
  refrigerator: boolean
  internet: boolean
  childrenAllowed: boolean
  petsAllowed: boolean
  priceUsd: string
  autoConvertCurrency: boolean
  negotiable: boolean
  liquidity: string
  marketPrice: string
  roomAreas: string
  livingArea: string
  kitchenArea: string
  hallwayArea: string
  ceilingHeight: string
  balconyType: string
  bathroomType: string
  windowView: string
  gas: string
  furniture: string
  cadastralNumber: string
  egrnDeliveryMethod: string
  adTitle: string
  region: string
  regionDistrict: string
  locality: string
  street: string
  houseNumber: string
  buildingBlock: string
  letter: string
  structureNumber: string
  apartmentNumber: string
  advertisingAddress: string
  complexName: string
  distanceFromCity: string
  latitude: string
  longitude: string
  developer: string
  residentialComplex: string
  houseType: string
  houseSeries: string
  newBuilding: boolean
  renovationYear: string
  serviceContract: string
  ownershipType: string
  privateNotes: string
  publicNotes: string
  excludeMls: boolean
  feedEnabled: boolean
  cianPrivate: boolean
  cianNoPackage: boolean
  callCenterComment: string
  transferReason: string
  documentSourceCard: string
  agentReward: string
  agencyReward: string
  executorReward: string
  workStartedOn: string
  clientRole: string
  linkedValuationId: string
  linkedInsuranceId: string
  linkedMortgageId: string
  linkedDealId: string
  linkedBuyerId: string
  linkedSellerId: string
  rentContractCity: string
  rentContractDate: string
  occupantsCount: string
  rentalOwnershipType: string
  ownersCount: string
  encumbrance: string
}

const emptyProperty: PropertyFormData = {
  address: '', listingType: 'sale', workStream: 'cold', propertyType: 'Квартира', sourceUrl: '', price: undefined, rooms: undefined,
  area: undefined, floor: undefined, totalFloors: undefined, status: 'available', ownerId: '',
  tags: [], description: '', constructionYear: undefined, repair: '', balcony: false,
  elevator: false, parking: false, heating: 'central', walls: '',
}

const emptyDetails: PropertyDetailsForm = {
  saleType: 'direct', firstSale: false, auctionSale: false, mortgageAllowed: false,
  ownerPaysCommission: false, sharedCommission: false, onlineShowing: false,
  rentalDuration: 'long_term', availableFrom: '', depositRequired: true, depositAmount: '', prepaymentMonths: '1',
  utilities: '', meters: '', ownerRentCommission: false, tenantCommissionPercent: '', tenantAgentCommissionPercent: '',
  apartmentType: 'standard', ownershipShare: '100', apartmentLevels: '1', garbageChute: false,
  sleepingPlaces: '', airConditioner: false, television: false, washingMachine: false,
  dishwasher: false, refrigerator: false, internet: false, childrenAllowed: false, petsAllowed: false,
  priceUsd: '', autoConvertCurrency: false, negotiable: false, liquidity: '', marketPrice: '',
  roomAreas: '', livingArea: '', kitchenArea: '', hallwayArea: '', ceilingHeight: '',
  balconyType: '', bathroomType: '', windowView: '', gas: '', furniture: '',
  cadastralNumber: '', egrnDeliveryMethod: '', adTitle: '', region: 'Курская обл.',
  regionDistrict: '', locality: '', street: '', houseNumber: '', buildingBlock: '', letter: '',
  structureNumber: '', apartmentNumber: '', advertisingAddress: '', complexName: '',
  distanceFromCity: '', latitude: '', longitude: '', developer: '', residentialComplex: '',
  houseType: '', houseSeries: '', newBuilding: false, renovationYear: '', serviceContract: '',
  ownershipType: '', privateNotes: '', publicNotes: '', excludeMls: false, feedEnabled: false,
  cianPrivate: false, cianNoPackage: false, callCenterComment: '', transferReason: '',
  documentSourceCard: '', agentReward: '', agencyReward: '', executorReward: '', clientRole: '', workStartedOn: '',
  linkedValuationId: '', linkedInsuranceId: '', linkedMortgageId: '', linkedDealId: '',
  linkedBuyerId: '', linkedSellerId: '',
  rentContractCity: '', rentContractDate: '', occupantsCount: '', rentalOwnershipType: '', ownersCount: '', encumbrance: '',
}

const inputClass = 'lumi-control mt-2 w-full rounded-xl px-4 py-3 outline-none transition focus:border-[var(--lumi-accent)] focus:ring-2 focus:ring-[rgb(var(--lumi-accent-rgb)/0.16)]'

const Field = ({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) => (
  <label className={`lumi-muted-strong flex min-w-0 flex-col text-sm font-medium ${className}`}>
    <span className="flex min-h-10 items-end">{label}</span>
    {children}
    {hint && <span className="lumi-muted mt-1 block text-xs font-normal">{hint}</span>}
  </label>
)

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) => (
  <label className="lumi-control flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium">
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-5 w-5 rounded" />
    {label}
  </label>
)

const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value)
const emptyOwnerRow = (ownershipShare = ''): PropertyOwnerFormRow => ({ key: crypto.randomUUID(), clientId: '', ownershipShare })

const PropertyForm = ({ isOpen, onClose, property, clients = [] }: PropertyFormProps) => {
  const { user } = useAuth()
  const { data: propertyCatalog, saveProperty } = usePropertyCatalog(user?.id)
  const { data: propertyDetails } = usePropertyDetails(user?.id, property?.id, isOpen)
  const [section, setSection] = useState('deal')
  const [formData, setFormData] = useState<PropertyFormData>(emptyProperty)
  const [details, setDetails] = useState<PropertyDetailsForm>(emptyDetails)
  const [ownerRows, setOwnerRows] = useState<PropertyOwnerFormRow[]>([emptyOwnerRow('100')])
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setSection('deal')
    if (!property) {
      setFormData(emptyProperty)
      setDetails(emptyDetails)
      setOwnerRows([emptyOwnerRow('100')])
      return
    }

    setFormData({
      address: property.address || '', listingType: property.listingType || 'sale', workStream: property.workStream || 'active', propertyType: property.propertyType || 'Квартира',
      sourceUrl: property.sourceUrl || '', price: property.price ?? undefined,
      rooms: property.rooms ?? undefined, area: property.area ?? undefined,
      floor: property.floor ?? undefined, totalFloors: property.totalFloors ?? undefined,
      status: property.status || 'available', ownerId: property.ownerId || '', tags: property.tags || [],
      description: property.description || '', constructionYear: property.constructionYear,
      repair: property.repair || '', balcony: property.balcony || false,
      elevator: property.elevator || false, parking: property.parking || false,
      heating: property.heating || 'central', walls: property.walls || '',
    })

    const savedOwners = propertyCatalog?.propertyOwners[property.id] || []
    const legacyOwners: PropertyOwnerAssignment[] = savedOwners.length ? savedOwners : property.ownerId
      ? [{ clientId: property.ownerId, ownershipShare: null, isPrimary: true }]
      : []
    setOwnerRows(legacyOwners.length ? legacyOwners.map(owner => ({
      key: owner.id || crypto.randomUUID(),
      relationId: owner.id,
      clientId: owner.clientId,
      ownershipShare: owner.ownershipShare == null ? '' : String(owner.ownershipShare),
    })) : [emptyOwnerRow('100')])

    if (propertyDetails) {
      const data = propertyDetails as Record<string, any>
      const linked = data.linked_cards as Record<string, string> || {}
      const publication = data.publication_settings as Record<string, boolean> || {}
      const service = data.service_fields as Record<string, string> || {}
      const rental = data.rental_terms as Record<string, any> || {}
      const rentalDeal = data.rental_deal_data as Record<string, any> || {}
      setDetails({
        saleType: data.sale_type || 'direct', firstSale: Boolean(data.first_sale), auctionSale: Boolean(data.auction_sale),
        mortgageAllowed: Boolean(data.mortgage_allowed), ownerPaysCommission: Boolean(data.owner_pays_commission),
        sharedCommission: Boolean(data.shared_commission), onlineShowing: Boolean(data.online_showing),
        rentalDuration: rental.duration || 'long_term', availableFrom: rental.available_from || '',
        depositRequired: rental.deposit_required ?? true, depositAmount: String(rental.deposit_amount ?? ''),
        prepaymentMonths: String(rental.prepayment_months ?? 1), utilities: rental.utilities || '', meters: rental.meters || '',
        ownerRentCommission: Boolean(rental.owner_commission), tenantCommissionPercent: String(rental.tenant_commission_percent ?? ''),
        tenantAgentCommissionPercent: String(rental.tenant_agent_commission_percent ?? ''),
        apartmentType: data.apartment_type || 'standard', ownershipShare: String(data.ownership_share ?? 100),
        apartmentLevels: String(data.apartment_levels ?? 1), garbageChute: Boolean(data.garbage_chute),
        sleepingPlaces: String(rental.sleeping_places ?? ''), airConditioner: Boolean(rental.air_conditioner),
        television: Boolean(rental.television), washingMachine: Boolean(rental.washing_machine), dishwasher: Boolean(rental.dishwasher),
        refrigerator: Boolean(rental.refrigerator), internet: Boolean(rental.internet),
        childrenAllowed: Boolean(rental.children_allowed), petsAllowed: Boolean(rental.pets_allowed),
        priceUsd: String(data.price_usd ?? ''), autoConvertCurrency: Boolean(data.auto_convert_currency),
        negotiable: Boolean(data.negotiable), liquidity: data.liquidity || '', marketPrice: String(data.market_price ?? ''),
        roomAreas: data.room_areas || '', livingArea: String(data.living_area ?? ''), kitchenArea: String(data.kitchen_area ?? ''),
        hallwayArea: String(data.hallway_area ?? ''), ceilingHeight: String(data.ceiling_height ?? ''),
        balconyType: data.balcony_type || '', bathroomType: data.bathroom_type || '', windowView: data.window_view || '',
        gas: data.gas || '', furniture: data.furniture || '', cadastralNumber: data.cadastral_number || '',
        egrnDeliveryMethod: data.egrn_delivery_method || '', adTitle: data.ad_title || '', region: data.region || 'Курская обл.',
        regionDistrict: data.region_district || '', locality: data.locality || '', street: data.street || '',
        houseNumber: data.house_number || '', buildingBlock: data.building_block || '', letter: data.letter || '',
        structureNumber: data.structure_number || '', apartmentNumber: data.apartment_number || '',
        advertisingAddress: data.advertising_address || '', complexName: data.complex_name || '',
        distanceFromCity: String(data.distance_from_city ?? ''), latitude: String(data.latitude ?? ''), longitude: String(data.longitude ?? ''),
        developer: data.developer || '', residentialComplex: data.residential_complex || '', houseType: data.house_type || '',
        houseSeries: data.house_series || '', newBuilding: Boolean(data.new_building), renovationYear: String(data.renovation_year ?? ''),
        serviceContract: data.service_contract || '', ownershipType: data.ownership_type || '', privateNotes: data.private_notes || '',
        publicNotes: data.public_notes || '', excludeMls: Boolean(publication.exclude_mls), feedEnabled: Boolean(publication.feed_enabled),
        cianPrivate: Boolean(publication.cian_private), cianNoPackage: Boolean(publication.cian_no_package),
        callCenterComment: service.call_center_comment || '', transferReason: service.transfer_reason || '',
        documentSourceCard: service.document_source_card || '', agentReward: service.agent_reward || '',
        agencyReward: service.agency_reward || '', executorReward: service.executor_reward || '', clientRole: service.client_role || '', workStartedOn: service.work_started_on || '',
        linkedValuationId: linked.valuation || '', linkedInsuranceId: linked.insurance || '', linkedMortgageId: linked.mortgage || '',
        linkedDealId: linked.deal || '', linkedBuyerId: linked.buyer || '', linkedSellerId: linked.seller || '',
        rentContractCity: rentalDeal.contract_city || '', rentContractDate: rentalDeal.contract_date || '',
        occupantsCount: String(rentalDeal.occupants_count ?? ''), rentalOwnershipType: rentalDeal.ownership_type || '',
        ownersCount: String(rentalDeal.owners_count ?? ''), encumbrance: rentalDeal.encumbrance || '',
      })
    } else {
      setDetails(emptyDetails)
    }
  }, [isOpen, property, propertyCatalog?.propertyOwners, propertyDetails])

  const updateProperty = <K extends keyof PropertyFormData>(key: K, value: PropertyFormData[K]) => setFormData(current => ({ ...current, [key]: value }))
  const updateDetails = <K extends keyof PropertyDetailsForm>(key: K, value: PropertyDetailsForm[K]) => setDetails(current => ({ ...current, [key]: value }))
  const availableOwners = (clients.length ? clients : propertyCatalog?.clients || []).filter(client => {
    const role = formData.listingType === 'rent' ? 'landlord' : 'seller'
    return client.type === 'seller' || client.roles?.includes(role) || ownerRows.some(owner => owner.clientId === client.id)
  })
  const updateOwnerRow = (key: string, patch: Partial<PropertyOwnerFormRow>) => setOwnerRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row))
  const removeOwnerRow = (key: string) => setOwnerRows(current => current.length > 1 ? current.filter(row => row.key !== key) : [emptyOwnerRow('100')])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return
    setSaving(true)
    const composedAddress = formData.address.trim() || [details.region, details.locality, details.street, details.houseNumber, details.apartmentNumber && `кв. ${details.apartmentNumber}`].filter(Boolean).join(', ')
    if (!composedAddress) {
      alert('Укажите адрес объекта')
      setSaving(false)
      return
    }

    const selectedRows = ownerRows.filter(row => row.clientId)
    if (new Set(selectedRows.map(row => row.clientId)).size !== selectedRows.length) {
      alert('Один собственник выбран несколько раз.')
      setSaving(false)
      return
    }
    const owners: PropertyOwnerAssignment[] = selectedRows.map((row, index) => ({
      id: row.relationId,
      clientId: row.clientId,
      ownershipShare: numberOrNull(row.ownershipShare),
      isPrimary: index === 0,
      roles: availableOwners.find(client => client.id === row.clientId)?.roles || [],
    }))
    const shareError = propertyOwnerShareError(owners)
    if (shareError) {
      alert(shareError)
      setSaving(false)
      return
    }

    const input = { ...formData, address: composedAddress, ownerId: owners[0]?.clientId || '' }
    const detailsPayload = {
        sale_type: details.saleType || null,
        first_sale: details.firstSale, auction_sale: details.auctionSale, mortgage_allowed: details.mortgageAllowed,
        owner_pays_commission: details.ownerPaysCommission, shared_commission: details.sharedCommission,
        online_showing: details.onlineShowing, apartment_type: details.apartmentType || null,
        ownership_share: numberOrNull(details.ownershipShare), apartment_levels: numberOrNull(details.apartmentLevels),
        garbage_chute: details.garbageChute, price_usd: numberOrNull(details.priceUsd),
        auto_convert_currency: details.autoConvertCurrency, negotiable: details.negotiable, liquidity: details.liquidity || null,
        market_price: numberOrNull(details.marketPrice), room_areas: details.roomAreas || null,
        living_area: numberOrNull(details.livingArea), kitchen_area: numberOrNull(details.kitchenArea),
        hallway_area: numberOrNull(details.hallwayArea), ceiling_height: numberOrNull(details.ceilingHeight),
        balcony_type: details.balconyType || null, bathroom_type: details.bathroomType || null,
        window_view: details.windowView || null, gas: details.gas || null, furniture: details.furniture || null,
        cadastral_number: details.cadastralNumber || null, egrn_delivery_method: details.egrnDeliveryMethod || null,
        ad_title: details.adTitle || null, region: details.region || null, region_district: details.regionDistrict || null,
        locality: details.locality || null, street: details.street || null, house_number: details.houseNumber || null,
        building_block: details.buildingBlock || null, letter: details.letter || null, structure_number: details.structureNumber || null,
        apartment_number: details.apartmentNumber || null, advertising_address: details.advertisingAddress || null,
        complex_name: details.complexName || null, distance_from_city: numberOrNull(details.distanceFromCity),
        latitude: numberOrNull(details.latitude), longitude: numberOrNull(details.longitude), developer: details.developer || null,
        residential_complex: details.residentialComplex || null, house_type: details.houseType || null,
        house_series: details.houseSeries || null, new_building: details.newBuilding,
        renovation_year: numberOrNull(details.renovationYear), service_contract: details.serviceContract || null,
        ownership_type: details.ownershipType || null, private_notes: details.privateNotes || null,
        public_notes: details.publicNotes || null,
        linked_cards: { valuation: details.linkedValuationId, insurance: details.linkedInsuranceId, mortgage: details.linkedMortgageId, deal: details.linkedDealId, buyer: details.linkedBuyerId, seller: details.linkedSellerId },
        publication_settings: { exclude_mls: details.excludeMls, feed_enabled: details.feedEnabled, cian_private: details.cianPrivate, cian_no_package: details.cianNoPackage },
        service_fields: { call_center_comment: details.callCenterComment, transfer_reason: details.transferReason, document_source_card: details.documentSourceCard, agent_reward: details.agentReward, agency_reward: details.agencyReward, executor_reward: details.executorReward, client_role: details.clientRole, work_started_on: details.workStartedOn },
        rental_terms: { duration: details.rentalDuration, available_from: details.availableFrom || null, deposit_required: details.depositRequired, deposit_amount: numberOrNull(details.depositAmount), prepayment_months: numberOrNull(details.prepaymentMonths), utilities: details.utilities, meters: details.meters, owner_commission: details.ownerRentCommission, tenant_commission_percent: numberOrNull(details.tenantCommissionPercent), tenant_agent_commission_percent: numberOrNull(details.tenantAgentCommissionPercent), sleeping_places: numberOrNull(details.sleepingPlaces), air_conditioner: details.airConditioner, television: details.television, washing_machine: details.washingMachine, dishwasher: details.dishwasher, refrigerator: details.refrigerator, internet: details.internet, children_allowed: details.childrenAllowed, pets_allowed: details.petsAllowed },
        rental_deal_data: { contract_city: details.rentContractCity, contract_date: details.rentContractDate || null, occupants_count: numberOrNull(details.occupantsCount), ownership_type: details.rentalOwnershipType, owners_count: numberOrNull(details.ownersCount), encumbrance: details.encumbrance },
    }

    try {
      await saveProperty(input, detailsPayload, property?.id, owners)
      onClose()
    } catch (error) {
      console.error('Property save failed:', error)
      alert(`Не удалось сохранить объект: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'deal', label: 'Сделка', icon: WalletCards }, { id: 'object', label: 'Объект', icon: Home },
    { id: 'address', label: 'Адрес', icon: MapPin }, { id: 'building', label: 'Здание', icon: Building2 },
    { id: 'advertising', label: 'Реклама', icon: Megaphone }, { id: 'service', label: 'Служебные', icon: Settings2 },
  ]

  const addTag = () => {
    const tag = newTag.trim()
    if (!tag || formData.tags.includes(tag)) return
    updateProperty('tags', [...formData.tags, tag]); setNewTag('')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={property ? 'Редактировать объект' : 'Новый объект'}>
      <form onSubmit={handleSubmit}>
        <div className="lumi-border mb-6 flex gap-2 overflow-x-auto border-b pb-3">
          {tabs.map(tab => { const Icon = tab.icon; return (
            <button key={tab.id} type="button" onClick={() => setSection(tab.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${section === tab.id ? 'lumi-accent-bg' : 'lumi-control'}`}>
              <Icon className="h-4 w-4" />{tab.label}
            </button>
          ) })}
        </div>

        <div className="min-h-[430px] space-y-5">
          {section === 'deal' && <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Операция"><select value={formData.listingType} onChange={e => updateProperty('listingType', e.target.value as 'sale' | 'rent')} className={inputClass}><option value="sale">Продажа</option><option value="rent">Аренда</option></select></Field>
              <Field label="Как работаем с объектом"><select value={formData.workStream} onChange={e => { updateProperty('workStream', e.target.value as 'active' | 'cold'); if(e.target.value==='active') updateDetails('workStartedOn',localDate()) }} className={inputClass}><option value="active">Мой объект в работе</option><option value="cold">Холодная база / пока только звонки</option></select></Field>
              {formData.workStream==='active'&&<Field label="Дата принятия в работу"><input type="date" max={localDate()} value={details.workStartedOn} onChange={e=>updateDetails('workStartedOn',e.target.value)} className={inputClass}/><p className="lumi-muted mt-1 text-xs">Для старых объектов укажите известную дату. Неизвестная дата не попадёт в отчёт за период.</p></Field>}
              <Field label="Статус"><select value={formData.status} onChange={e => updateProperty('status', e.target.value as Property['status'])} className={inputClass}><option value="available">В продаже</option><option value="reserved">Забронирован</option><option value="sold">Продан</option><option value="archived">Архив</option></select></Field>
              <Field label="Тип продажи"><select value={details.saleType} onChange={e => updateDetails('saleType', e.target.value)} className={inputClass}><option value="direct">Свободная (прямая)</option><option value="alternative">Альтернативная</option><option value="assignment">Переуступка</option></select></Field>
              <Field label="Источник объявления" className="md:col-span-2"><input value={formData.sourceUrl} onChange={e => updateProperty('sourceUrl', e.target.value)} className={inputClass} placeholder="Ссылка на исходное объявление" /></Field>
            </div>
            <div className="lumi-panel-muted rounded-2xl border p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h4 className="lumi-text font-semibold">Собственники и доли</h4><p className="lumi-muted mt-1 text-sm">Первый в списке считается основным. Долю можно оставить пустой.</p></div>
                <button type="button" onClick={() => setOwnerRows(current => [...current, emptyOwnerRow()])} className="lumi-accent-bg flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"><Plus className="h-4 w-4" />Добавить</button>
              </div>
              <div className="mt-4 space-y-3">
                {ownerRows.map((row, index) => (
                  <div key={row.key} className="lumi-panel grid grid-cols-1 items-start gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
                    <Field label={index === 0 ? 'Основной собственник' : `Собственник ${index + 1}`}>
                      <select value={row.clientId} onChange={event => updateOwnerRow(row.key, { clientId: event.target.value })} className={inputClass}>
                        <option value="">Не выбрано</option>
                        {availableOwners.map(owner => <option key={owner.id} value={owner.id} disabled={owner.id !== row.clientId && ownerRows.some(candidate => candidate.clientId === owner.id)}>{owner.lastName} {owner.firstName} {owner.middleName || ''}{owner.phone ? ` · ${owner.phone}` : ''}</option>)}
                      </select>
                    </Field>
                    <Field label="Доля, %" hint="Необязательно"><input type="number" min="0" max="100" step="0.01" value={row.ownershipShare} onChange={event => updateOwnerRow(row.key, { ownershipShare: event.target.value })} className={inputClass} placeholder="Не указана" /></Field>
                    <button type="button" onClick={() => removeOwnerRow(row.key)} className="rounded-xl bg-red-500/10 p-3 text-red-500 disabled:cursor-not-allowed disabled:opacity-40 sm:mt-12" disabled={ownerRows.length === 1} aria-label={`Удалить собственника ${index + 1}`}><Trash2 className="h-5 w-5" /></button>
                  </div>
                ))}
              </div>
            </div>
            {formData.listingType === 'rent' && <div className="lumi-panel-muted rounded-2xl border p-5"><h4 className="lumi-text mb-4 font-semibold">Условия аренды</h4><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label="Срок аренды"><select value={details.rentalDuration} onChange={e => updateDetails('rentalDuration', e.target.value)} className={inputClass}><option value="long_term">Долгосрочная</option><option value="short_term">Краткосрочная</option><option value="daily">Посуточная</option></select></Field><Field label="Готов к сдаче с"><input type="date" value={details.availableFrom} onChange={e => updateDetails('availableFrom', e.target.value)} className={inputClass} /></Field><Field label="Размер залога, ₽"><input type="number" value={details.depositAmount} onChange={e => updateDetails('depositAmount', e.target.value)} className={inputClass} /></Field><Field label="Предоплата, месяцев"><input type="number" min="0" value={details.prepaymentMonths} onChange={e => updateDetails('prepaymentMonths', e.target.value)} className={inputClass} /></Field><Field label="Коммунальные услуги"><input value={details.utilities} onChange={e => updateDetails('utilities', e.target.value)} className={inputClass} placeholder="Включены / отдельно" /></Field><Field label="Оплата счётчиков"><input value={details.meters} onChange={e => updateDetails('meters', e.target.value)} className={inputClass} /></Field><Field label="Комиссия с арендатора, %"><input type="number" value={details.tenantCommissionPercent} onChange={e => updateDetails('tenantCommissionPercent', e.target.value)} className={inputClass} /></Field><Field label="Доля комиссии агенту, %"><input type="number" value={details.tenantAgentCommissionPercent} onChange={e => updateDetails('tenantAgentCommissionPercent', e.target.value)} className={inputClass} /></Field></div><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"><Toggle label="Залог предусмотрен" checked={details.depositRequired} onChange={v => updateDetails('depositRequired', v)} /><Toggle label="Собственник платит комиссию" checked={details.ownerRentCommission} onChange={v => updateDetails('ownerRentCommission', v)} /></div></div>}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><Toggle label="Продаётся первый раз" checked={details.firstSale} onChange={v => updateDetails('firstSale', v)} /><Toggle label="Продажа по методике «Аукцион»" checked={details.auctionSale} onChange={v => updateDetails('auctionSale', v)} /><Toggle label="Возможна ипотека" checked={details.mortgageAllowed} onChange={v => updateDetails('mortgageAllowed', v)} /><Toggle label="Собственник платит комиссию" checked={details.ownerPaysCommission} onChange={v => updateDetails('ownerPaysCommission', v)} /><Toggle label="Готов делиться комиссией" checked={details.sharedCommission} onChange={v => updateDetails('sharedCommission', v)} /><Toggle label="Возможен онлайн-показ" checked={details.onlineShowing} onChange={v => updateDetails('onlineShowing', v)} /></div>
          </>}

          {section === 'object' && <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Тип объекта"><select value={formData.propertyType} onChange={e => updateProperty('propertyType', e.target.value)} className={inputClass}><option>Квартира</option><option>Комната</option><option>Дом</option><option>Участок</option><option>Коммерческая недвижимость</option></select></Field>
              <Field label="Вид квартиры"><select value={details.apartmentType} onChange={e => updateDetails('apartmentType', e.target.value)} className={inputClass}><option value="standard">Стандартная</option><option value="studio">Студия</option><option value="euro">Евроформат</option><option value="free">Свободная планировка</option></select></Field>
              <Field label="Количество комнат"><input type="number" min="0" value={formData.rooms ?? ''} onChange={e => updateProperty('rooms', e.target.value ? Number(e.target.value) : undefined)} className={inputClass} /></Field>
              <Field label="Продаваемая доля объекта, %"><input type="number" min="0" max="100" value={details.ownershipShare} onChange={e => updateDetails('ownershipShare', e.target.value)} className={inputClass} /></Field>
              <Field label="Этажей в квартире"><input type="number" min="1" value={details.apartmentLevels} onChange={e => updateDetails('apartmentLevels', e.target.value)} className={inputClass} /></Field>
              <Field label="Этаж / всего"><div className="grid grid-cols-2 gap-2"><input type="number" value={formData.floor ?? ''} onChange={e => updateProperty('floor', e.target.value ? Number(e.target.value) : undefined)} className={inputClass} /><input type="number" value={formData.totalFloors ?? ''} onChange={e => updateProperty('totalFloors', e.target.value ? Number(e.target.value) : undefined)} className={inputClass} /></div></Field>
              <Field label="Стоимость, ₽"><input type="number" min="0" value={formData.price ?? ''} onChange={e => updateProperty('price', e.target.value ? Number(e.target.value) : undefined)} className={inputClass} /></Field>
              <Field label="Стоимость, $"><input type="number" min="0" value={details.priceUsd} onChange={e => updateDetails('priceUsd', e.target.value)} className={inputClass} /></Field>
              <Field label="Рыночная цена, ₽"><input type="number" min="0" value={details.marketPrice} onChange={e => updateDetails('marketPrice', e.target.value)} className={inputClass} /></Field>
              <Field label="Площадь общая, м²"><input type="number" step="0.1" value={formData.area ?? ''} onChange={e => updateProperty('area', e.target.value ? Number(e.target.value) : undefined)} className={inputClass} /></Field>
              <Field label="Площадь комнат" hint="Через +, например 20+12+23"><input value={details.roomAreas} onChange={e => updateDetails('roomAreas', e.target.value)} className={inputClass} placeholder="20+12+23" /></Field>
              <Field label="Площадь жилая, м²"><input type="number" step="0.1" value={details.livingArea} onChange={e => updateDetails('livingArea', e.target.value)} className={inputClass} /></Field>
              <Field label="Площадь кухни, м²"><input type="number" step="0.1" value={details.kitchenArea} onChange={e => updateDetails('kitchenArea', e.target.value)} className={inputClass} /></Field>
              <Field label="Площадь прихожей, м²"><input type="number" step="0.1" value={details.hallwayArea} onChange={e => updateDetails('hallwayArea', e.target.value)} className={inputClass} /></Field>
              <Field label="Высота потолков, м"><input type="number" step="0.01" value={details.ceilingHeight} onChange={e => updateDetails('ceilingHeight', e.target.value)} className={inputClass} /></Field>
              <Field label="Балкон / лоджия"><select value={details.balconyType} onChange={e => { updateDetails('balconyType', e.target.value); updateProperty('balcony', Boolean(e.target.value)) }} className={inputClass}><option value="">Не выбрано</option><option value="balcony">Балкон</option><option value="loggia">Лоджия</option><option value="both">Балкон и лоджия</option></select></Field>
              <Field label="Санузел"><select value={details.bathroomType} onChange={e => updateDetails('bathroomType', e.target.value)} className={inputClass}><option value="">Не выбрано</option><option value="combined">Совмещённый</option><option value="separate">Раздельный</option><option value="multiple">Несколько</option></select></Field>
              <Field label="Парковка"><select value={formData.parking ? 'yes' : ''} onChange={e => updateProperty('parking', e.target.value === 'yes')} className={inputClass}><option value="">Не выбрано</option><option value="yes">Есть</option></select></Field>
              <Field label="Отопление"><select value={formData.heating} onChange={e => updateProperty('heating', e.target.value)} className={inputClass}><option value="central">Центральное</option><option value="autonomous">Автономное</option><option value="electric">Электрическое</option></select></Field>
              <Field label="Вид из окон"><input value={details.windowView} onChange={e => updateDetails('windowView', e.target.value)} className={inputClass} /></Field>
              <Field label="Ремонт"><input value={formData.repair} onChange={e => updateProperty('repair', e.target.value)} className={inputClass} placeholder="Косметический, дизайнерский…" /></Field>
              <Field label="Газ"><input value={details.gas} onChange={e => updateDetails('gas', e.target.value)} className={inputClass} /></Field>
              <Field label="Мебель"><input value={details.furniture} onChange={e => updateDetails('furniture', e.target.value)} className={inputClass} /></Field>
              <Field label="Ликвидность"><input value={details.liquidity} onChange={e => updateDetails('liquidity', e.target.value)} className={inputClass} /></Field>
              <Field label="Кадастровый номер"><input value={details.cadastralNumber} onChange={e => updateDetails('cadastralNumber', e.target.value)} className={inputClass} placeholder="46:00:000000:000" /></Field>
              <Field label="Формат отправки ЕГРН"><input value={details.egrnDeliveryMethod} onChange={e => updateDetails('egrnDeliveryMethod', e.target.value)} className={inputClass} /></Field>
            </div>
            {formData.listingType === 'rent' && <div className="lumi-panel-muted rounded-2xl border p-5"><h4 className="lumi-text mb-4 font-semibold">Оснащение и ограничения аренды</h4><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label="Спальных мест"><input type="number" value={details.sleepingPlaces} onChange={e => updateDetails('sleepingPlaces', e.target.value)} className={inputClass} /></Field><Toggle label="Кондиционер" checked={details.airConditioner} onChange={v => updateDetails('airConditioner', v)} /><Toggle label="Телевизор" checked={details.television} onChange={v => updateDetails('television', v)} /><Toggle label="Стиральная машина" checked={details.washingMachine} onChange={v => updateDetails('washingMachine', v)} /><Toggle label="Посудомоечная машина" checked={details.dishwasher} onChange={v => updateDetails('dishwasher', v)} /><Toggle label="Холодильник" checked={details.refrigerator} onChange={v => updateDetails('refrigerator', v)} /><Toggle label="Интернет" checked={details.internet} onChange={v => updateDetails('internet', v)} /><Toggle label="Можно с детьми" checked={details.childrenAllowed} onChange={v => updateDetails('childrenAllowed', v)} /><Toggle label="Можно с животными" checked={details.petsAllowed} onChange={v => updateDetails('petsAllowed', v)} /></div></div>}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3"><Toggle label="Возможен торг" checked={details.negotiable} onChange={v => updateDetails('negotiable', v)} /><Toggle label="Мусоропровод" checked={details.garbageChute} onChange={v => updateDetails('garbageChute', v)} /><Toggle label="Менять ₽ по курсу ЦБ" checked={details.autoConvertCurrency} onChange={v => updateDetails('autoConvertCurrency', v)} /></div>
          </>}

          {section === 'address' && <>
            <Field label="Полный адрес объекта *"><input value={formData.address} onChange={e => updateProperty('address', e.target.value)} className={inputClass} placeholder="Курская обл., Курск, ул. Ленина, д. 1, кв. 10" /></Field>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label="Регион"><input value={details.region} onChange={e => updateDetails('region', e.target.value)} className={inputClass} /></Field><Field label="Район региона"><input value={details.regionDistrict} onChange={e => updateDetails('regionDistrict', e.target.value)} className={inputClass} /></Field><Field label="Населённый пункт"><input value={details.locality} onChange={e => updateDetails('locality', e.target.value)} className={inputClass} /></Field><Field label="Улица"><input value={details.street} onChange={e => updateDetails('street', e.target.value)} className={inputClass} /></Field><Field label="№ дома"><input value={details.houseNumber} onChange={e => updateDetails('houseNumber', e.target.value)} className={inputClass} /></Field><Field label="Корпус"><input value={details.buildingBlock} onChange={e => updateDetails('buildingBlock', e.target.value)} className={inputClass} /></Field><Field label="Литера"><input value={details.letter} onChange={e => updateDetails('letter', e.target.value)} className={inputClass} /></Field><Field label="Строение"><input value={details.structureNumber} onChange={e => updateDetails('structureNumber', e.target.value)} className={inputClass} /></Field><Field label="Квартира"><input value={details.apartmentNumber} onChange={e => updateDetails('apartmentNumber', e.target.value)} className={inputClass} /></Field><Field label="Доп. адрес для рекламы"><input value={details.advertisingAddress} onChange={e => updateDetails('advertisingAddress', e.target.value)} className={inputClass} /></Field><Field label="Название комплекса"><input value={details.complexName} onChange={e => updateDetails('complexName', e.target.value)} className={inputClass} /></Field><Field label="От города, км"><input type="number" value={details.distanceFromCity} onChange={e => updateDetails('distanceFromCity', e.target.value)} className={inputClass} /></Field><Field label="Широта"><input type="number" step="any" value={details.latitude} onChange={e => updateDetails('latitude', e.target.value)} className={inputClass} /></Field><Field label="Долгота"><input type="number" step="any" value={details.longitude} onChange={e => updateDetails('longitude', e.target.value)} className={inputClass} /></Field></div>
          </>}

          {section === 'building' && <div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label="Застройщик"><input value={details.developer} onChange={e => updateDetails('developer', e.target.value)} className={inputClass} /></Field><Field label="Жилой комплекс"><input value={details.residentialComplex} onChange={e => updateDetails('residentialComplex', e.target.value)} className={inputClass} /></Field><Field label="Тип дома"><input value={details.houseType} onChange={e => updateDetails('houseType', e.target.value)} className={inputClass} /></Field><Field label="Серия дома"><input value={details.houseSeries} onChange={e => updateDetails('houseSeries', e.target.value)} className={inputClass} /></Field><Field label="Тип стен"><input value={formData.walls} onChange={e => updateProperty('walls', e.target.value)} className={inputClass} /></Field><Field label="Год постройки"><input type="number" value={formData.constructionYear ?? ''} onChange={e => updateProperty('constructionYear', e.target.value ? Number(e.target.value) : undefined)} className={inputClass} /></Field><Field label="Год капремонта"><input type="number" value={details.renovationYear} onChange={e => updateDetails('renovationYear', e.target.value)} className={inputClass} /></Field><Toggle label="Лифт" checked={formData.elevator} onChange={v => updateProperty('elevator', v)} /><Toggle label="Новый дом" checked={details.newBuilding} onChange={v => updateDetails('newBuilding', v)} /></div>}

          {section === 'advertising' && <>
            <Field label={`Рекламный заголовок — ${details.adTitle.length}/33`}><input maxLength={33} value={details.adTitle} onChange={e => updateDetails('adTitle', e.target.value)} className={inputClass} placeholder="Заголовок для порталов" /></Field>
            <Field label={`Описание для рекламы и сайта — ${formData.description.length}/7500`}><textarea maxLength={7500} rows={7} value={formData.description} onChange={e => updateProperty('description', e.target.value)} className={`${inputClass} resize-y`} placeholder="Описание, которое можно публиковать в открытых источниках" /></Field>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="Личные примечания"><textarea rows={4} value={details.privateNotes} onChange={e => updateDetails('privateNotes', e.target.value)} className={`${inputClass} resize-none`} /></Field><Field label="Публичные примечания"><textarea rows={4} value={details.publicNotes} onChange={e => updateDetails('publicNotes', e.target.value)} className={`${inputClass} resize-none`} /></Field></div>
            <div><p className="lumi-muted-strong mb-2 flex items-center gap-2 text-sm font-medium"><Tag className="h-4 w-4" />Теги</p><div className="mb-3 flex flex-wrap gap-2">{formData.tags.map(tag => <span key={tag} className="lumi-accent-soft flex items-center gap-1 rounded-full px-3 py-1 text-sm">{tag}<button type="button" onClick={() => updateProperty('tags', formData.tags.filter(item => item !== tag))}><X className="h-3.5 w-3.5" /></button></span>)}</div><div className="flex gap-2"><input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} className={inputClass} placeholder="Добавить тег" /><button type="button" onClick={addTag} className="lumi-accent-bg mt-2 rounded-xl px-5">Добавить</button></div></div>
          </>}

          {section === 'service' && <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="Договор на оказание услуг"><input value={details.serviceContract} onChange={e => updateDetails('serviceContract', e.target.value)} className={inputClass} /></Field><Field label="Вид собственности"><input value={details.ownershipType} onChange={e => updateDetails('ownershipType', e.target.value)} className={inputClass} /></Field><Field label="Причина передачи"><input value={details.transferReason} onChange={e => updateDetails('transferReason', e.target.value)} className={inputClass} /></Field><Field label="Из какой карточки документ"><input value={details.documentSourceCard} onChange={e => updateDetails('documentSourceCard', e.target.value)} className={inputClass} /></Field><Field label="Вознаграждение агента"><input value={details.agentReward} onChange={e => updateDetails('agentReward', e.target.value)} className={inputClass} /></Field><Field label="Вознаграждение агентства"><input value={details.agencyReward} onChange={e => updateDetails('agencyReward', e.target.value)} className={inputClass} /></Field><Field label="Вознаграждение исполнителя, ₽"><input type="number" value={details.executorReward} onChange={e => updateDetails('executorReward', e.target.value)} className={inputClass} /></Field><Field label="Кем выступает клиент"><input value={details.clientRole} onChange={e => updateDetails('clientRole', e.target.value)} className={inputClass} /></Field></div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><Toggle label="Не выгружать в МЛС" checked={details.excludeMls} onChange={v => updateDetails('excludeMls', v)} /><Toggle label="Выводить в фид / на сайт" checked={details.feedEnabled} onChange={v => updateDetails('feedEnabled', v)} /><Toggle label="Выгрузить в закрытую базу Cian.ru" checked={details.cianPrivate} onChange={v => updateDetails('cianPrivate', v)} /><Toggle label="Не использовать пакет ЦИАН" checked={details.cianNoPackage} onChange={v => updateDetails('cianNoPackage', v)} /></div>
            <Field label="Комментарий для колл-центра"><textarea rows={3} value={details.callCenterComment} onChange={e => updateDetails('callCenterComment', e.target.value)} className={`${inputClass} resize-none`} /></Field>
            <div><h4 className="lumi-text mb-3 flex items-center gap-2 font-semibold"><FileText className="lumi-accent-text h-5 w-5" />Привязанные карточки</h4><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label="Оценка"><input value={details.linkedValuationId} onChange={e => updateDetails('linkedValuationId', e.target.value)} className={inputClass} placeholder="ID карточки" /></Field><Field label="Страхование"><input value={details.linkedInsuranceId} onChange={e => updateDetails('linkedInsuranceId', e.target.value)} className={inputClass} placeholder="ID карточки" /></Field><Field label="Ипотека"><input value={details.linkedMortgageId} onChange={e => updateDetails('linkedMortgageId', e.target.value)} className={inputClass} placeholder="ID карточки" /></Field><Field label="Сделка"><input value={details.linkedDealId} onChange={e => updateDetails('linkedDealId', e.target.value)} className={inputClass} placeholder="ID карточки" /></Field><Field label="Покупатель"><input value={details.linkedBuyerId} onChange={e => updateDetails('linkedBuyerId', e.target.value)} className={inputClass} placeholder="ID карточки" /></Field><Field label="Продавец"><input value={details.linkedSellerId} onChange={e => updateDetails('linkedSellerId', e.target.value)} className={inputClass} placeholder="ID карточки" /></Field></div></div>
            {formData.listingType === 'rent' && <div className="lumi-panel-muted rounded-2xl border p-5"><h4 className="lumi-text mb-4 font-semibold">Данные для договора аренды</h4><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label="Город заключения"><input value={details.rentContractCity} onChange={e => updateDetails('rentContractCity', e.target.value)} className={inputClass} /></Field><Field label="Дата договора"><input type="date" value={details.rentContractDate} onChange={e => updateDetails('rentContractDate', e.target.value)} className={inputClass} /></Field><Field label="Вселяющихся вместе"><input type="number" min="0" value={details.occupantsCount} onChange={e => updateDetails('occupantsCount', e.target.value)} className={inputClass} /></Field><Field label="Тип собственности"><input value={details.rentalOwnershipType} onChange={e => updateDetails('rentalOwnershipType', e.target.value)} className={inputClass} /></Field><Field label="Количество собственников"><input type="number" min="1" value={details.ownersCount} onChange={e => updateDetails('ownersCount', e.target.value)} className={inputClass} /></Field><Field label="Обременение"><input value={details.encumbrance} onChange={e => updateDetails('encumbrance', e.target.value)} className={inputClass} /></Field></div></div>}
          </>}
        </div>

        <div className="lumi-border mt-7 flex gap-3 border-t pt-5">
          <button type="button" onClick={onClose} className="lumi-control flex-1 rounded-xl px-6 py-3 font-medium">Отмена</button>
          <button type="submit" disabled={saving} className="lumi-gradient-button flex-1 rounded-xl px-6 py-3 font-medium disabled:opacity-60">{saving ? 'Сохраняем…' : property ? 'Сохранить объект' : 'Добавить объект'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default PropertyForm
