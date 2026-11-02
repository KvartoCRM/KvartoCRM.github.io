import MeetingResultForm from '../components/MeetingResultForm'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, List, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEvents } from '../hooks/useEvents'
import { useContacts } from '../hooks/useContacts'
import { useAccountState } from '../hooks/useAccountState'
import { calendarParts, eventDuration, eventStart, shiftDate, weekDates, DEFAULT_ZONE } from '../lib/scheduling'
import { contactName } from '../lib/contactPresentation'
import NewEventForm from '../components/NewEventForm'
import type { Event } from '../types'

export default function CalendarPage() {
  const { user } = useAuth()
  const query = useEvents(user?.id)
  const contacts = useContacts(user?.id)
  const [view,setView] = useAccountState(user?.id,'calendar:view', window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week')
  const [date,setDate] = useState(calendarParts(new Date()).date)
  const [type,setType] = useState('')
  const [client,setClient] = useState('')
  const [search,setSearch] = useState('')
  const [resultMeeting,setResultMeeting] = useState<Event|null>(null)
  const [editing,setEditing] = useState<Event|null>(null)
  const [creating,setCreating] = useState<{date:string;time:string}|null>(null)
  const [showCompleted,setShowCompleted] = useState(false)
  const days = view === 'week' ? weekDates(date) : [date]
  const events = (query.data || []).filter(event => (!type || event.type === type) && (!client || event.relatedClientId === client) && (showCompleted || !event.isCompleted) && `${event.title} ${event.location || ''}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')))
  const byDay = (day:string) => events.filter(event => (eventStart(event) ? calendarParts(eventStart(event)!,DEFAULT_ZONE).date : event.eventDate) === day).sort((a,b)=>(eventStart(a)?.getTime() || 0)-(eventStart(b)?.getTime() || 0))
  const name = (event:Event) => { const person=contacts.data?.find(item=>item.id===event.relatedClientId); return person ? contactName(person) : '' }
  const time = (event:Event) => eventStart(event) ? calendarParts(eventStart(event)!,DEFAULT_ZONE).time : 'Без времени'
  const card = (event:Event) => <button key={event.id} onClick={()=>setEditing(event)} className={`calendar-event ${event.type==='call'?'calendar-call':''} ${event.isCompleted?'opacity-60':''}`}><span className="block text-xs font-medium">{time(event)} · {eventDuration(event)} мин · {event.isCompleted?'Выполнено':event.type==='call'?'Звонок':'Встреча'}</span><strong className="mt-1 block break-words text-sm">{event.title}</strong>{name(event)&&<span className="mt-1 block truncate text-xs">{name(event)}</span>}</button>
  const hours = Array.from({length: Math.max(20,...events.filter(e=>e.eventTime).map(e=>Number(time(e).slice(0,2))))-Math.min(8,...events.filter(e=>e.eventTime).map(e=>Number(time(e).slice(0,2))))+1},(_,i)=>i+Math.min(8,...events.filter(e=>e.eventTime).map(e=>Number(time(e).slice(0,2)))))
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="lumi-accent-text text-sm">Расписание</p><h1 className="lumi-text text-2xl font-bold">Календарь</h1><p className="lumi-muted mt-1 text-sm">Встречи и будущие звонки · время Москвы (UTC+3)</p></div><button className="lumi-gradient-button flex items-center gap-2 rounded-xl px-4 py-2.5" onClick={()=>setCreating({date,time:'10:00'})}><Plus size={18}/>Назначить</button></header>
    <div className="flex flex-wrap items-center gap-2"><div className="lumi-panel flex rounded-xl border p-1" role="group" aria-label="Вид календаря">{[['day','День',Clock],['week','Неделя',CalendarDays],['list','Список',List]].map(([id,label,Icon])=>{const Glyph=Icon as typeof Clock;return <button key={String(id)} aria-pressed={view===id} onClick={()=>setView(String(id))} className={`${view===id?'lumi-accent-soft':'lumi-muted'} flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm`}><Glyph size={16}/>{String(label)}</button>})}</div><button aria-label="Предыдущий период" className="lumi-control rounded-lg p-2" onClick={()=>setDate(shiftDate(date,view==='week'?-7:-1))}><ChevronLeft size={20}/></button><input aria-label="Дата календаря" type="date" value={date} onChange={e=>e.target.value&&setDate(e.target.value)} className="lumi-control min-w-0 rounded-lg px-2 py-2"/><button aria-label="Следующий период" className="lumi-control rounded-lg p-2" onClick={()=>setDate(shiftDate(date,view==='week'?7:1))}><ChevronRight size={20}/></button><button className="lumi-control rounded-lg px-3 py-2 text-sm" onClick={()=>setDate(calendarParts(new Date()).date)}>Сегодня</button></div>
    <div className="flex flex-wrap gap-2"><input aria-label="Поиск в расписании" placeholder="Название или место" value={search} onChange={e=>setSearch(e.target.value)} className="lumi-control min-w-0 flex-1 rounded-xl px-3 py-2"/><select aria-label="Тип события" value={type} onChange={e=>setType(e.target.value)} className="lumi-control rounded-xl px-3 py-2"><option value="">Все события</option><option value="meeting">Встречи</option><option value="call">Звонки</option></select><select aria-label="Участник" value={client} onChange={e=>setClient(e.target.value)} className="lumi-control max-w-full rounded-xl px-3 py-2"><option value="">Все контакты</option>{contacts.data?.map(person=><option key={person.id} value={person.id}>{contactName(person)}</option>)}</select><label className="lumi-muted flex items-center gap-2 text-sm"><input type="checkbox" checked={showCompleted} onChange={e=>setShowCompleted(e.target.checked)}/>Выполненные</label></div>
    {query.error ? <div role="alert" className="text-red-400">Не удалось загрузить расписание. <button onClick={()=>void query.refetch()}>Повторить</button></div> : query.isPending ? <p className="lumi-muted">Загружаем расписание…</p> : <>
      <div className={view==='list'?'space-y-3':'calendar-mobile space-y-3'}>{days.map(day=><section key={day}><h2 className="lumi-text mb-2 font-semibold">{new Date(day+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}</h2>{byDay(day).length ? <div className="grid gap-2">{byDay(day).map(card)}</div> : <p className="lumi-muted py-3 text-sm">{search||client||type?'Нет событий по выбранным условиям.':'Нет запланированных дел.'}</p>}</section>)}</div>
      {view!=='list'&&<div className="calendar-desktop lumi-panel overflow-hidden rounded-2xl border"><div className="calendar-grid" style={{gridTemplateColumns:`52px repeat(${days.length},minmax(0,1fr))`}}><div/>{days.map(day=><div key={day} className="lumi-border lumi-text border-b p-2 text-center text-sm font-semibold">{new Date(day+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'})}</div>)}<div className="lumi-muted p-1 text-xs">Без часа</div>{days.map(day=><div key={day} className="min-w-0 p-1">{byDay(day).filter(e=>!e.eventTime).map(card)}</div>)}{hours.map(hour=><div key={hour} className="contents"><time className="lumi-muted lumi-border border-t pt-1 text-center text-xs">{String(hour).padStart(2,'0')}:00</time>{days.map(day=><div key={day} className="lumi-border min-h-16 min-w-0 border-l border-t p-1"><button aria-label={`Назначить ${day} ${hour}:00`} onClick={()=>setCreating({date:day,time:`${String(hour).padStart(2,'0')}:00`})} className="calendar-slot w-full rounded py-1 text-xs">+ {String(hour).padStart(2,'0')}:00</button>{byDay(day).filter(e=>e.eventTime&&Number(time(e).slice(0,2))===hour).map(card)}</div>)}</div>)}</div></div>}
      <div className="flex flex-wrap gap-2">{byDay(date).filter(e=>e.type==='meeting'&&!e.isCompleted).map(e=><button key={e.id} className="lumi-control rounded-lg px-3 py-2 text-xs" onClick={()=>setResultMeeting(e)}>Итог: {e.title}</button>)}</div>
      <p className="lumi-muted text-xs">{days.reduce((count,day)=>count+byDay(day).length,0)} событий в выбранном периоде · <Link to="/work?view=calls" className="lumi-accent-text">Журнал состоявшихся звонков</Link></p>
    </>}
    {resultMeeting&&<MeetingResultForm event={resultMeeting} onClose={()=>setResultMeeting(null)}/>}
    {(editing||creating)&&<NewEventForm isOpen editData={editing} initialDate={creating?.date} initialTime={creating?.time} onClose={()=>{setEditing(null);setCreating(null)}}/>}
  </div>
}
