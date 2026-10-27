import { useEffect, useMemo, useState } from 'react'
import { BellRing, Building2, Contact, MapPin, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Modal from './Modal'
import type { Client } from '../types'
import { useClientRecords } from '../hooks/useClientRecords'
import { usePropertyCatalog } from '../hooks/usePropertyCatalog'
import type { ContactRole } from '../lib/contacts'
import { getErrorMessage } from '../lib/errors'

interface OwnerFormProps {
  isOpen: boolean
  onClose: () => void
  owner?: Client | null
  mode?: 'sale' | 'rent'
}

type OwnerFormData = {
  firstName: string
  lastName: string
  middleName: string
  birthDate: string
  birthdayReminder: boolean
  phone: string
  contactComment: string
  email: string
  source: string
  firstContactDate: string
  status: string
  description: string
  tags: string[]
}

const emptyForm: OwnerFormData = {
  firstName: '',
  lastName: '',
  middleName: '',
  birthDate: '',
  birthdayReminder: false,
  phone: '+7',
  contactComment: '',
  email: '',
  source: '',
  firstContactDate: '',
  status: 'new',
  description: '',
  tags: [],
}

const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

const OwnerForm = ({ isOpen, onClose, owner, mode = 'sale' }: OwnerFormProps) => {
  const { user } = useAuth()
  const role: ContactRole = mode === 'rent' ? 'landlord' : 'seller'
  const personLabel = mode === 'rent' ? 'арендодателя' : 'собственника'
  const [formData, setFormData] = useState<OwnerFormData>(emptyForm)
  const [newTag, setNewTag] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [propertyAddress, setPropertyAddress] = useState('')
  const { saveOwner, mutationPending: saving } = useClientRecords(user?.id)
  const propertyQuery = usePropertyCatalog(user?.id)
  const properties = useMemo(() => (propertyQuery.data?.properties || []).filter(property => property.listingType === mode), [mode, propertyQuery.data])

  useEffect(() => {
    if (!isOpen || !owner) return
    const linked = properties.find(item => (propertyQuery.data?.propertyOwners[item.id] || []).some(propertyOwner => propertyOwner.clientId === owner.id))
    setPropertyId(linked?.id || '')
    setPropertyAddress(linked?.address || '')
  }, [isOpen, owner, properties, propertyQuery.data?.propertyOwners])

  useEffect(() => {
    if (!owner) {
      setFormData(emptyForm)
      setPropertyId('')
      setPropertyAddress('')
      return
    }
    setFormData({
      firstName: owner.firstName || '',
      lastName: owner.lastName || '',
      middleName: owner.middleName || '',
      birthDate: owner.birthDate || '',
      birthdayReminder: owner.birthdayReminder || false,
      phone: owner.phone || '+7',
      contactComment: owner.contactComment || '',
      email: owner.email || '',
      source: owner.source || '',
      firstContactDate: owner.firstContactDate || '',
      status: owner.status || 'new',
      description: owner.description || '',
      tags: owner.tags || [],
    })
  }, [owner])

  const update = <K extends keyof OwnerFormData>(key: K, value: OwnerFormData[K]) => {
    setFormData(current => ({ ...current, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return

    try {
      const roles: ContactRole[] = Array.from(new Set<ContactRole>([...(owner?.roles || []).filter((item): item is ContactRole => ['buyer', 'seller', 'landlord', 'tenant'].includes(item)), role]))
      await saveOwner({
        type: 'seller',
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        middleName: formData.middleName.trim() || null,
        birthDate: formData.birthDate || null,
        birthdayReminder: formData.birthdayReminder,
        phone: formData.phone.trim(),
        contactComment: formData.contactComment.trim() || null,
        email: formData.email.trim() || null,
        source: formData.source || null,
        firstContactDate: formData.firstContactDate || null,
        status: formData.status,
        description: formData.description.trim() || null,
        tags: formData.tags,
        roles,
      }, {
        mode,
        propertyId: propertyId || undefined,
        propertyAddress: propertyAddress.trim() || properties.find(item => item.id === propertyId)?.address,
        primaryOwnerId: properties.find(item => item.id === propertyId)?.ownerId,
      }, owner?.id)
      onClose()
    } catch (error) {
      console.error('Owner save failed:', error)
      alert(`Не удалось сохранить ${personLabel}: ${getErrorMessage(error, 'проверьте подключение и повторите')}`)
    }
  }

  const addTag = () => {
    const value = newTag.trim()
    if (!value || formData.tags.includes(value)) return
    update('tags', [...formData.tags, value])
    setNewTag('')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={owner ? `Редактировать ${personLabel}` : mode === 'rent' ? 'Новый арендодатель' : 'Новый собственник'}>
      <form onSubmit={handleSubmit} className="space-y-7">
        <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-2 text-blue-600"><Contact className="h-5 w-5" /></div>
            <div>
              <h3 className="font-semibold text-gray-900">Контакты и источник</h3>
              <p className="text-sm text-gray-500">Основные данные карточки {personLabel}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-gray-700">Имя *
              <input required value={formData.firstName} onChange={event => update('firstName', event.target.value)} className={`${inputClass} mt-2`} placeholder="Введите имя" />
            </label>
            <label className="text-sm font-medium text-gray-700">Фамилия (необязательно)
              <input  value={formData.lastName} onChange={event => update('lastName', event.target.value)} className={`${inputClass} mt-2`} placeholder="Введите фамилию" />
            </label>
            <label className="text-sm font-medium text-gray-700">Отчество
              <input value={formData.middleName} onChange={event => update('middleName', event.target.value)} className={`${inputClass} mt-2`} placeholder="Введите отчество" />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Дата рождения
              <input type="date" value={formData.birthDate} onChange={event => update('birthDate', event.target.value)} className={`${inputClass} mt-2`} />
            </label>
            <label className="mt-7 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={formData.birthdayReminder} onChange={event => update('birthdayReminder', event.target.checked)} className="h-5 w-5 rounded" />
              <BellRing className="h-5 w-5 text-amber-500" />
              Уведомить о дне рождения
            </label>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Телефон *
              <input type="tel" required value={formData.phone} onChange={event => update('phone', event.target.value)} className={`${inputClass} mt-2`} placeholder="+7 (999) 123-45-67" />
            </label>
            <label className="text-sm font-medium text-gray-700">Email
              <input type="email" value={formData.email} onChange={event => update('email', event.target.value)} className={`${inputClass} mt-2`} placeholder="Введите email" />
            </label>
          </div>

          <label className="mt-4 block text-sm font-medium text-gray-700">Комментарий к контакту
            <textarea value={formData.contactComment} onChange={event => update('contactComment', event.target.value)} className={`${inputClass} mt-2 resize-none`} rows={2} placeholder="Введите комментарий" />
          </label>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-gray-700">Источник
              <select value={formData.source} onChange={event => update('source', event.target.value)} className={`${inputClass} mt-2`}>
                <option value="">Не выбрано</option>
                <option value="Авито">Авито</option>
                <option value="ЦИАН">ЦИАН</option>
                <option value="Яндекс Недвижимость">Яндекс Недвижимость</option>
                <option value="Расклейка">Расклейка</option>
                <option value="Рекомендация">Рекомендация</option>
                <option value="Входящий звонок">Входящий звонок</option>
                <option value="Другое">Другое</option>
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">Первый контакт
              <input type="date" value={formData.firstContactDate} onChange={event => update('firstContactDate', event.target.value)} className={`${inputClass} mt-2`} />
            </label>
            <label className="text-sm font-medium text-gray-700">Статус
              <select value={formData.status} onChange={event => update('status', event.target.value)} className={`${inputClass} mt-2`}>
                <option value="new">Новый</option>
                <option value="active">В работе</option>
                <option value="meeting">Назначена встреча</option>
                <option value="contract">Договор</option>
                <option value="closed">Сделка закрыта</option>
                <option value="lost">Отказ</option>
              </select>
            </label>
          </div>
        </section>

        <section className="lumi-panel-muted lumi-border rounded-2xl border p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="lumi-accent-soft rounded-xl p-2"><Building2 className="h-5 w-5" /></div>
            <div>
              <h3 className="lumi-text font-semibold">Объект {personLabel}</h3>
              <p className="lumi-muted text-sm">Свяжите карточку с существующим объектом или создайте объект по адресу</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="lumi-muted-strong text-sm font-medium">Существующий объект
              <select
                value={propertyId}
                onChange={event => {
                  const nextId = event.target.value
                  setPropertyId(nextId)
                  const selected = properties.find(item => item.id === nextId)
                  if (selected) setPropertyAddress(selected.address)
                }}
                className="lumi-control mt-2 w-full rounded-xl px-4 py-3 outline-none"
              >
                <option value="">Создать по адресу ниже</option>
                {properties.map(item => <option key={item.id} value={item.id}>{item.address}</option>)}
              </select>
            </label>
            <label className="lumi-muted-strong text-sm font-medium">Адрес объекта
              <div className="relative mt-2">
                <MapPin className="lumi-muted absolute left-3 top-3.5 h-5 w-5" />
                <input
                  value={propertyAddress}
                  onChange={event => setPropertyAddress(event.target.value)}
                  className={`${inputClass} pl-10`}
                  placeholder="Курск, улица, дом, квартира"
                />
              </div>
            </label>
          </div>
        </section>

        <section>
          <label className="block text-sm font-medium text-gray-700">Личные примечания
            <textarea value={formData.description} onChange={event => update('description', event.target.value)} className={`${inputClass} mt-2 resize-none`} rows={3} placeholder={`Информация о ${personLabel}, договорённостях и мотивации`} />
          </label>

          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">Теги</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {formData.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700">
                  {tag}
                  <button type="button" onClick={() => update('tags', formData.tags.filter(item => item !== tag))}><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newTag} onChange={event => setNewTag(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} className={inputClass} placeholder="Добавить тег" />
              <button type="button" onClick={addTag} className="rounded-xl bg-blue-600 px-5 font-medium text-white hover:bg-blue-700">Добавить</button>
            </div>
          </div>
        </section>

        <div className="flex gap-3 border-t border-gray-100 pt-5">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-medium text-gray-700 hover:bg-gray-200">Отмена</button>
          <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 font-medium text-white disabled:opacity-60">
            {saving ? 'Сохраняем…' : owner ? 'Сохранить' : mode === 'rent' ? 'Добавить арендодателя' : 'Добавить собственника'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default OwnerForm
