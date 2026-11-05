import type {Client,Event,Task} from '../types/index.ts'
import type {HistoryEntry} from './workHistory.ts'
export function contactAttention(clients:Client[],history:HistoryEntry[],events:Event[],tasks:Task[],today:string){
 const threshold=new Date(`${today}T12:00:00Z`);threshold.setUTCDate(threshold.getUTCDate()-14)
 const old=threshold.toISOString().slice(0,10)
 return clients.flatMap(client=>{
  if(client.leadTemperature==='cold'||['archived','inactive','closed'].includes(client.status||''))return []
  const planned=[...events.filter(e=>!e.isCompleted&&e.relatedClientId===client.id).map(e=>e.eventDate),...tasks.filter(t=>!t.isCompleted&&t.status!=='done'&&t.smartCriteria?.clientId===client.id).map(t=>t.dueDate||'')].filter(Boolean).sort()
  const last=[client.lastContactDate?.slice(0,10)||'',...history.filter(h=>h.clientId===client.id&&['call','meeting','message'].includes(h.kind)).map(h=>h.date)].filter(Boolean).sort().reverse()[0]
  if(planned.some(d=>d<today))return [{client,reason:'Есть просроченный следующий шаг',date:planned[0]}]
  if(planned.length)return []
  if(client.nextContactDate&&client.nextContactDate.slice(0,10)<=today)return [{client,reason:'Наступила дата следующего контакта',date:client.nextContactDate.slice(0,10)}]
  if(last&&last<=old)return [{client,reason:'Более 14 дней без контакта, следующий шаг не задан',date:last}]
  return []
 }).sort((a,b)=>a.date.localeCompare(b.date))
}
export function reportPeriod(today:string){const end=new Date(`${today}T12:00:00Z`);end.setUTCDate(end.getUTCDate()-((end.getUTCDay()+3)%7));const start=new Date(end);start.setUTCDate(start.getUTCDate()-7);return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)}}
