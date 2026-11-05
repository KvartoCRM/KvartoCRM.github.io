import {buildWorkHistory} from '../lib/workHistory'
import {useAccountState} from '../hooks/useAccountState'
import {accountKey,readAccountValue,writeAccountValue} from '../lib/accountStorage'
import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {fetchContactRecords} from '../lib/contacts'
import {fetchPropertyCatalog} from '../lib/propertyCatalog'
import {askAssistant} from '../lib/assistant'
import {contactName} from '../lib/contactPresentation'
import {calendarParts,zonedInstant} from '../lib/scheduling'
import {miaPages,nextMonday,validateMiaRecord,type MiaRecord} from '../lib/mia'
import {supabase} from '../lib/supabase'
import {fetchAllRows} from '../lib/pagination'
import {saveTask} from '../lib/tasks'
import {queryClient} from '../lib/queryClient'
import OwnerReports from './OwnerReports'
import WorkHistory from './WorkHistory'
type Message={role:'user'|'assistant';text:string}
const emptyMessages:Message[]=[]
export default function MiaChat(){
 const {user}=useAuth(),navigate=useNavigate()
 const [open,setOpen]=useState(false),[large,setLarge]=useState(false),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[reports,setReports]=useState(false),[history,setHistory]=useState(false)
 const [messages,setMessages]=useAccountState<Message[]>(user?.id,'draft:mia-messages',emptyMessages)
 const scroller=useRef<HTMLDivElement>(null),abort=useRef<AbortController|null>(null),account=useRef(user?.id)
 const pending=useRef<{id:string;record:MiaRecord;meetingSaved:boolean}|null>(null)
 useEffect(()=>{account.current=user?.id;abort.current?.abort();try{pending.current=JSON.parse(user?.id?readAccountValue(accountKey(user.id,'draft:mia-pending'))||'null':'null')}catch{pending.current=null};setInput('');setBusy(false);setOpen(false)},[user?.id])
 useEffect(()=>()=>abort.current?.abort(),[])
 useEffect(()=>{if(open&&scroller.current)scroller.current.scrollTop=scroller.current.scrollHeight},[open,messages,busy])
 const add=(text:string)=>setMessages(m=>[...m,{role:'assistant',text}])
 const persistPending=(userId:string,value:typeof pending.current=pending.current)=>writeAccountValue(accountKey(userId,'draft:mia-pending'),JSON.stringify(value))
 const save=async(userId:string)=>{
  const p=pending.current;if(!p)return
  const clients=await fetchContactRecords(userId),catalog=await fetchPropertyCatalog(userId)
  const r=validateMiaRecord(p.record,clients,catalog.properties)
  if(account.current!==userId)throw new Error('Аккаунт изменился.')
  if(r.meeting&&!p.meetingSaved){
   const payload={id:p.id,user_id:userId,client_id:r.clientId,property_id:r.propertyId,type:'meeting',status:'completed',outcome:'Состоялся',title:'Показ квартиры',notes:r.meeting.notes,occurred_at:zonedInstant(r.meeting.date,'12:00').toISOString(),metadata:{source:'mia',date_only:true}}
   const result=await supabase.from('crm_activities').insert(payload).select('id').single()
   if(result.error){const check=await supabase.from('crm_activities').select('id,notes,client_id,property_id').eq('id',p.id).eq('user_id',userId).is('deleted_at',null).maybeSingle();if(check.error||check.data?.notes!==payload.notes||check.data?.client_id!==r.clientId||check.data?.property_id!==r.propertyId)throw new Error('Не удалось подтвердить запись показа. Повторите сохранение.')}p.meetingSaved=true;persistPending(userId,p)
  }
  if(account.current!==userId)throw new Error('Аккаунт изменился.')
  if(r.task)await saveTask(userId,{title:r.task.title,description:r.task.notes,status:'todo',priority:'medium',dueDate:r.task.date,smartCriteria:{clientId:r.clientId||undefined,propertyId:r.propertyId||undefined,timeZone:'Europe/Moscow'},eisenhowerQuadrant:'plan'},undefined,p.id)
  persistPending(userId,null);if(account.current!==userId)return;pending.current=null;await queryClient.invalidateQueries()
  add([r.meeting?'Показ записан.':'',r.task?`Задача «${r.task.title}» создана на ${new Date(r.task.date+'T12:00').toLocaleDateString('ru-RU')}.`:''].filter(Boolean).join(' '))
 }
 const send=async()=>{
  if(!user||busy||!input.trim()||pending.current)return
  const userId=user.id,question=input.trim();setInput('');setBusy(true)
  const conversation=[...messages,{role:'user' as const,text:question}];setMessages(conversation)
  abort.current=new AbortController()
  try{
   const [clients,catalog]=await Promise.all([fetchContactRecords(userId),fetchPropertyCatalog(userId)])
   const today=calendarParts(new Date()).date
   let context=JSON.stringify({profile:{name:user.firstName||user.displayName},today,nextMonday:nextMonday(today),page:location.pathname,contacts:clients.filter(c=>c.status!=='archived').slice(0,40).map(c=>({id:c.id,name:contactName(c),role:c.type})),properties:catalog.properties.slice(0,40).map(p=>({id:p.id,address:p.address,ownerId:p.ownerId})),indexNote:'Это первые 40 контактов и объектов. Для поиска и истории используй lookup.',conversation:conversation.slice(-8)})
   if(context.length>15500)throw new Error('Слишком много данных для одного запроса. Этот режим пока требует более компактной базы или короткой беседы.')
   let result=await askAssistant('mia',context,[],abort.current.signal)
   for(let attempt=0;attempt<3;attempt++){
    const lookup=result.mia as {type?:string;entity?:string;query?:string;clientId?:string;propertyId?:string}|null
    if(lookup?.type!=='lookup')break
    let found:unknown[]=[]
    const q=String(lookup.query||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim()
    const matches=(s:string)=>!q||q.split(/\s+/).every(w=>s.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').includes(w))
    if(lookup.entity==='contacts')found=clients.filter(c=>matches(contactName(c))).slice(0,25).map(c=>({id:c.id,name:contactName(c),role:c.type,status:c.status,notes:(c.contactComment||c.description||'').slice(0,700)}))
    else if(lookup.entity==='properties')found=catalog.properties.filter(p=>matches(p.address)).slice(0,25).map(p=>({id:p.id,address:p.address,status:p.status,ownerId:p.ownerId}))
    else if(lookup.entity==='history'){
     const results=await Promise.all(['events','crm_activities','tasks'].map(table=>fetchAllRows(()=>supabase.from(table).select('*').eq('user_id',userId).is('deleted_at',null))))
     const entries=buildWorkHistory(results[0].data,results[1].data,results[2].data)
     found=entries.filter(r=>(!lookup.clientId||r.clientId===lookup.clientId)&&(!lookup.propertyId||r.propertyId===lookup.propertyId)&&matches(r.title+' '+r.notes)).slice(0,15).map(r=>({title:r.title,date:r.date,kind:r.kind,notes:r.notes.slice(0,650),outcome:r.outcome}))
    }else if(lookup.entity==='tasks'){
     const response=await fetchAllRows(()=>{let query=supabase.from('tasks').select('*').eq('user_id',userId).is('deleted_at',null);if(lookup.clientId)query=query.eq('smart_criteria->>clientId',lookup.clientId);if(lookup.propertyId)query=query.eq('smart_criteria->>propertyId',lookup.propertyId);return query.order('created_at',{ascending:false})})
     found=(response.data||[]).filter(r=>matches(String(r.title||'')+' '+String(r.description||''))).slice(0,15).map(r=>({title:r.title,notes:String(r.description||'').slice(0,650),date:r.due_date,status:r.status}))
    }else throw new Error('Этот раздел пока не доступен для поиска в чате.')
    context=JSON.stringify({profile:{name:user.firstName},today,nextMonday:nextMonday(today),conversation:conversation.slice(-6),lookup,result:found,note:'Ограниченная выборка. Не делай выводов об отсутствии работы по отсутствию записей.'})
    if(context.length>15500)throw new Error('Уточните период или контакт для поиска.')
    result=await askAssistant('mia',context,[],abort.current.signal)
   }
   if(account.current!==userId)return
   const action=result.mia as {type?:string;page?:string}|null
   if(action?.type==='navigate'&&action.page&&Object.prototype.hasOwnProperty.call(miaPages,action.page)){
    navigate(miaPages[action.page as keyof typeof miaPages]);if(action.page==='reports')setReports(true);if(action.page==='history')setHistory(true);add('Открыла нужный раздел.')
   }else if(action?.type==='record'){
    const record=validateMiaRecord(action,clients,catalog.properties,today)
    if(record.task&&/ближайш[а-я]* понедельник/i.test(question))record.task.date=nextMonday(today)
    pending.current={id:crypto.randomUUID(),record,meetingSaved:false};persistPending(userId)
    await save(userId)
   }else add(action?.type==='lookup'?'Уточните контакт или адрес, чтобы сузить поиск.':result.text)
  }catch(e){if(account.current===userId)add((pending.current?.meetingSaved?'Показ сохранён, но задача пока не подтверждена. ':'')+(e instanceof Error?e.message:'Не удалось выполнить просьбу.'))}finally{if(account.current===userId)setBusy(false)}
 }
 if(!user)return null
 return <>{reports&&<OwnerReports onClose={()=>setReports(false)}/ >}{history&&<WorkHistory onClose={()=>setHistory(false)}/>}
 <button onClick={()=>setOpen(v=>!v)} aria-expanded={open} className="lumi-gradient-button fixed bottom-5 right-5 z-40 rounded-full px-5 py-3 shadow-xl">Мия · помощница</button>
 {open&&<section aria-label="Чат с Мией" className="lumi-panel fixed z-40 flex flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{right:12,bottom:78,width:large?700:420,height:large?720:540,maxWidth:'calc(100vw - 24px)',maxHeight:'calc(100dvh - 100px)',minWidth:280,minHeight:280,resize:'both'}}>
 <header className="lumi-border flex shrink-0 items-center justify-between border-b p-3"><div><strong className="lumi-text">Мия</strong><p className="lumi-muted text-xs">Помощница в вашем рабочем дне</p></div><div className="flex gap-2"><button aria-label="Изменить размер чата" onClick={()=>setLarge(v=>!v)} className="lumi-control rounded-lg p-2">↔</button><button aria-label="Закрыть чат" onClick={()=>setOpen(false)} className="lumi-control rounded-lg p-2">✕</button></div></header>
 <div ref={scroller} role="log" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"><p className="lumi-muted text-sm">Здравствуйте, {user.firstName||user.displayName}! Я Мия. Помогу записать показ, поставить задачу или открыть нужный раздел. Если деталей не хватит, уточню.</p>{messages.map((m,i)=><p key={i} className={`whitespace-pre-wrap break-words rounded-xl p-3 text-sm ${m.role==='user'?'lumi-accent-soft ml-6':'lumi-panel-muted lumi-text mr-3'}`}>{m.text}</p>)}{busy&&<p className="lumi-muted text-sm">Разбираюсь…</p>}</div>
 {pending.current&&<div className="p-3"><button disabled={busy} className="lumi-control rounded-lg p-2" onClick={async()=>{setBusy(true);try{await save(user.id)}catch(e){add(e instanceof Error?e.message:'Сохранение не подтверждено.')}finally{setBusy(false)}}}>Повторить сохранение</button><button disabled={busy} className="lumi-muted ml-2 p-2 text-sm" onClick={()=>{pending.current=null;persistPending(user.id);add('Оставила уже сохранённые записи. Остальные действия отменены.')}}>Оставить как есть</button></div>}
 <form onSubmit={e=>{e.preventDefault();void send()}} className="lumi-border flex shrink-0 gap-2 border-t p-3"><textarea aria-label="Сообщение Мии" rows={2} maxLength={2000} value={input} onChange={e=>setInput(e.target.value)} placeholder="Что произошло или что нужно сделать?" className="lumi-control min-w-0 flex-1 resize-none rounded-xl p-3"/><button aria-label="Отправить сообщение" disabled={busy||!!pending.current||!input.trim()} className="lumi-gradient-button rounded-xl px-3 disabled:opacity-50">↑</button></form></section>}</>
}
