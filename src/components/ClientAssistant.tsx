import {useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useWorkHistory} from '../hooks/useWorkHistory'
import {useEvents} from '../hooks/useEvents'
import {useTasks} from '../hooks/useTasks'
import {contactName} from '../lib/contactPresentation'
import type {Client} from '../types'
import AiDraft from './AiDraft'
export default function ClientAssistant({client}:{client:Client}){
 const {user}=useAuth(),history=useWorkHistory(user?.id),events=useEvents(user?.id),tasks=useTasks(user?.id)
 const [mode,setMode]=useState<'summary'|'message'|null>(null)
 const entries=(history.data||[]).filter(r=>r.clientId===client.id)
 const context=JSON.stringify({client:contactName(client),notes:(client.contactComment||client.description||'').slice(0,2000),historyNote:`Последние ${Math.min(entries.length,20)} из ${entries.length} записей, заметки до 400 символов. Это выборка, не полная история.`,history:entries.slice(0,20).map(({id,date,kind,notes,outcome})=>({id,date,kind,notes:notes.slice(0,400),outcome})),plannedEvents:(events.data||[]).filter(e=>!e.isCompleted&&e.relatedClientId===client.id).map(e=>({id:e.id,date:e.eventDate,title:e.title})),plannedTasks:(tasks.data||[]).filter(t=>!t.isCompleted&&t.smartCriteria?.clientId===client.id).map(t=>({id:t.id,date:t.dueDate,title:t.title}))},null,2)
 const ready=!history.isPending&&!history.isError&&!events.isPending&&!events.error&&!tasks.isPending&&!tasks.error
 return <div className="flex flex-wrap gap-2"><button disabled={!ready} className="lumi-control rounded-xl px-4 py-3 text-sm disabled:opacity-50" onClick={()=>setMode('summary')}>ИИ: кратко о клиенте</button><button disabled={!ready} className="lumi-control rounded-xl px-4 py-3 text-sm disabled:opacity-50" onClick={()=>setMode('message')}>ИИ: сообщение</button>{!ready&&<span className="lumi-muted text-xs">Для помощника нужна загруженная история.</span>}{mode&&<AiDraft mode={mode} context={{clientId:client.id}} initialText={context.slice(0,14500)} onClose={()=>setMode(null)}/>}</div>
}
