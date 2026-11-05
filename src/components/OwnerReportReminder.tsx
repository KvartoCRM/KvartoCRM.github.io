import {useEffect,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useTasks} from '../hooks/useTasks'
import {saveTask} from '../lib/tasks'
import {recurrenceId} from '../lib/recurrenceIdentity'
import {calendarParts,shiftDate} from '../lib/scheduling'
import {queryClient,crmQueryKeys} from '../lib/queryClient'
import {syncNativeReminders} from '../lib/nativeReminders'
export default function OwnerReportReminder({open}:{open:()=>void}){
 const {user}=useAuth(),tasks=useTasks(user?.id),[error,setError]=useState('')
 useEffect(()=>{if(!user||tasks.isPending||tasks.error)return;let active=true;const ensure=async()=>{
  const id=await recurrenceId(user.id,'owner-reports-thursday-v1')
  if((tasks.data||[]).some(t=>t.id===id||t.parentTaskId===id))return
  const today=calendarParts(new Date()).date,day=new Date(`${today}T12:00:00Z`).getUTCDay(),date=shiftDate(today,(4-day+7)%7)
  try{await saveTask(user.id,{title:'Подготовить отчёты собственникам',description:'Откройте Дела → Сегодня → Отчёты собственникам. Проверьте статистику и черновики перед ручной отправкой.',status:'todo',priority:'medium',dueDate:date,dueTime:'10:00',smartCriteria:{timeZone:'Europe/Moscow'},eisenhowerQuadrant:'plan',recurrenceRule:'weekly'},undefined,id);await queryClient.invalidateQueries({queryKey:crmQueryKeys.tasks(user.id)});void syncNativeReminders(user.id).catch(()=>undefined)}catch{if(active)setError('Не удалось подтвердить напоминание. Обновите страницу для повторной попытки.')}
 };void ensure();return()=>{active=false}},[user,tasks.data,tasks.isPending,tasks.error])
 return <div className="lumi-panel rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="lumi-text font-semibold">Четверг · отчёты собственникам</p><p className="lumi-muted text-sm">10:00 Москва. После выполнения создаётся задача на следующую неделю.</p></div><button className="lumi-control rounded-xl px-4 py-3" onClick={open}>Открыть отчёты</button></div>{error&&<p role="alert" className="text-red-400 text-sm mt-2">{error}</p>}</div>
}
