import {executeMiaCommand,validateMiaPlan,type MiaPlan} from '../lib/miaActions'
import {useTheme,type ThemeId} from '../context/ThemeContext'
import {recurrenceId} from '../lib/recurrenceIdentity'
import {miaLookup} from '../lib/miaLookup'
import {rememberInstruction,workHabits,fitMiaContext} from '../lib/miaMemory'
import {fetchTasks} from '../lib/tasks'
import {MessageCircle} from 'lucide-react'
import {useMiaCloud} from '../hooks/useMiaCloud'
import {miaCloud} from '../lib/miaCloud'
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
import {saveTask} from '../lib/tasks'
import {syncNativeReminders} from '../lib/nativeReminders'
import {queryClient} from '../lib/queryClient'
import OwnerReports from './OwnerReports'
import WorkHistory from './WorkHistory'
type Pending={id:string;record?:MiaRecord;plan?:MiaPlan;completed?:string[];reply?:string;meetingSaved:boolean}|null
export default function MiaChat(){
 const {user,updatePreferences,updateNotificationPreferences}=useAuth(),navigate=useNavigate(),{setTheme}=useTheme()
 const [open,setOpen]=useState(false),[large,setLarge]=useState(false),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[reports,setReports]=useState(false),[history,setHistory]=useState(false)
 const cloud=useMiaCloud(user?.id,open),messages=cloud.state.messages
 const [cloudError,setCloudError]=useState(''),[memoryDraft,setMemoryDraft]=useState<string|null>(null)
 const preferences=cloud.state.preferences,useMemory=cloud.state.memoryEnabled
 const lease=useRef(crypto.randomUUID())
 const [memoryOpen,setMemoryOpen]=useState(false)
 const scroller=useRef<HTMLDivElement>(null),abort=useRef<AbortController|null>(null),account=useRef(user?.id)
 const pending=useRef<Pending>(null)
 useEffect(()=>{account.current=user?.id;abort.current?.abort();pending.current=null;setCloudError('');setMemoryDraft(null);setInput('');setBusy(false);setOpen(false)},[user?.id])
 useEffect(()=>()=>abort.current?.abort(),[])
 useEffect(()=>{if(open&&scroller.current)scroller.current.scrollTop=scroller.current.scrollHeight},[open,messages[messages.length-1]?.id,busy])
 useEffect(()=>{if(!busy&&cloud.ready)pending.current=cloud.state.pending as Pending},[cloud.state.pending,cloud.ready,busy])
 const add=(text:string)=>cloud.append('assistant',text)
 const persistPending=async(_userId:string,value:typeof pending.current=pending.current)=>{await miaCloud({op:'pending',token:lease.current,value},_userId);await cloud.refresh()}
 const saveMemory=async(text:string,enabled:boolean)=>{try{await cloud.memory(text,enabled);setMemoryDraft(null);setCloudError('')}catch(e){setCloudError(e instanceof Error?e.message:'Память не сохранена.')}}
 const save=async(userId:string)=>{
  const fresh=await miaCloud({op:'read'},userId);pending.current=fresh.pending as Pending
  const p=pending.current;if(!p){await cloud.refresh();return}
  if(p.plan){
   const plan=validateMiaPlan(p.plan);p.completed ||= []
   for(let index=p.completed.length;index<plan.commands.length;index++){
    if(account.current!==userId)throw new Error('Аккаунт изменился.')
    await miaCloud({op:'claim',token:lease.current},userId)
    const id=await executeMiaCommand(userId,plan.commands[index],await recurrenceId(userId,p.id+':'+index),p.completed,theme=>setTheme(theme as ThemeId),async fields=>{const ui=Object.fromEntries(Object.entries(fields).filter(([key])=>['iconSize','density','navigationPosition'].includes(key)));const notifications=Object.fromEntries(Object.entries(fields).filter(([key])=>!['iconSize','density','navigationPosition'].includes(key)));if(Object.keys(ui).length&&!await updatePreferences(ui))throw new Error('Настройки интерфейса не сохранены.');if(Object.keys(notifications).length&&!await updateNotificationPreferences(notifications))throw new Error('Настройки уведомлений не сохранены.')})
    p.completed.push(id);await persistPending(userId,p)
   }
   await miaCloud({op:'finish',token:lease.current,planId:p.id,id:p.id+'-done',text:p.reply||`Выполнено действий: ${p.completed.length}.`},userId);pending.current=null;void syncNativeReminders(userId).catch(()=>undefined);await queryClient.invalidateQueries();await cloud.refresh();return
  }
  const clients=await fetchContactRecords(userId),catalog=await fetchPropertyCatalog(userId)
  const r=validateMiaRecord(p.record,clients,catalog.properties)
  if(account.current!==userId)throw new Error('Аккаунт изменился.')
  if(r.meeting&&!p.meetingSaved){
   const payload={id:p.id,user_id:userId,client_id:r.clientId,property_id:r.propertyId,type:'meeting',status:'completed',outcome:'Состоялся',title:'Показ квартиры',notes:r.meeting.notes,occurred_at:zonedInstant(r.meeting.date,'12:00').toISOString(),metadata:{source:'mia',date_only:true}}
   const result=await supabase.from('crm_activities').insert(payload).select('id').single()
   if(result.error){const check=await supabase.from('crm_activities').select('id,notes,client_id,property_id').eq('id',p.id).eq('user_id',userId).is('deleted_at',null).maybeSingle();if(check.error||check.data?.notes!==payload.notes||check.data?.client_id!==r.clientId||check.data?.property_id!==r.propertyId)throw new Error('Не удалось подтвердить запись показа. Повторите сохранение.')}p.meetingSaved=true;await persistPending(userId,p)
  }
  if(account.current!==userId)throw new Error('Аккаунт изменился.')
  if(r.task)await saveTask(userId,{title:r.task.title,description:r.task.notes,status:'todo',priority:r.task.priority||'medium',dueTime:r.task.time,recurrenceRule:r.task.recurrence||'none',dueDate:r.task.date,smartCriteria:{clientId:r.clientId||undefined,propertyId:r.propertyId||undefined,timeZone:'Europe/Moscow'},eisenhowerQuadrant:'plan'},undefined,p.id)
  const reply=[r.meeting?'Показ записан.':'',r.task?`Задача «${r.task.title}» создана на ${new Date(r.task.date+'T12:00').toLocaleDateString('ru-RU')}.`:''].filter(Boolean).join(' ')
  await miaCloud({op:'finish',token:lease.current,planId:p.id,id:p.id+'-done',text:reply},userId);if(account.current!==userId)return;pending.current=null;void syncNativeReminders(userId).catch(()=>undefined);await queryClient.invalidateQueries();await cloud.refresh()
 }
 const send=async()=>{
  if(!user||busy||!cloud.ready||!input.trim()||pending.current)return
  const userId=user.id,question=input.trim();setInput('');setBusy(true)
  let conversation=[...messages,{role:'user' as const,text:question}]
  abort.current=new AbortController()
  let submitted=false
  try{
   await miaCloud({op:'claim',token:lease.current},userId);const current=await miaCloud({op:'read'},userId);if(current.pending){pending.current=current.pending as Pending;throw new Error('Сначала завершите или отмените предыдущее действие Мии.')}conversation=[...current.messages,{role:'user' as const,text:question}];await cloud.append('user',question);submitted=true
   const remembered=rememberInstruction(question)
   if(remembered){if(!current.memoryEnabled)await add('Память отключена. Включите её в разделе «Память».');else if((current.preferences+'\n'+remembered).length>4000)await add('Память заполнена. Удалите лишние записи.');else {await cloud.memory([current.preferences,remembered].filter(Boolean).join('\n'),true);await add('Запомнила в вашем аккаунте. Запись доступна на других устройствах.')}return}
   const [clients,catalog,taskRecords]=await Promise.all([fetchContactRecords(userId),fetchPropertyCatalog(userId),fetchTasks(userId)])
   const today=calendarParts(new Date()).date
   const personalContext=current.memoryEnabled?{preferences:current.preferences,observations:workHabits(taskRecords,today)}:{}
   let context=fitMiaContext({personalContext,profile:{name:user.firstName||user.displayName},today,nextMonday:nextMonday(today),page:location.pathname,contacts:clients.filter(c=>c.status!=='archived').slice(0,40).map(c=>({id:c.id,name:contactName(c),role:c.type})),properties:catalog.properties.slice(0,40).map(p=>({id:p.id,address:p.address,ownerId:p.ownerId})),indexNote:'Это первые 40 контактов и объектов. Для поиска и истории используй lookup.',conversation:conversation.slice(-8)})
   if(context.length>15500)throw new Error('Слишком много данных для одного запроса. Этот режим пока требует более компактной базы или короткой беседы.')
   let result=await askAssistant('mia',context,[],abort.current.signal)
   for(let attempt=0;attempt<3;attempt++){
    const lookup=result.mia as {type?:string;entity?:string;query?:string;clientId?:string;propertyId?:string}|null
    if(lookup?.type!=='lookup')break
    const found=await miaLookup(userId,lookup)
    context=fitMiaContext({personalContext,profile:{name:user.firstName},today,nextMonday:nextMonday(today),conversation:conversation.slice(-6),lookup,result:found,note:'Ограниченная выборка. Не делай выводов об отсутствии работы по отсутствию записей.'})
    if(context.length>15500)throw new Error('Уточните период или контакт для поиска.')
    result=await askAssistant('mia',context,[],abort.current.signal)
   }
   if(account.current!==userId)return
   const action=result.mia as {type?:string;page?:string}|null
   if(action?.type==='navigate'&&action.page&&Object.prototype.hasOwnProperty.call(miaPages,action.page)){
    navigate(miaPages[action.page as keyof typeof miaPages]);if(action.page==='reports')setReports(true);if(action.page==='history')setHistory(true);await add('Открыла нужный раздел.')
   }else if(action?.type==='commands'){
    pending.current={id:crypto.randomUUID(),plan:validateMiaPlan(action),completed:[],reply:result.text,meetingSaved:false};await persistPending(userId);await save(userId)
   }else if(action?.type==='record'){
    const record=validateMiaRecord(action,clients,catalog.properties,today)
    if(record.task&&/ближайш[а-я]* понедельник/i.test(question))record.task.date=nextMonday(today)
    pending.current={id:crypto.randomUUID(),record,meetingSaved:false};await persistPending(userId)
    await save(userId)
   }else await add(action?.type==='lookup'?'Уточните контакт или адрес, чтобы сузить поиск.':result.text)
  }catch(e){if(account.current===userId){if(!submitted)setInput(question);setCloudError(e instanceof Error?e.message:'Не удалось выполнить просьбу.');await add((pending.current?.meetingSaved?'Показ сохранён, но задача пока не подтверждена. ':'')+(e instanceof Error?e.message:'Не удалось выполнить просьбу.')).catch(()=>undefined)}}finally{await miaCloud({op:'release',token:lease.current},userId).catch(()=>undefined);if(account.current===userId)setBusy(false)}
 }
 if(!user)return null
 return <>{reports&&<OwnerReports onClose={()=>setReports(false)}/ >}{history&&<WorkHistory onClose={()=>setHistory(false)}/>}
 <button onClick={()=>setOpen(v=>!v)} aria-label="Открыть чат с Мией" title="Мия" aria-expanded={open} className="lumi-gradient-button fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-xl"><MessageCircle className="h-6 w-6" aria-hidden="true"/></button>
 {open&&<section aria-label="Чат с Мией" className="lumi-panel fixed z-40 flex flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{right:12,bottom:78,width:large?700:420,height:large?720:540,maxWidth:'calc(100vw - 24px)',maxHeight:'calc(100dvh - 100px)',minWidth:280,minHeight:280,resize:'both'}}>
 <header className="lumi-border flex shrink-0 items-center justify-between border-b p-3"><div><strong className="lumi-text">Мия</strong><p className="lumi-muted text-xs">Помощница в вашем рабочем дне</p></div><div className="flex gap-2"><button aria-expanded={memoryOpen} onClick={()=>setMemoryOpen(v=>!v)} className="lumi-control rounded-lg px-2 text-xs">Память</button><button aria-label="Изменить размер чата" onClick={()=>setLarge(v=>!v)} className="lumi-control rounded-lg p-2">↔</button><button aria-label="Закрыть чат" onClick={()=>setOpen(false)} className="lumi-control rounded-lg p-2">✕</button></div></header>
 {memoryOpen&&<div className="lumi-border max-h-[45%] shrink-0 space-y-2 overflow-y-auto border-b p-3"><label className="lumi-text flex items-center gap-2 text-sm"><input type="checkbox" checked={useMemory} onChange={e=>void saveMemory(preferences,e.target.checked)}/>Учитывать мои предпочтения и задачи</label><label className="lumi-text block text-sm">Что Мия помнит<textarea aria-label="Память Мии" rows={3} maxLength={4000} value={memoryDraft??preferences} onChange={e=>setMemoryDraft(e.target.value)} className="lumi-control mt-1 w-full rounded-lg p-2" placeholder="Например: отвечать кратко, звонки планировать после 11:00"/></label><p className="lumi-muted text-xs">Сохраняется в вашем аккаунте и доступно на других устройствах. Можно написать в чате «Запомни: …». Частые задачи и просрочки учитываются по текущей базе.</p><button onClick={()=>void saveMemory(memoryDraft??preferences,useMemory)} className="lumi-control rounded-lg p-2 text-xs">Сохранить память</button><button onClick={()=>void saveMemory('',useMemory)} className="text-xs text-red-400">Очистить память</button></div>}
 <div ref={scroller} role="log" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"><p className="lumi-muted text-sm">Здравствуйте, {user.firstName||user.displayName}! Я Мия. Помогу записать показ, поставить задачу или открыть нужный раздел. Если деталей не хватит, уточню.</p>{cloud.state.hasOlder&&<button className="lumi-control rounded-lg p-2" onClick={()=>void cloud.older().catch(e=>setCloudError(e.message))}>Ранее</button>}{messages.map(m=><p key={m.id} className={`whitespace-pre-wrap break-words rounded-xl p-3 text-sm ${m.role==='user'?'lumi-accent-soft ml-6':'lumi-panel-muted lumi-text mr-3'}`}>{m.text}</p>)}{busy&&<p className="lumi-muted text-sm">Разбираюсь…</p>}</div>
 {pending.current&&<div className="p-3">{pending.current.plan&&<p className="lumi-muted mb-2 text-sm">Выполнено действий: {pending.current.completed?.length||0} из {pending.current.plan.commands.length}. Остальные можно повторить или отменить.</p>}<button disabled={busy} className="lumi-control rounded-lg p-2" onClick={async()=>{setBusy(true);try{await miaCloud({op:'claim',token:lease.current},user.id);await save(user.id)}catch(e){setCloudError(e instanceof Error?e.message:'Сохранение не подтверждено.')}finally{await miaCloud({op:'release',token:lease.current},user.id).catch(()=>undefined);setBusy(false)}}}>Повторить сохранение</button><button disabled={busy} className="lumi-muted ml-2 p-2 text-sm" onClick={async()=>{try{await miaCloud({op:'claim',token:lease.current},user.id);await persistPending(user.id,null);pending.current=null;await add('Оставила уже сохранённые записи. Остальные действия отменены.')}catch(e){setCloudError(e instanceof Error?e.message:'Не удалось отменить.')}finally{await miaCloud({op:'release',token:lease.current},user.id).catch(()=>undefined)}}}>Оставить как есть</button></div>}
 {(cloudError||cloud.error)&&<p role="alert" className="px-3 text-sm text-amber-400">{cloudError||cloud.error}</p>}
 <form onSubmit={e=>{e.preventDefault();void send()}} className="lumi-border flex shrink-0 gap-2 border-t p-3"><textarea aria-label="Сообщение Мии" rows={2} maxLength={2000} value={input} onChange={e=>setInput(e.target.value)} placeholder="Что произошло или что нужно сделать?" className="lumi-control min-w-0 flex-1 resize-none rounded-xl p-3"/><button aria-label="Отправить сообщение" disabled={busy||!cloud.ready||!!pending.current||!input.trim()} className="lumi-gradient-button rounded-xl px-3 disabled:opacity-50">↑</button></form></section>}</>
}
