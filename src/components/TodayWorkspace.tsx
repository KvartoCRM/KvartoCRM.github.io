import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, Clock, Phone, Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTasks } from '../hooks/useTasks'
import { useEvents } from '../hooks/useEvents'
import { useClientRecords } from '../hooks/useClientRecords'
import { localDate } from '../lib/contactPresentation'
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
  const tasks=useTasks(user?.id), events=useEvents(user?.id)
  const {data:clients=[]}=useClientRecords(user?.id)
  const [quick,setQuick]=useState<Event | 'new' | null>(null)
  const [meeting,setMeeting]=useState<Event | 'new' | null>(null)
  const [task,setTask]=useState<Task | null>(null)
  const [date,setDate]=useState(''),[time,setTime]=useState('')
  const [error,setError]=useState(''),[busy,setBusy]=useState('')
  const today=localDate(), tomorrowDate=new Date();tomorrowDate.setDate(tomorrowDate.getDate()+1)
  const tomorrow=localDate(tomorrowDate)
  const items:AgendaItem[]=[...(tasks.data || []).filter(t=>!t.isCompleted&&t.status!=='done').map(t=>({id:`task:${t.id}`,title:t.title,date:t.dueDate,time:t.dueTime,task:t})),...(events.data || []).filter(e=>!e.isCompleted).map(e=>({id:`event:${e.id}`,title:e.title,date:e.eventDate,time:e.eventTime,event:e}))].sort((a,b)=>`${a.date || '9999'} ${a.time || '99'}`.localeCompare(`${b.date || '9999'} ${b.time || '99'}`))
  const groups=[{title:'Требуют внимания',test:(i:AgendaItem)=>Boolean(i.date&&i.date<today)},{title:'Сегодня',test:(i:AgendaItem)=>i.date===today},{title:'Завтра',test:(i:AgendaItem)=>i.date===tomorrow},{title:'Позже',test:(i:AgendaItem)=>Boolean(i.date&&i.date>tomorrow)},{title:'Без срока',test:(i:AgendaItem)=>!i.date}]
  const run=async(id:string,action:()=>Promise<unknown>)=>{if(busy)return;setBusy(id);setError('');try{await action();void syncNativeReminders(user!.id).catch(()=>undefined)}catch(cause){setError(cause instanceof Error?cause.message:'Изменение не сохранено. Повторите попытку.')}finally{setBusy('')}}
  const complete=async(item:AgendaItem)=>{
    if(item.task)await tasks.updateStatus({task:item.task,status:'done'})
    else if(item.event){const result=await supabase.from('events').update({is_completed:true}).eq('id',item.event.id).eq('user_id',user!.id).select('id').maybeSingle();if(result.error||!result.data)throw new Error('Сервер не подтвердил завершение встречи.');await queryClient.invalidateQueries({queryKey:crmQueryKeys.events(user!.id)});await queryClient.invalidateQueries({queryKey:crmQueryKeys.overview(user!.id)})}
  }
  const openTask=(value:Task)=>{setTask(value);setDate(value.dueDate || '');setTime(value.dueTime || '')}
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="lumi-text text-2xl font-bold">Сегодня</h2><p className="lumi-muted mt-1 text-sm">{new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'long'})} · {items.filter(i=>i.date&&i.date<=today).length} дел требуют внимания</p></div><div className="flex flex-wrap gap-2"><button className="lumi-gradient-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" onClick={()=>setQuick('new')}><Phone className="h-4 w-4"/>Записать звонок</button><button className="lumi-control inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" onClick={()=>setMeeting('new')}><Plus className="h-4 w-4"/>Встреча</button></div></div>
    {(error||tasks.error||events.error)&&<div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/30 p-3 text-sm text-red-400">{error||'Не удалось обновить все дела. Показанные данные могут быть неполными.'}<button className="lumi-control rounded-lg p-2" aria-label="Повторить загрузку" onClick={()=>{void tasks.refetch();void events.refetch()}}><RefreshCw className="h-4 w-4"/></button></div>}
    {(tasks.isPending||events.isPending)&&<p role="status" className="lumi-muted py-4">Загружаем дела…</p>}
    {groups.map(group=>{const rows=items.filter(group.test);if(!rows.length)return null;return <section key={group.title} className="lumi-panel overflow-hidden rounded-xl border"><h3 className="lumi-border lumi-text border-b px-4 py-3 text-sm font-semibold">{group.title} <span className="lumi-muted ml-2 font-normal">{rows.length}</span></h3><div className="divide-y divide-[var(--lumi-border)]">{rows.map(item=><div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><div className="lumi-muted w-24 shrink-0 text-xs"><span className="lumi-text block text-sm font-medium">{item.time?.slice(0,5)||'Без времени'}</span>{item.date&&new Date(`${item.date}T12:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}</div><button className="min-w-0 flex-1 text-left" onClick={()=>item.task?openTask(item.task):setMeeting(item.event!)}><span className="lumi-text block break-words font-medium">{item.title}</span><span className="lumi-muted text-xs">{item.task?'Задача':item.event?.type==='call'?'Звонок':'Встреча'}{item.event?.location?` · ${item.event.location}`:''}</span></button><div className="flex flex-wrap items-center gap-2">{item.event?.relatedClientId&&<Link className="lumi-accent-text rounded-lg px-2 py-2 text-xs" to={`/contacts?client=${encodeURIComponent(item.event.relatedClientId)}`}>Клиент</Link>}{item.event?.type==='call'?<button className="lumi-control rounded-lg px-3 py-2 text-xs" onClick={()=>setQuick(item.event!)}>Записать итог</button>:<button disabled={Boolean(busy)} aria-label={`Выполнить: ${item.title}`} className="lumi-control rounded-lg p-2 text-emerald-400 disabled:opacity-50" onClick={()=>void run(item.id,()=>complete(item))}><Check className="h-4 w-4"/></button>}<button aria-label={`Перенести: ${item.title}`} className="lumi-control rounded-lg p-2" onClick={()=>item.task?openTask(item.task):setMeeting(item.event!)}><Clock className="h-4 w-4"/></button></div></div>)}</div></section>})}
    {!tasks.isPending&&!events.isPending&&!items.length&&!tasks.error&&!events.error&&<div className="lumi-panel rounded-xl border p-10 text-center"><CalendarDays className="lumi-accent-text mx-auto mb-3 h-8 w-8"/><p className="lumi-text">Открытых дел нет</p><p className="lumi-muted mt-2 text-sm">Добавьте встречу или запишите звонок со следующим шагом.</p></div>}
    {quick&&<QuickCallForm scheduledEvent={quick==='new'?undefined:quick} contact={quick==='new'?undefined:clients.find(c=>c.id===quick.relatedClientId)} onClose={()=>setQuick(null)}/>}
    {meeting&&<NewEventForm isOpen editData={meeting==='new'?null:meeting} onClose={()=>setMeeting(null)}/>}
    {task&&<Modal isOpen title={task.title} onClose={()=>{if(!busy)setTask(null)}}><div className="space-y-4"><p className="lumi-text whitespace-pre-wrap">{task.description||'Описание не добавлено'}</p><form className="space-y-4" onSubmit={e=>{e.preventDefault();void run(task.id,async()=>{await tasks.postpone({task,dueDate:date,dueTime:time});setTask(null)})}}><div className="grid grid-cols-2 gap-3"><label className="lumi-text text-sm">Дата<input required className="lumi-control mt-2 w-full rounded-lg p-3" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="lumi-text text-sm">Время<input className="lumi-control mt-2 w-full rounded-lg p-3" type="time" value={time} onChange={e=>setTime(e.target.value)}/></label></div>{error&&<p role="alert" className="text-sm text-red-400">{error}</p>}<button disabled={Boolean(busy)} className="lumi-gradient-button rounded-xl px-4 py-3">{busy?'Сохраняем…':'Сохранить срок'}</button></form></div></Modal>}
  </div>
}
