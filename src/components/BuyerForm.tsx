import { useEffect, useState, type ReactNode } from 'react'
import { Building2, Contact, FileText, Home, MapPin, Settings2, WalletCards, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Modal from './Modal'
import type { Client } from '../types'
import { getErrorMessage } from '../lib/errors'
import { useClientRecords, useClientRequirement } from '../hooks/useClientRecords'
import type { ContactRole } from '../lib/contacts'

interface BuyerFormProps {
  isOpen: boolean
  onClose: () => void
  buyer?: Client | null
  defaultPurpose?: 'sale' | 'rent'
}

type FormData = {
  purpose: 'sale' | 'rent'; firstName: string; lastName: string; middleName: string; birthDate: string;
  birthdayReminder: boolean; phone: string; contactComment: string; email: string; source: string;
  requestType: string; status: string; firstContactDate: string; privateNotes: string; publicNotes: string;
  considersNewBuild: boolean; sharedOnly: boolean; mortgageNeeded: boolean; clientPaysCommission: boolean;
  sharedCommission: boolean; rentalDuration: string; utilitiesIncluded: boolean; propertyType: string;
  priceMin: string; priceMax: string; totalAreaMin: string; totalAreaMax: string; livingAreaMin: string;
  livingAreaMax: string; kitchenAreaMin: string; kitchenAreaMax: string; balcony: string; apartmentType: string;
  floorMin: string; floorMax: string; notFirst: boolean; notLast: boolean; basement: boolean; socle: boolean;
  attic: boolean; apartmentLevels: string; rooms: string; repair: string; windowView: string; bathroom: string;
  furniture: string; developer: string; complexName: string; completionQuarter: string; completionYear: string;
  houseType: string; newBuilding: boolean; elevator: string; initialAddress: string; locations: string[];
  maxDistance: string; locationDistrict: string; serviceContract: string; excludeMls: boolean;
  transferReason: string; meetingHeld: string; agentReward: string; agencyReward: string; executorReward: string;
  clientRole: string; contractCity: string; contractDate: string; occupantsCount: string; ownershipType: string;
  ownersCount: string; encumbrance: string; linkedValuationId: string; linkedInsuranceId: string;
  linkedMortgageId: string; linkedDealId: string; linkedBuyerId: string; linkedSellerId: string;
}

const emptyForm = (purpose: 'sale' | 'rent'): FormData => ({
  purpose, firstName: '', lastName: '', middleName: '', birthDate: '', birthdayReminder: false,
  phone: '+7', contactComment: '', email: '', source: '', requestType: '', status: 'new', firstContactDate: '',
  privateNotes: '', publicNotes: '', considersNewBuild: false, sharedOnly: false, mortgageNeeded: false,
  clientPaysCommission: false, sharedCommission: false, rentalDuration: 'long_term', utilitiesIncluded: false,
  propertyType: 'Квартира', priceMin: '', priceMax: '', totalAreaMin: '', totalAreaMax: '', livingAreaMin: '',
  livingAreaMax: '', kitchenAreaMin: '', kitchenAreaMax: '', balcony: '', apartmentType: '', floorMin: '',
  floorMax: '', notFirst: false, notLast: false, basement: false, socle: false, attic: false,
  apartmentLevels: '', rooms: '', repair: '', windowView: '', bathroom: '', furniture: '', developer: '',
  complexName: '', completionQuarter: '', completionYear: '', houseType: '', newBuilding: false, elevator: '',
  initialAddress: 'Курская обл.', locations: [], maxDistance: '', locationDistrict: '', serviceContract: '',
  excludeMls: false, transferReason: '', meetingHeld: '', agentReward: '', agencyReward: '', executorReward: '',
  clientRole: '', contractCity: '', contractDate: '', occupantsCount: '', ownershipType: '', ownersCount: '',
  encumbrance: '', linkedValuationId: '', linkedInsuranceId: '', linkedMortgageId: '', linkedDealId: '',
  linkedBuyerId: '', linkedSellerId: '',
})

const inputClass = 'mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => <label className="block text-sm font-medium text-gray-700">{label}{children}{hint && <span className="mt-1 block text-xs font-normal text-gray-500">{hint}</span>}</label>
const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) => <label className="flex min-h-12 items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-5 w-5 rounded" />{label}</label>
const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value)
const numbersFromList = (value: string) => value.split(/[,;\s]+/).map(Number).filter(Number.isFinite)

