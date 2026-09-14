import { useState } from 'react'
import { Archive, Plus, Edit, Trash2, Search, Star, Eye, Building2, LoaderCircle, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Property } from '../types'
import PropertyForm from '../components/PropertyForm'
import { usePropertyCatalog } from '../hooks/usePropertyCatalog'

const PropertiesPage = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, isPending: loading, error: queryError, refetch, toggleFavorite: toggleFavoriteRecord, archiveProperty: archivePropertyRecord, removeProperty } = usePropertyCatalog(user?.id)
  const properties = data?.properties || []
  const clients = data?.clients || []
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)
  const [actionError, setActionError] = useState('')
  const [workStream, setWorkStream] = useState<'active' | 'cold'>('active')
  const loadError = queryError instanceof Error ? queryError.message : queryError ? 'Не удалось загрузить объекты из облака.' : ''

  const filteredProperties = properties.filter(prop =>
    (prop.workStream || 'active') === workStream
    && (prop.address || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-700'
      case 'reserved': return 'bg-amber-100 text-amber-700'
      case 'sold': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'available': return 'Доступно'
      case 'reserved': return 'Забронировано'
      case 'sold': return 'Продано'
      default: return status
    }
  }

  const toggleFavorite = async (propertyId: string) => {
    const property = properties.find(p => p.id === propertyId)
    if (!property) return
    setActionError('')
    try {
      await toggleFavoriteRecord(property)
    } catch {
      setActionError('Не удалось обновить избранное.')
    }
  }

  const archiveProperty = async (propertyId: string) => {
    setActionError('')
    try {
      await archivePropertyRecord(propertyId)
    } catch {
      setActionError('Не удалось переместить объект в архив.')
    }
  }

  const deleteProperty = async (propertyId: string) => {
    try {
      await removeProperty(propertyId)
    } catch { setActionError('Не удалось переместить объект в корзину.') }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Объекты</h1>
        <button
          onClick={() => { setEditingProperty(null); setIsModalOpen(true); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-3 text-white transition-all hover:opacity-90 sm:w-auto"
        >
          <Plus className="w-5 h-5" />
          Добавить объект
        </button>
      </div>
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Поиск по адресу..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
        />
      </div>
      <div className="lumi-control grid w-full max-w-xl grid-cols-2 rounded-xl p-1">
        <button type="button" onClick={() => setWorkStream('active')} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${workStream === 'active' ? 'lumi-panel lumi-text shadow-sm' : 'lumi-muted'}`}>Мои объекты в работе · {properties.filter(item => (item.workStream || 'active') === 'active').length}</button>
        <button type="button" onClick={() => setWorkStream('cold')} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${workStream === 'cold' ? 'lumi-panel lumi-text shadow-sm' : 'lumi-muted'}`}>Холодная база · {properties.filter(item => item.workStream === 'cold').length}</button>
      </div>

      {(actionError || loadError) && <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-red-800/50 bg-red-950/25 px-4 py-3 text-sm text-red-300 sm:flex-row sm:items-center"><span>{actionError || `Не удалось загрузить объекты: ${loadError}`}</span>{loadError && <button type="button" onClick={() => void refetch()} className="lumi-control inline-flex items-center gap-2 rounded-lg px-3 py-2 font-semibold"><RefreshCw className="h-4 w-4" />Повторить</button>}</div>}

      {loading && properties.length === 0 ? (
        <div className="lumi-muted flex flex-col items-center justify-center gap-3 py-20"><LoaderCircle className="h-10 w-10 animate-spin" /><p>Загружаем объекты…</p></div>
      ) : filteredProperties.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
          <Search className="w-16 h-16 mb-4 text-gray-300" />
          <p className="text-lg font-medium">Нет объектов</p>
          <p className="text-sm mt-2">Добавьте первый объект недвижимости</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProperties.map((prop) => (
            <div
              key={prop.id}
              className="lumi-content-auto lumi-showcase bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-md transition-all"
            >
              <div className="flex h-48 items-center justify-center overflow-hidden bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30">
                {prop.coverUrl ? <img src={prop.coverUrl} alt={`Главное фото: ${prop.address}`} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="text-center">
                  <Building2 className="lumi-icon-reactive w-12 h-12 mx-auto mb-2 text-gray-500" />
                  <p className="text-sm text-gray-500">Фото нет</p>
                </div>}
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{prop.price?.toLocaleString('ru-RU')} ₽</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{prop.rooms}-комн., {prop.area} м²</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void toggleFavorite(prop.id)
                    }}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                  >
                    <Star className={`w-5 h-5 ${prop.isFavorite ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                  </button>
                </div>
                <p className="text-gray-900 dark:text-white font-semibold mb-3 line-clamp-2">{prop.address}</p>
                <div className="flex items-center justify-between">
                  <span className={`px-3 py-1 text-xs rounded-full font-medium ${getStatusColor(prop.status)}`}>
                    {getStatusText(prop.status)}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate(`/properties/${prop.id}`)}
                    className="flex min-w-32 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-100 px-4 py-2 text-blue-600 transition-colors hover:bg-blue-200"
                  >
                    <Eye className="w-4 h-4" />
                    Просмотр
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingProperty(prop)
                      setIsModalOpen(true)
                    }}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Переместить в архив"
                    onClick={(e) => {
                      e.stopPropagation()
                      void archiveProperty(prop.id)
                    }}
                    className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void deleteProperty(prop.id)
                    }}
                    title="Переместить в корзину на 5 дней"
                    className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PropertyForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        property={editingProperty}
        clients={clients}
      />
    </div>
  )
}

export default PropertiesPage
