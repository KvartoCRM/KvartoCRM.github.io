import {syncNativeReminders} from '../lib/nativeReminders'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {queryClient} from '../lib/queryClient'
import {fetchTasks} from '../lib/tasks'
import {fetchEvents} from '../lib/events'
import type {Task,Event} from '../types'
import type {MiaReceipt} from '../lib/miaCloud'
import NextStepForm from './NextStepForm'
import NewEventForm from './NewEventForm'
export default function MiaActionCard({receipt,userId}:{receipt:MiaReceipt;userId:string}){
 const navigate=useNavigate(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[undone,setUndone]=useState(false),[task,setTask]=useState<Task|null>(null),[event,setEvent]=useState<Event|null>(null)
 async function edit(){setBusy(true);setError('');try{if(receipt.entity==='task'){const row=(await fetchTasks(userId)).find(r=>r.id===receipt.id);if(!row)throw new Error('Задача уже недоступна.');setTask(row)}else if(receipt.entity==='event'){const row=(await fetchEvents(userId)).find(r=>r.id===receipt.id);if(!row)throw new Error('Событие уже недоступно.');setEvent(row)}else navigate(receipt.entity==='contact'?`/contacts?client=${receipt.id}`:receipt.entity==='property'?`/properties/${receipt.id}`:receipt.entity==='deal'?'/deals':'/work')}catch(e){setError(e instanceof Error?e.message:'Не удалось открыть запись.')}finally{setBusy(false)}}
 async function undo(){setBusy(true);setError('');try{const table=receipt.entity==='task'?'tasks':receipt.entity==='event'?'events':null;if(!table||!receipt.revision)throw new Error('Отмена этой записи недоступна.');const result=await supabase.from(table).update({deleted_at:new Date().toISOString()}).eq('user_id',userId).eq('id',receipt.id).eq('updated_at',receipt.revision).is('deleted_at',null).select('id').single();if(result.error)throw new Error('Запись уже изменена или удалена. Откройте её для проверки.');setUndone(true);await queryClient.invalidateQueries();void syncNativeReminders(userId).catch(()=>undefined)}catch(e){setError(e instanceof Error?e.message:'Отмена не подтверждена.')}finally{setBusy(false)}}
 return <article className="lumi-panel-muted space-y-2 rounded-xl border p-3 text-sm"><p className="break-words">{receipt.title}</p><p className="lumi-muted text-xs">{undone?'Перемещено в корзину':receipt.operation==='create'?'Создано':receipt.operation==='archive'?'В архиве':'Изменение сохранено'}</p><div className="flex flex-wrap gap-3"><button disabled={busy} className="lumi-accent-text" onClick={()=>void edit()}>{['task','event'].includes(receipt.entity)?'Открыть и изменить':'Открыть'}</button>{receipt.operation==='create'&&receipt.revision&&['task','event'].includes(receipt.entity)&&!undone&&<button disabled={busy} className="text-red-400" onClick={()=>void undo()}>Отменить создание</button>}</div>{error&&<p role="alert" className="text-amber-400">{error}</p>}{task&&<NextStepForm task={task} onClose={()=>setTask(null)}/>} {event&&<NewEventForm isOpen editData={event} onClose={()=>setEvent(null)}/>}</article>
}
