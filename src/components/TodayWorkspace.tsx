import WorkHistory from './WorkHistory'
import { contactName, contactInitials } from '../lib/contactPresentation'
import { calendarParts, eventStart, shiftDate } from '../lib/scheduling'
import { useListState } from '../hooks/useListState'
import MeetingResultForm from './MeetingResultForm'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, Clock, History, Phone, Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTasks } from '../hooks/useTasks'
import { useEvents } from '../hooks/useEvents'
import { useClientRecords } from '../hooks/useClientRecords'
import { supabase } from '../lib/supabase'
import { queryClient, crmQueryKeys } from '../lib/queryClient'
import { syncNativeReminders } from '../lib/nativeReminders'
import type { Task, Event } from '../types'
import QuickCallForm from './QuickCallForm'
import NewEventForm from './NewEventForm'
import Modal from './Modal'

type AgendaItem = { id:string; title:string; date?:string; time?:string; task?:Task; event?:Event }
export default function TodayWorkspace() {
  const {user}=useAuth()
  const [historyOpen,setHistoryOpen]=useState(false)
  const [filters,setFilters]=useListState(user?.id,'filters:today')
  const [focused,setFocused]=useState('')
  const [contextOpen,setContextOpen]=useState(false)
  const [callContact,setCallContact]=useState('')
  const [resultMeeting,setResultMeeting] = useState<Event|null>(null)
  const tasks=useTasks(user?.id), events=useEvents(user?.id)
  const {data:clients=[]}=useClientRecords(user?.id)
  const [quick,setQuick]=useState<Event | 'new' | null>(null)
  const [meeting,setMeeting]=useState<Event | 'new' | null>(null)
  const [task,setTask]=useState<Task | null>(null)
  const [date,setDate]=useState(''),[time,setTime]=useState('')
  const [error,setError]=useState(''),[busy,setBusy]=useState('')
  const today=calendarParts(new Date()).date, tomorrow=shiftDate(today,1)
  const items:AgendaItem[]=[...(tasks.data || []).filter(t=>!t.isCompleted&&t.status!=='done').map(t=>({id:`task:${t.id}`,title:t.title,date:t.dueDate,time:t.dueTime,task:t})),...(events.data || []).filter(e=>!e.isCompleted).map(e=>{const shown=eventStart(e)?calendarParts(eventStart(e)!):{date:e.eventDate,time:''};return {id:`event:${e.id}`,title:e.title,date:shown.date,time:shown.time,event:e}})].sort((a,b)=>`${a.date || '9999'} ${a.time || '99'}`.localeCompare(`${b.date || '9999'} ${b.time || '99'}`))
  const visible=items.filter(item=>(!filters.type||(item.task?'task':item.event?.type)===filters.type)&&`${item.title} ${clients.find(c=>c.id===item.event?.relatedClientId)?.firstName||''}`.toLocaleLowerCase('ru').includes((filters.query||'').toLocaleLowerCase('ru')))
  const person=clients.find(c=>c.id===(focused||items.find(i=>i.event?.relatedClientId)?.event?.relatedClientId))
  const groups=[{title:'Требуют внимания',test:(i:AgendaItem)=>Boolean(i.date&&i.date<today)},{title:'Сегодня',test:(i:AgendaItem)=>i.date===today},{title:'Завтра',test:(i:AgendaItem)=>i.date===tomorrow},{title:'Позже',test:(i:AgendaItem)=>Boolean(i.date&&i.date>tomorrow)},{title:'Без срока',test:(i:AgendaItem)=>!i.date}]
  const run=async(id:string,action:()=>Promise<unknown>)=>{if(busy)return;setBusy(id);setError('');try{await action();void syncNativeReminders(user!.id).catch(()=>undefined)}catch(cause){setError(cause instanceof Error?cause.message:'Изменение не сохранено. Повторите попытку.')}finally{setBusy('')}}
  const complete=async(item:AgendaItem)=>{
    if(item.task)await tasks.updateStatus({task:item.task,status:'done'})
    else if(item.event){const result=await supabase.from('events').update({is_completed:true}).eq('id',item.event.id).eq('user_id',user!.id).select('id').maybeSingle();if(result.error||!result.data)throw new Error('Сервер не подтвердил завершение встречи.');await queryClient.invalidateQueries({queryKey:crmQueryKeys.events(user!.id)});await queryClient.invalidateQueries({queryKey:crmQueryKeys.overview(user!.id)})}
  }
  const openTask=(value:Task)=>{setTask(value);setDate(value.dueDate || '');setTime(value.dueTime || '')}
  const contextPanel = <><h3 className="lumi-muted text-xs font-semibold uppercase tracking-wide">Контекст клиента</h3>{person?<><div className="mt-4 flex items-center gap-3"><span className="lumi-accent-soft flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-semibold">{contactInitials(person)}</span><div className="min-w-0"><h4 className="lumi-text break-words font-semibold">{contactName(person)}</h4><p className="lumi-muted text-xs">{person.type==='buyer'?'Покупатель':'Собственник'}</p></div></div><a className="lumi-accent-text mt-4 block text-sm" href={`tel:${person.phone.replace(/[^+\d]/g,'')}`}>{person.phone}</a>{person.budget&&<p className="lumi-text mt-3 text-sm">Бюджет: {person.budget.toLocaleString('ru-RU')} ₽</p>}{person.preferredDistricts?.length? <p className="lumi-muted mt-2 text-sm">{person.preferredDistricts.join(', ')}</p>:null}<p className="lumi-muted mt-4 whitespace-pre-wrap text-sm leading-relaxed">{person.contactComment||person.description||'Заметок пока нет.'}</p><button onClick={()=>{setCallContact(person.id);setQuick('new')}} className="lumi-gradient-button mt-5 w-full rounded-xl p-3 text-sm">Записать звонок клиенту</button><Link className="lumi-control mt-2 block rounded-xl p-3 text-center text-sm" to={`/contacts?client=${person.id}`}>Открыть карточку</Link></>:<p className="lumi-muted mt-4 text-sm">Выберите клиента в строке дела. Здесь появятся его контакты и пожелания.</p>}</>
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="lumi-text text-2xl font-bold">Сегодня</h2><p className="lumi-muted mt-1 text-sm">{new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'long'})} · {items.filter(i=>i.date&&i.date<=today).length} дел требуют внимания</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>setHistoryOpen(true)} className="lumi-control inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm"><History className="h-4 w-4"/>История</button><button className="lumi-gradient-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" onClick={()=>{setCallContact('');setQuick('new')}}><Phone className="h-4 w-4"/>Записать звонок</button><button className="lumi-control inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" onClick={()=>setMeeting('new')}><Plus className="h-4 w-4"/>Встреча</button></div></div>
    {(error||tasks.error||events.error)&&<div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/30 p-3 text-sm text-red-400">{error||'Не удалось обновить все дела. Показанные данные могут быть неполными.'}<button className="lumi-control rounded-lg p-2" aria-label="Повторить загрузку" onClick={()=>{void tasks.refetch();void events.refetch()}}><RefreshCw className="h-4 w-4"/></button></div>}
    {(tasks.isPending||events.isPending)&&<p role="status" className="lumi-muted py-4">Загружаем дела…</p>}
    <div className="flex flex-wrap gap-2"><input aria-label="Поиск дел" placeholder="Дело или контакт" className="lumi-control min-w-0 flex-1 rounded-xl px-3 py-2" value={filters.query||''} onChange={e=>setFilters({...filters,query:e.target.value})}/><select aria-label="Тип дела" className="lumi-control rounded-xl px-3 py-2" value={filters.type||''} onChange={e=>setFilters({...filters,type:e.target.value})}><option value="">Все дела</option><option value="call">Звонки</option><option value="meeting">Встречи</option><option value="task">Задачи</option></select>{(filters.query||filters.type)&&<button className="lumi-accent-text px-2 text-sm" onClick={()=>setFilters({})}>Сбросить</button>}</div>
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]"><div className="agenda-list min-w-0 space-y-4">
    {groups.map(group=>{const rows=visible.filter(group.test);if(!rows.length)return null;return <section key={group.title} className="lumi-panel overflow-hidden rounded-xl border"><h3 className="lumi-border lumi-text border-b px-4 py-3 text-sm font-semibold">{group.title} <span className="lumi-muted ml-2 font-normal">{rows.length}</span></h3><div className="divide-y divide-[var(--lumi-border)]">{rows.map(item=><div key={item.id} className="agenda-row px-4 py-3"><div className="agenda-time lumi-muted text-xs"><span className="lumi-text block text-sm font-medium">{item.time?.slice(0,5)||'Без времени'}</span>{item.date&&new Date(`${item.date}T12:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}</div><button className="agenda-title min-w-0 text-left" onClick={()=>item.task?openTask(item.task):setMeeting(item.event!)}><span className="lumi-text block break-words font-medium">{item.title}</span><span className="lumi-muted text-xs">{item.task?'Задача':item.event?.type==='call'?'Звонок':'Встреча'}{item.event?.location?` · ${item.event.location}`:''}</span></button><div className="agenda-actions flex flex-wrap items-center gap-2">{item.event?.relatedClientId&&<button className="lumi-accent-text max-w-40 truncate rounded-lg px-2 py-2 text-xs" onClick={()=>{setFocused(item.event!.relatedClientId!);if(window.matchMedia('(max-width:1279px)').matches)setContextOpen(true)}}>{clients.find(c=>c.id===item.event?.relatedClientId)?contactName(clients.find(c=>c.id===item.event?.relatedClientId)!):"Клиент"}</button>}{item.event?.relatedPropertyId&&<Link className="lumi-accent-text px-2 py-2 text-xs" to={`/properties/${item.event.relatedPropertyId}`}>Объект</Link>}{item.event?.type==='call'?<button className="lumi-control rounded-lg px-3 py-2 text-xs" onClick={()=>{setCallContact('');setQuick(item.event!)}}>Записать итог</button>:item.event?<button className="lumi-control rounded-lg px-3 py-2 text-xs" onClick={()=>setResultMeeting(item.event!)}>Итог встречи</button>:<button disabled={Boolean(busy)} aria-label={`Выполнить: ${item.title}`} className="lumi-control rounded-lg p-2 text-emerald-400 disabled:opacity-50" onClick={()=>void run(item.id,()=>complete(item))}><Check className="h-4 w-4"/></button>}<button aria-label={`Перенести: ${item.title}`} className="lumi-control rounded-lg p-2" onClick={()=>item.task?openTask(item.task):setMeeting(item.event!)}><Clock className="h-4 w-4"/></button></div></div>)}</div></section>})}
    {!visible.length&&items.length>0&&<p className="lumi-muted py-8 text-center">Нет дел по выбранным условиям.</p>}
    </div><aside className="lumi-panel hidden xl:block min-w-0 rounded-2xl border p-5 xl:sticky xl:top-4">{contextPanel}</aside></div><Modal isOpen={contextOpen} onClose={()=>setContextOpen(false)} title="Контакт">{contextPanel}</Modal>
    {!tasks.isPending&&!events.isPending&&!items.length&&!tasks.error&&!events.error&&<div className="lumi-panel rounded-xl border p-10 text-center"><CalendarDays className="lumi-accent-text mx-auto mb-3 h-8 w-8"/><p className="lumi-text">Открытых дел нет</p><p className="lumi-muted mt-2 text-sm">Добавьте встречу или запишите звонок со следующим шагом.</p></div>}
    {historyOpen&&<WorkHistory onClose={()=>setHistoryOpen(false)}/>}
    {resultMeeting&&<MeetingResultForm event={resultMeeting} onClose={()=>setResultMeeting(null)}/>}
    {quick&&<QuickCallForm scheduledEvent={quick==='new'?undefined:quick} contact={callContact?clients.find(c=>c.id===callContact):quick==='new'?undefined:clients.find(c=>c.id===quick.relatedClientId)} onClose={()=>setQuick(null)}/>}
    {meeting&&<NewEventForm isOpen editData={meeting==='new'?null:meeting} onClose={()=>setMeeting(null)}/>}
    {task&&<Modal isOpen title={task.title} onClose={()=>{if(!busy)setTask(null)}}><div className="space-y-4"><p className="lumi-text whitespace-pre-wrap">{task.description||'Описание не добавлено'}</p><form className="space-y-4" onSubmit={e=>{e.preventDefault();void run(task.id,async()=>{await tasks.postpone({task,dueDate:date,dueTime:time});setTask(null)})}}><div className="grid grid-cols-2 gap-3"><label className="lumi-text text-sm">Дата<input required className="lumi-control mt-2 w-full rounded-lg p-3" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="lumi-text text-sm">Время<input className="lumi-control mt-2 w-full rounded-lg p-3" type="time" value={time} onChange={e=>setTime(e.target.value)}/></label></div>{error&&<p role="alert" className="text-sm text-red-400">{error}</p>}<button disabled={Boolean(busy)} className="lumi-gradient-button rounded-xl px-4 py-3">{busy?'Сохраняем…':'Сохранить срок'}</button></form></div></Modal>}
  </div>
}
