import {useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useWorkHistory} from '../hooks/useWorkHistory'
import {useClientRecords} from '../hooks/useClientRecords'
import {useEvents} from '../hooks/useEvents'
import {useTasks} from '../hooks/useTasks'
import {contactAttention} from '../lib/workday'
import {contactName} from '../lib/contactPresentation'
import {calendarParts} from '../lib/scheduling'
import NextStepForm from './NextStepForm'
import WorkHistory from './WorkHistory'
export default function ContactAttention(){
 const {user}=useAuth(),history=useWorkHistory(user?.id),clients=useClientRecords(user?.id),events=useEvents(user?.id),tasks=useTasks(user?.id)
 const [step,setStep]=useState(''),[clientHistory,setHistory]=useState(''),[limit,setLimit]=useState(5)
 const failed=history.isError||clients.error||events.error||tasks.error
 const loading=history.isPending||clients.isPending||events.isPending||tasks.isPending
 const rows=failed||loading?[]:contactAttention(clients.data||[],history.data||[],events.data||[],tasks.data||[],calendarParts(new Date()).date)
 return <details className="lumi-panel rounded-2xl border p-4"><summary className="lumi-text cursor-pointer font-semibold">Кому пора написать или позвонить{!loading&&!failed&&` · ${rows.length}`}</summary><p className="lumi-muted mt-2 text-xs">Просроченные шаги и контакты без общения от 14 дней. Холодная база исключена.</p>{failed?<p role="alert" className="text-red-400 text-sm">Не удалось загрузить данные. Обновите страницу.</p>:loading?<p className="lumi-muted py-3">Загрузка…</p>:!rows.length?<p className="lumi-muted py-3">По этим правилам напоминаний нет.</p>:rows.slice(0,limit).map(({client,reason,date})=><article key={client.id} className="lumi-border mt-3 border-t pt-3"><p className="lumi-text font-semibold">{contactName(client)}</p><p className="lumi-muted text-sm">{reason} · {date}</p><div className="mt-2 flex flex-wrap gap-2"><button className="lumi-control rounded-lg p-3 text-sm" onClick={()=>setStep(client.id)}>Следующий шаг</button><button className="lumi-control rounded-lg p-3 text-sm" onClick={()=>setHistory(client.id)}>История</button>{client.phone&&<a className="lumi-accent-text p-3 text-sm" href={`tel:${client.phone.replace(/[^+\d]/g,'')}`}>Позвонить</a>}</div></article>)}{rows.length>limit&&<button className="lumi-accent-text p-3" onClick={()=>setLimit(n=>n+10)}>Показать ещё</button>}{step&&<NextStepForm context={{clientId:step,kind:'call',title:'Связаться с клиентом'}} onClose={()=>setStep('')}/>}{clientHistory&&<WorkHistory clientId={clientHistory} onClose={()=>setHistory('')}/>}</details>
}
