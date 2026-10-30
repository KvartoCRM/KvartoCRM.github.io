import { useListScroll } from '../hooks/useListScroll'
import { useListState } from '../hooks/useListState'
import ListFilters from '../components/ListFilters'
import { filterMeetings } from '../lib/listFiltering'
import { localDate } from '../lib/contactPresentation'
import { useState } from 'react'
import { Plus, Edit, Trash2, Calendar, Clock, MapPin, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import NewEventForm from '../components/NewEventForm'
import type { Event } from '../types'
import { useEvents } from '../hooks/useEvents'

const MeetingsPage = ({ eventType = 'meeting' }: { eventType?: 'meeting' | 'call' }) => {
  const { user } = useAuth()
  const { data: events = [], isPending: loading, error: loadError, refetch, removeEvent } = useEvents(user?.id)
  const meetings = events.filter(event => event.type === eventType)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<Event | null>(null)
  const [actionError, setActionError] = useState('')
  useListScroll(user?.id, 'meetings', !loading)
  const [filters, setFilters] = useListState(user?.id, `filters:${eventType}`)
  const visibleMeetings = filterMeetings(meetings, filters)

  const deleteMeeting = async (id: string) => {
    if (!user) return
    setActionError('')
    try {
      await removeEvent(id)
    } catch {
      setActionError('Не удалось переместить встречу в корзину.')
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'showing': return 'from-emerald-500 to-teal-500'
      default: return 'from-purple-500 to-violet-500'
    }
  }

  const getTypeText = (type: string) => {
    switch (type) {
      case 'call': return 'Звонок'
      case 'showing': return 'Показ'
      default: return 'Встреча'
    }
  }

  const handleEdit = (meeting: Event) => {
    setEditingMeeting(meeting)
    setIsModalOpen(true)
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh] text-gray-500 dark:text-gray-400">Загрузка...</div>
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{eventType === 'call' ? 'Запланированные звонки' : 'Встречи'}</h1>
        <button
          onClick={() => {
          setEditingMeeting(null)
          setIsModalOpen(true)
        }}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-all flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Новое событие
        </button>
      </div>

      <ListFilters scope={eventType} onApply={setFilters} values={filters} onChange={(key, value) => setFilters(current => ({ ...current, [key]: value }))} onReset={() => setFilters({})} count={visibleMeetings.length} total={meetings.length} defaultSort="date" defaultDirection="asc" sortOptions={[{value:'date',label:'Дата и время'},{value:'name',label:'Название'},{value:'location',label:'Место'},{value:'created',label:'Дата создания'}]} fields={[
        {key:'query',label:'Название, место или заметка'},
        {key:'status',label:'Статус',options:[{value:'planned',label:'Запланированные'},{value:'completed',label:'Завершённые'}]},
        {key:'from',label:'Дата с',type:'date'},{key:'to',label:'Дата по',type:'date'},
        {key:'timeFrom',label:'Время суток с',type:'time'},{key:'timeTo',label:'Время суток до',type:'time'},
      ]}>
        <div className="flex flex-wrap gap-2">{[0, 7].map(days => <button key={days} type="button" className="lumi-control rounded-lg px-3 py-1.5 text-xs" onClick={() => { const end = new Date(); end.setDate(end.getDate() + Math.max(0, days - 1)); setFilters(current => ({...current,period:days ? 'next7' : 'today',from:localDate(),to:localDate(end)})) }}>{days ? 'Ближайшие 7 дней' : 'Сегодня'}</button>)}</div>
        {(filters.from && filters.to && filters.from > filters.to || filters.timeFrom && filters.timeTo && filters.timeFrom > filters.timeTo) && <p role="alert" className="text-sm text-amber-400">Начало периода должно быть не позже окончания.</p>}
      </ListFilters>

      {(actionError || loadError) && <div className="flex flex-col gap-3 rounded-xl border border-red-700/40 bg-red-950/20 px-4 py-3 text-sm text-red-300 sm:flex-row sm:items-center sm:justify-between"><span>{actionError || 'Не удалось обновить календарь из облака. Показана копия с устройства.'}</span>{loadError && <button type="button" onClick={() => void refetch()} className="lumi-control inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-semibold"><RefreshCw className="h-4 w-4" />Повторить</button>}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 flex-1 content-start">
        {visibleMeetings.map((meeting, i) => {
        return (
          <motion.div
            key={meeting.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-md transition-all"
          >
            <div className={`h-2 bg-gradient-to-r ${getTypeColor(meeting.type)}`} />
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <span className={`inline-block px-3 py-1 text-xs rounded-full font-medium mb-3 ${getTypeColor(meeting.type) === 'from-emerald-500 to-teal-500' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'}`}>
                    {getTypeText(meeting.type)}
                  </span>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{meeting.title}</h3>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(meeting)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"
                  >
                    <Edit className="w-5 h-5 text-gray-500 dark:text-gray-300" />
                  </button>
                  <button
                    onClick={() => deleteMeeting(meeting.id)}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl"
                  >
                    <Trash2 className="w-5 h-5 text-red-500" />
                  </button>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <span className="font-medium">{meeting.eventDate}</span>
                </div>
                {meeting.eventTime && (
                  <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <span className="font-medium">{meeting.eventTime}</span>
                  </div>
                )}
                {meeting.location && (
                  <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    <span>{meeting.location}</span>
                  </div>
                )}
                {meeting.notes && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{meeting.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )
      })}

        {visibleMeetings.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
            <Calendar className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-lg font-medium">{meetings.length ? 'Ничего не найдено' : eventType === 'call' ? 'Нет запланированных звонков' : 'Нет запланированных встреч'}</p>
            <p className="text-sm mt-2">{meetings.length ? 'Измените фильтры или сбросьте условия.' : 'Создайте новое событие'}</p>
          </div>
        )}
      </div>

      <NewEventForm defaultType={eventType}
        isOpen={isModalOpen}
        onClose={() => {
        setIsModalOpen(false)
        setEditingMeeting(null)
      }}
        editData={editingMeeting}
      />
    </div>
  )
}

export default MeetingsPage