const BuyerForm = ({ isOpen, onClose, buyer, defaultPurpose = 'sale' }: BuyerFormProps) => {
  const { user } = useAuth()
  const [section, setSection] = useState('contact')
  const [form, setForm] = useState<FormData>(emptyForm(defaultPurpose))
  const [newLocation, setNewLocation] = useState('')
  const [draftReady, setDraftReady] = useState(false)
  const { saveBuyer, mutationPending: saving } = useClientRecords(user?.id)
  const requirementQuery = useClientRequirement(user?.id, buyer?.id, form.purpose)
  const draftKey = user && !buyer ? `kvartocrm:buyer-draft:${user.id}:${defaultPurpose}` : null

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => setForm(current => ({ ...current, [key]: value }))

  useEffect(() => {
    if (!isOpen) return
    setDraftReady(false)
    setSection('contact')
    if (!buyer) {
      let next = emptyForm(defaultPurpose)
      if (draftKey) {
        try {
          const saved = sessionStorage.getItem(draftKey)
          if (saved) next = { ...next, ...JSON.parse(saved) as Partial<FormData>, purpose: defaultPurpose }
        } catch {
          sessionStorage.removeItem(draftKey)
        }
      }
      setForm(next)
      setDraftReady(true)
      return
    }
    const purpose: 'sale' | 'rent' = buyer.roles?.includes('tenant') ? 'rent' : defaultPurpose
    setForm({ ...emptyForm(purpose), purpose, firstName: buyer.firstName || '', lastName: buyer.lastName || '', middleName: buyer.middleName || '', birthDate: buyer.birthDate || '', birthdayReminder: buyer.birthdayReminder || false, phone: buyer.phone || '+7', contactComment: buyer.contactComment || '', email: buyer.email || '', source: buyer.source || '', status: buyer.status || 'new', firstContactDate: buyer.firstContactDate || '', privateNotes: buyer.description || '', propertyType: buyer.propertyType || 'Квартира', priceMax: String(buyer.budget ?? ''), rooms: String(buyer.rooms ?? ''), locations: buyer.preferredDistricts || [], mortgageNeeded: buyer.mortgageStatus || false })
    setDraftReady(true)

  }, [buyer, defaultPurpose, draftKey, isOpen])

  useEffect(() => {
    if (!isOpen || !draftKey || !draftReady) return
    sessionStorage.setItem(draftKey, JSON.stringify(form))
  }, [draftKey, draftReady, form, isOpen])

  useEffect(() => {
    const data = requirementQuery.data as Record<string, any> | null | undefined
    if (!isOpen || !buyer || !data) return
    const deal = data.deal_terms || {}; const object = data.object_criteria || {}; const building = data.building_criteria || {}; const service = data.service_fields || {}; const linked = data.linked_cards || {}
    setForm(current => ({ ...current,
      requestType: data.request_type || '', considersNewBuild: Boolean(data.considers_new_build), propertyType: data.property_type || 'Квартира',
      priceMin: String(data.price_min ?? ''), priceMax: String(data.price_max ?? ''), totalAreaMin: String(data.total_area_min ?? ''), totalAreaMax: String(data.total_area_max ?? ''), livingAreaMin: String(data.living_area_min ?? ''), livingAreaMax: String(data.living_area_max ?? ''), kitchenAreaMin: String(data.kitchen_area_min ?? ''), kitchenAreaMax: String(data.kitchen_area_max ?? ''), rooms: (data.rooms || []).join(', '), floorMin: String(data.floor_min ?? ''), floorMax: String(data.floor_max ?? ''), locations: Array.isArray(data.locations) ? data.locations : [],
      sharedOnly: Boolean(deal.shared_only), mortgageNeeded: Boolean(deal.mortgage_needed), clientPaysCommission: Boolean(deal.client_pays_commission), sharedCommission: Boolean(deal.shared_commission), rentalDuration: deal.rental_duration || 'long_term', utilitiesIncluded: Boolean(deal.utilities_included),
      balcony: object.balcony || '', apartmentType: object.apartment_type || '', notFirst: Boolean(object.not_first), notLast: Boolean(object.not_last), basement: Boolean(object.basement), socle: Boolean(object.socle), attic: Boolean(object.attic), apartmentLevels: String(object.apartment_levels ?? ''), repair: object.repair || '', windowView: object.window_view || '', bathroom: object.bathroom || '', furniture: object.furniture || '', initialAddress: object.initial_address || 'Курская обл.', maxDistance: String(object.max_distance ?? ''), locationDistrict: object.location_district || '',
      developer: building.developer || '', complexName: building.complex_name || '', completionQuarter: building.completion_quarter || '', completionYear: String(building.completion_year ?? ''), houseType: building.house_type || '', newBuilding: Boolean(building.new_building), elevator: building.elevator || '',
      excludeMls: Boolean(service.exclude_mls), transferReason: service.transfer_reason || '', meetingHeld: service.meeting_held || '', agentReward: service.agent_reward || '', agencyReward: service.agency_reward || '', executorReward: service.executor_reward || '', clientRole: service.client_role || '', serviceContract: service.service_contract || '', contractCity: service.contract_city || '', contractDate: service.contract_date || '', occupantsCount: String(service.occupants_count ?? ''), ownershipType: service.ownership_type || '', ownersCount: String(service.owners_count ?? ''), encumbrance: service.encumbrance || '', privateNotes: data.private_notes || '', publicNotes: data.public_notes || '',
      linkedValuationId: linked.valuation || '', linkedInsuranceId: linked.insurance || '', linkedMortgageId: linked.mortgage || '', linkedDealId: linked.deal || '', linkedBuyerId: linked.buyer || '', linkedSellerId: linked.seller || '',
    }))
  }, [buyer, isOpen, requirementQuery.data])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!user) return
    try {
      const role: ContactRole = form.purpose === 'rent' ? 'tenant' : 'buyer'
      const roles: ContactRole[] = Array.from(new Set<ContactRole>([...(buyer?.roles || []).filter((item): item is ContactRole => ['buyer', 'seller', 'landlord', 'tenant'].includes(item)), role]))
      const clientInput = {
        type: 'buyer' as const,
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), middleName: form.middleName.trim() || null,
        birthDate: form.birthDate || null, birthdayReminder: form.birthdayReminder, phone: form.phone.trim(),
        contactComment: form.contactComment.trim() || null, email: form.email.trim() || null, source: form.source || null,
        firstContactDate: form.firstContactDate || null, status: form.status, description: form.privateNotes || null,
        propertyType: form.propertyType, preferredDistricts: form.locations, mortgageStatus: form.mortgageNeeded,
        budget: numberOrNull(form.priceMax), rooms: numbersFromList(form.rooms)[0] || null, roles, tags: buyer?.tags || [],
      }
      const requirement = {
        purpose: form.purpose, request_type: form.requestType || null,
        property_type: form.propertyType, considers_new_build: form.considersNewBuild, price_min: numberOrNull(form.priceMin), price_max: numberOrNull(form.priceMax), total_area_min: numberOrNull(form.totalAreaMin), total_area_max: numberOrNull(form.totalAreaMax), living_area_min: numberOrNull(form.livingAreaMin), living_area_max: numberOrNull(form.livingAreaMax), kitchen_area_min: numberOrNull(form.kitchenAreaMin), kitchen_area_max: numberOrNull(form.kitchenAreaMax), rooms: numbersFromList(form.rooms), floor_min: numberOrNull(form.floorMin), floor_max: numberOrNull(form.floorMax), locations: form.locations,
        deal_terms: { shared_only: form.sharedOnly, mortgage_needed: form.mortgageNeeded, client_pays_commission: form.clientPaysCommission, shared_commission: form.sharedCommission, rental_duration: form.rentalDuration, utilities_included: form.utilitiesIncluded },
        object_criteria: { balcony: form.balcony, apartment_type: form.apartmentType, not_first: form.notFirst, not_last: form.notLast, basement: form.basement, socle: form.socle, attic: form.attic, apartment_levels: numberOrNull(form.apartmentLevels), repair: form.repair, window_view: form.windowView, bathroom: form.bathroom, furniture: form.furniture, initial_address: form.initialAddress, max_distance: numberOrNull(form.maxDistance), location_district: form.locationDistrict },
        building_criteria: { developer: form.developer, complex_name: form.complexName, completion_quarter: form.completionQuarter, completion_year: numberOrNull(form.completionYear), house_type: form.houseType, new_building: form.newBuilding, elevator: form.elevator },
        service_fields: { status: form.status, exclude_mls: form.excludeMls, transfer_reason: form.transferReason, meeting_held: form.meetingHeld, agent_reward: form.agentReward, agency_reward: form.agencyReward, executor_reward: form.executorReward, client_role: form.clientRole, service_contract: form.serviceContract, contract_city: form.contractCity, contract_date: form.contractDate || null, occupants_count: numberOrNull(form.occupantsCount), ownership_type: form.ownershipType, owners_count: numberOrNull(form.ownersCount), encumbrance: form.encumbrance },
        linked_cards: { valuation: form.linkedValuationId, insurance: form.linkedInsuranceId, mortgage: form.linkedMortgageId, deal: form.linkedDealId, buyer: form.linkedBuyerId, seller: form.linkedSellerId }, private_notes: form.privateNotes || null, public_notes: form.publicNotes || null, updated_at: new Date().toISOString(),
      }
      await saveBuyer(clientInput, requirement, buyer?.id, requirementQuery.data?.id)
      if (draftKey) sessionStorage.removeItem(draftKey)
      onClose()
    } catch (error) {
      console.error('Client requirement save failed:', error); alert(`Не удалось сохранить заявку: ${getErrorMessage(error, 'проверьте подключение и повторите')}`)
    }
  }

  const tabs = [{ id: 'contact', label: 'Контакты', icon: Contact }, { id: 'deal', label: 'Сделка', icon: WalletCards }, { id: 'object', label: 'Объект', icon: Home }, { id: 'building', label: 'Здание', icon: Building2 }, { id: 'location', label: 'Локация', icon: MapPin }, { id: 'service', label: 'Служебные', icon: Settings2 }]
  const addLocation = () => { const value = newLocation.trim(); if (!value || form.locations.includes(value)) return; update('locations', [...form.locations, value]); setNewLocation('') }

  return <Modal isOpen={isOpen} onClose={onClose} title={buyer ? 'Редактировать заявку' : form.purpose === 'rent' ? 'Новая заявка арендатора' : 'Новая заявка покупателя'}>
    <form onSubmit={handleSubmit}>
      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-3">{tabs.map(tab => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => setSection(tab.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${section === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}><Icon className="h-4 w-4" />{tab.label}</button> })}</div>
      <div className="min-h-[430px] space-y-5">
        {section === 'contact' && <><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label={form.purpose === 'rent' ? 'Имя арендатора *' : 'Имя покупателя *'}><input required value={form.firstName} onChange={e => update('firstName', e.target.value)} className={inputClass} /></Field><Field label="Фамилия *"><input required value={form.lastName} onChange={e => update('lastName', e.target.value)} className={inputClass} /></Field><Field label="Отчество"><input value={form.middleName} onChange={e => update('middleName', e.target.value)} className={inputClass} /></Field><Field label="Дата рождения"><input type="date" value={form.birthDate} onChange={e => update('birthDate', e.target.value)} className={inputClass} /></Field><Toggle label="Уведомить о дне рождения" checked={form.birthdayReminder} onChange={v => update('birthdayReminder', v)} /><Field label="Телефон *"><input required value={form.phone} onChange={e => update('phone', e.target.value)} className={inputClass} /></Field><Field label="Email"><input type="email" value={form.email} onChange={e => update('email', e.target.value)} className={inputClass} /></Field><Field label="Источник"><select value={form.source} onChange={e => update('source', e.target.value)} className={inputClass}><option value="">Не выбрано</option><option>Авито</option><option>ЦИАН</option><option>Яндекс Недвижимость</option><option>Рекомендация</option><option>Входящий звонок</option></select></Field><Field label="Тип заявки"><input value={form.requestType} onChange={e => update('requestType', e.target.value)} className={inputClass} /></Field></div><Field label="Комментарий к контакту"><textarea rows={3} value={form.contactComment} onChange={e => update('contactComment', e.target.value)} className={`${inputClass} resize-none`} /></Field></>}

        {section === 'deal' && <><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="Цель заявки"><select value={form.purpose} onChange={e => update('purpose', e.target.value as 'sale' | 'rent')} className={inputClass}><option value="sale">Покупка</option><option value="rent">Аренда</option></select></Field>{form.purpose === 'rent' && <Field label="Срок аренды"><select value={form.rentalDuration} onChange={e => update('rentalDuration', e.target.value)} className={inputClass}><option value="long_term">Долгосрочная аренда</option><option value="short_term">Краткосрочная</option><option value="daily">Посуточная</option></select></Field>}<Field label="Статус"><select value={form.status} onChange={e => update('status', e.target.value)} className={inputClass}><option value="new">Новый</option><option value="active">В работе</option><option value="meeting">Встреча</option><option value="matched">Подбор</option><option value="closed">Закрыт</option></select></Field></div><div className="grid grid-cols-1 gap-3 md:grid-cols-2">{form.purpose === 'sale' && <Toggle label="Рассмотрит новостройку" checked={form.considersNewBuild} onChange={v => update('considersNewBuild', v)} />}<Toggle label="Только объекты с разделением комиссии" checked={form.sharedOnly} onChange={v => update('sharedOnly', v)} />{form.purpose === 'sale' && <Toggle label="Нужна ипотека" checked={form.mortgageNeeded} onChange={v => update('mortgageNeeded', v)} />}<Toggle label={form.purpose === 'rent' ? 'Арендатор платит мне комиссию' : 'Покупатель платит мне комиссию'} checked={form.clientPaysCommission} onChange={v => update('clientPaysCommission', v)} /><Toggle label="Готов делиться комиссией" checked={form.sharedCommission} onChange={v => update('sharedCommission', v)} />{form.purpose === 'rent' && <Toggle label="Коммунальные услуги включены" checked={form.utilitiesIncluded} onChange={v => update('utilitiesIncluded', v)} />}</div></>}

        {section === 'object' && <><p className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">Заполненные критерии используются для автоматического подбора встречных объектов.</p><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label="Тип объекта"><select value={form.propertyType} onChange={e => update('propertyType', e.target.value)} className={inputClass}><option>Квартира</option><option>Комната</option><option>Дом</option><option>Участок</option></select></Field><Field label="Цена от, ₽"><input type="number" value={form.priceMin} onChange={e => update('priceMin', e.target.value)} className={inputClass} /></Field><Field label="Цена до, ₽"><input type="number" value={form.priceMax} onChange={e => update('priceMax', e.target.value)} className={inputClass} /></Field><Field label="Общая площадь от"><input type="number" value={form.totalAreaMin} onChange={e => update('totalAreaMin', e.target.value)} className={inputClass} /></Field><Field label="Общая площадь до"><input type="number" value={form.totalAreaMax} onChange={e => update('totalAreaMax', e.target.value)} className={inputClass} /></Field><Field label="Комнаты" hint="Например: 1, 2, 3"><input value={form.rooms} onChange={e => update('rooms', e.target.value)} className={inputClass} /></Field><Field label="Жилая площадь от"><input type="number" value={form.livingAreaMin} onChange={e => update('livingAreaMin', e.target.value)} className={inputClass} /></Field><Field label="Жилая площадь до"><input type="number" value={form.livingAreaMax} onChange={e => update('livingAreaMax', e.target.value)} className={inputClass} /></Field><Field label="Кухня от"><input type="number" value={form.kitchenAreaMin} onChange={e => update('kitchenAreaMin', e.target.value)} className={inputClass} /></Field><Field label="Кухня до"><input type="number" value={form.kitchenAreaMax} onChange={e => update('kitchenAreaMax', e.target.value)} className={inputClass} /></Field><Field label="Этаж с"><input type="number" value={form.floorMin} onChange={e => update('floorMin', e.target.value)} className={inputClass} /></Field><Field label="Этаж до"><input type="number" value={form.floorMax} onChange={e => update('floorMax', e.target.value)} className={inputClass} /></Field><Field label="Балкон"><input value={form.balcony} onChange={e => update('balcony', e.target.value)} className={inputClass} /></Field><Field label="Вид квартиры"><input value={form.apartmentType} onChange={e => update('apartmentType', e.target.value)} className={inputClass} /></Field><Field label="Этажей в квартире"><input type="number" value={form.apartmentLevels} onChange={e => update('apartmentLevels', e.target.value)} className={inputClass} /></Field><Field label="Ремонт"><input value={form.repair} onChange={e => update('repair', e.target.value)} className={inputClass} /></Field><Field label="Вид из окон"><input value={form.windowView} onChange={e => update('windowView', e.target.value)} className={inputClass} /></Field><Field label="Санузел"><input value={form.bathroom} onChange={e => update('bathroom', e.target.value)} className={inputClass} /></Field>{form.purpose === 'rent' && <Field label="Мебель"><input value={form.furniture} onChange={e => update('furniture', e.target.value)} className={inputClass} /></Field>}</div><div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Toggle label="Не первый" checked={form.notFirst} onChange={v => update('notFirst', v)} /><Toggle label="Не последний" checked={form.notLast} onChange={v => update('notLast', v)} /><Toggle label="Подвал" checked={form.basement} onChange={v => update('basement', v)} /><Toggle label="Цоколь" checked={form.socle} onChange={v => update('socle', v)} /><Toggle label="Мансарда" checked={form.attic} onChange={v => update('attic', v)} /></div></>}

        {section === 'building' && <div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label="Застройщик"><input value={form.developer} onChange={e => update('developer', e.target.value)} className={inputClass} /></Field><Field label="Название комплекса"><input value={form.complexName} onChange={e => update('complexName', e.target.value)} className={inputClass} /></Field><Field label="Квартал сдачи"><input value={form.completionQuarter} onChange={e => update('completionQuarter', e.target.value)} className={inputClass} /></Field><Field label="Год сдачи"><input type="number" value={form.completionYear} onChange={e => update('completionYear', e.target.value)} className={inputClass} /></Field><Field label="Тип дома"><input value={form.houseType} onChange={e => update('houseType', e.target.value)} className={inputClass} /></Field><Field label="Лифт"><input value={form.elevator} onChange={e => update('elevator', e.target.value)} className={inputClass} /></Field><Toggle label="Новый дом" checked={form.newBuilding} onChange={v => update('newBuilding', v)} /></div>}

        {section === 'location' && <><Field label="Адрес первичного обращения"><input value={form.initialAddress} onChange={e => update('initialAddress', e.target.value)} className={inputClass} /></Field><div><p className="mb-2 text-sm font-medium text-gray-700">Адреса для автоподбора</p><div className="mb-3 flex flex-wrap gap-2">{form.locations.map(location => <span key={location} className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700">{location}<button type="button" onClick={() => update('locations', form.locations.filter(item => item !== location))}><X className="h-3.5 w-3.5" /></button></span>)}</div><div className="flex gap-2"><input value={newLocation} onChange={e => setNewLocation(e.target.value)} className={inputClass} placeholder="Город, район или улица" /><button type="button" onClick={addLocation} className="mt-2 rounded-xl bg-blue-600 px-5 text-white">Добавить</button></div></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="От города не более, км"><input type="number" value={form.maxDistance} onChange={e => update('maxDistance', e.target.value)} className={inputClass} /></Field><Field label="Район местоположения"><input value={form.locationDistrict} onChange={e => update('locationDistrict', e.target.value)} className={inputClass} /></Field></div></>}

        {section === 'service' && <><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label="Договор на оказание услуг"><input value={form.serviceContract} onChange={e => update('serviceContract', e.target.value)} className={inputClass} /></Field><Field label="Причина передачи"><input value={form.transferReason} onChange={e => update('transferReason', e.target.value)} className={inputClass} /></Field><Field label="Встреча состоялась"><input value={form.meetingHeld} onChange={e => update('meetingHeld', e.target.value)} className={inputClass} /></Field><Field label="Вознаграждение агента"><input value={form.agentReward} onChange={e => update('agentReward', e.target.value)} className={inputClass} /></Field><Field label="Вознаграждение агентства"><input value={form.agencyReward} onChange={e => update('agencyReward', e.target.value)} className={inputClass} /></Field><Field label="Вознаграждение исполнителя, ₽"><input type="number" value={form.executorReward} onChange={e => update('executorReward', e.target.value)} className={inputClass} /></Field></div><Toggle label="Не выгружать в МЛС" checked={form.excludeMls} onChange={v => update('excludeMls', v)} /><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="Личные примечания"><textarea rows={4} value={form.privateNotes} onChange={e => update('privateNotes', e.target.value)} className={`${inputClass} resize-none`} /></Field><Field label="Публичные примечания"><textarea rows={4} value={form.publicNotes} onChange={e => update('publicNotes', e.target.value)} className={`${inputClass} resize-none`} /></Field></div>{form.purpose === 'rent' && <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><h4 className="mb-4 font-semibold text-violet-950">Данные для сделки аренды</h4><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label="Город договора"><input value={form.contractCity} onChange={e => update('contractCity', e.target.value)} className={inputClass} /></Field><Field label="Дата договора"><input type="date" value={form.contractDate} onChange={e => update('contractDate', e.target.value)} className={inputClass} /></Field><Field label="Вселяющихся вместе"><input type="number" value={form.occupantsCount} onChange={e => update('occupantsCount', e.target.value)} className={inputClass} /></Field><Field label="Тип собственности"><input value={form.ownershipType} onChange={e => update('ownershipType', e.target.value)} className={inputClass} /></Field><Field label="Количество собственников"><input type="number" value={form.ownersCount} onChange={e => update('ownersCount', e.target.value)} className={inputClass} /></Field><Field label="Обременение"><input value={form.encumbrance} onChange={e => update('encumbrance', e.target.value)} className={inputClass} /></Field></div></div>}<div><h4 className="mb-3 flex items-center gap-2 font-semibold"><FileText className="h-5 w-5 text-blue-600" />Привязанные карточки</h4><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Field label="Оценка"><input value={form.linkedValuationId} onChange={e => update('linkedValuationId', e.target.value)} className={inputClass} /></Field><Field label="Страхование"><input value={form.linkedInsuranceId} onChange={e => update('linkedInsuranceId', e.target.value)} className={inputClass} /></Field><Field label="Ипотека"><input value={form.linkedMortgageId} onChange={e => update('linkedMortgageId', e.target.value)} className={inputClass} /></Field><Field label="Сделка"><input value={form.linkedDealId} onChange={e => update('linkedDealId', e.target.value)} className={inputClass} /></Field><Field label="Покупатель"><input value={form.linkedBuyerId} onChange={e => update('linkedBuyerId', e.target.value)} className={inputClass} /></Field><Field label="Продавец"><input value={form.linkedSellerId} onChange={e => update('linkedSellerId', e.target.value)} className={inputClass} /></Field></div></div></>}
      </div>
      <div className="mt-7 flex gap-3 border-t border-gray-100 pt-5"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-medium text-gray-700">Отмена</button><button type="submit" disabled={saving} className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 font-medium text-white disabled:opacity-60">{saving ? 'Сохраняем…' : 'Сохранить заявку'}</button></div>
    </form>
  </Modal>
}

export default BuyerForm
