import MiaActionCard from './MiaActionCard'
import {tables} from '../lib/miaActionSchema'
import {fetchContactRecords} from '../lib/contacts'
import {fetchPropertyCatalog} from '../lib/propertyCatalog'
import VoiceInputButton from './VoiceInputButton'
import {executeMiaCommand,validateMiaPlan,type MiaPlan} from '../lib/miaActions'
import {useTheme,type ThemeId} from '../context/ThemeContext'
import {recurrenceId} from '../lib/recurrenceIdentity'
import {checkedMiaAction,isSocialReply} from '../lib/miaResponse'
import {miaLookup} from '../lib/miaLookup'
import {rememberInstruction,fitMiaContext} from '../lib/miaMemory'
import {MessageCircle} from 'lucide-react'
import {useMiaCloud} from '../hooks/useMiaCloud'
import {miaCloud} from '../lib/miaCloud'
import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {askAssistant} from '../lib/assistant'
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
   const receipts=await Promise.all(plan.commands.map(async(command,index)=>{const entity=command.operation==='call'?'event':command.operation==='activity'?'activity':command.entity;const table=entity&&tables[entity];if(!table)return null;const result=await supabase.from(table).select('updated_at').eq('user_id',userId).eq('id',p.completed![index]).maybeSingle();return {id:p.completed![index],entity,operation:['call','activity'].includes(command.operation)?'create':command.operation,title:String(command.fields.title||command.fields.firstName||command.fields.address||'Запись CRM'),revision:result.data?.updated_at}}))
   await miaCloud({op:'finish',token:lease.current,planId:p.id,id:p.id+'-done',receipts:receipts.filter(Boolean),text:p.reply||`Выполнено действий: ${p.completed.length}.`},userId);pending.current=null;void syncNativeReminders(userId).catch(()=>undefined);await queryClient.invalidateQueries();await cloud.refresh();return
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
  const userId=user.id,question=input.trim();setInput('');setBusy(true);setCloudError('')
  let conversation=[...messages,{role:'user' as const,text:question}]
  abort.current=new AbortController()
  let submitted=false
  try{
   await miaCloud({op:'claim',token:lease.current},userId);const current=await miaCloud({op:'read'},userId);if(current.pending){pending.current=current.pending as Pending;throw new Error('Сначала завершите или отмените предыдущее действие Мии.')}conversation=[...current.messages,{role:'user' as const,text:question}];const sourceMessage=await cloud.append('user',question);submitted=true
   if(isSocialReply(question)){await add('Пожалуйста 😊');return}
   const remembered=rememberInstruction(question)
   if(remembered){if(!current.memoryEnabled)await add('Память отключена. Включите её в разделе «Память».');else if((current.preferences+'\n'+remembered).length>4000){await miaCloud({op:'remember',messageId:sourceMessage.id},userId);await cloud.refresh();await add('Запомнила в вашем аккаунте. Запись доступна на других устройствах.')}else {await cloud.memory([current.preferences,remembered].filter(Boolean).join('\n'),true);await add('Запомнила в вашем аккаунте. Запись доступна на других устройствах.')}return}
   const today=calendarParts(new Date()).date
   const personalContext=current.memoryEnabled?{preferences:current.preferences,facts:(current.facts||[]).filter(f=>!f.retired)}:{}
   let context=fitMiaContext({personalContext,profile:{name:user.firstName||user.displayName},today,nextMonday:nextMonday(today),page:location.pathname,indexNote:'Данные CRM загружаются по запросу lookup. Для рекомендаций собственникам используй owners, для конкретного клиента contacts и history. Отсутствие начального индекса не означает пустую базу.',conversation:conversation.slice(-20)},115000)
   if(context.length>119000)throw new Error('Слишком много данных для одного запроса. Этот режим пока требует более компактной базы или короткой беседы.')
   const request=async(payload:string)=>{
    await miaCloud({op:'claim',token:lease.current},userId)
    let answer=await askAssistant('mia',payload,[],abort.current!.signal)
    for(let repair=0;repair<2;repair++){try{checkedMiaAction(answer.mia);return answer}catch(e){await miaCloud({op:'claim',token:lease.current},userId);answer=await askAssistant('mia',fitMiaContext({request:JSON.parse(payload),invalidResponse:answer,validationError:e instanceof Error?e.message:'Неверный формат',instruction:'Исправь структуру по контракту. Ничего ещё не выполнено. Не меняй намерение пользователя.'},119000),[],abort.current!.signal)}}
    checkedMiaAction(answer.mia);return answer
   }
   const evidence:unknown[]=[]
   let result=await request(context)
   for(let attempt=0;attempt<12;attempt++){
    const lookup=result.mia as {type?:string;entity?:string;query?:string;clientId?:string;propertyId?:string}|null
    if(lookup?.type!=='lookup')break
    const found=await miaLookup(userId,lookup)
    evidence.push({lookup,result:found})
    context=fitMiaContext({personalContext,profile:{name:user.firstName},today,nextMonday:nextMonday(today),conversation:conversation.slice(-20),evidence,lookup,result:found,note:'Следуй total и hasMore. Архив включён. Не делай выводов об отсутствии работы по отсутствию записей.'},115000)
    if(context.length>119000)throw new Error('Уточните период или контакт для поиска.')
    await miaCloud({op:'claim',token:lease.current},userId);result=await request(context)
   }
   if(account.current!==userId)return
   if(result.remember&&current.memoryEnabled){const references=(result.memoryTargets||[]).filter(t=>['contact','property'].includes(t.entity)&&evidence.some(e=>JSON.stringify(e).includes(t.id)));await miaCloud({op:'remember',messageId:sourceMessage.id,references},userId);await cloud.refresh()}
   const action=result.mia as {type?:string;page?:string}|null
   if(action?.type==='navigate'&&action.page&&Object.prototype.hasOwnProperty.call(miaPages,action.page)){
    navigate(miaPages[action.page as keyof typeof miaPages]);if(action.page==='reports')setReports(true);if(action.page==='history')setHistory(true);await add('Открыла нужный раздел.')
   }else if(action?.type==='commands'){
    pending.current={id:crypto.randomUUID(),plan:validateMiaPlan(action),completed:[],reply:result.text,meetingSaved:false};await persistPending(userId);await save(userId)
   }else if(action?.type==='record'){
    const [clients,catalog]=await Promise.all([fetchContactRecords(userId),fetchPropertyCatalog(userId)])
    const record=validateMiaRecord(action,clients,catalog.properties,today)
    if(record.task&&/ближайш[а-я]* понедельник/i.test(question))record.task.date=nextMonday(today)
    pending.current={id:crypto.randomUUID(),record,meetingSaved:false};await persistPending(userId)
    await save(userId)
   }else await add(action?.type==='lookup'?'Уточните контакт или адрес, чтобы сузить поиск.':result.text)
  }catch(e){if(account.current===userId){if(!submitted)setInput(question);setCloudError('');await add((pending.current?.meetingSaved?'Показ сохранён, но задача пока не подтверждена. ':'')+(e instanceof Error?e.message:'Не удалось выполнить просьбу.')).catch(()=>setCloudError('Ответ не удалось сохранить в чате. Проверьте соединение.'))}}finally{await miaCloud({op:'release',token:lease.current},userId).catch(()=>undefined);if(account.current===userId)setBusy(false)}
 }
 if(!user)return null
 return <>{reports&&<OwnerReports onClose={()=>setReports(false)}/ >}{history&&<WorkHistory onClose={()=>setHistory(false)}/>}
 {!open&&<button onClick={()=>setOpen(v=>!v)} aria-label="Открыть чат с Мией" title="Мия" aria-expanded={open} className="lumi-gradient-button fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-xl"><MessageCircle className="h-6 w-6" aria-hidden="true"/></button>}
 {open&&<section aria-label="Чат с Мией" className="lumi-panel fixed z-[80] flex flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{right:12,bottom:16,width:large?700:420,height:large?720:540,maxWidth:'calc(100vw - 24px)',maxHeight:'calc(100dvh - 32px)',minWidth:280,minHeight:280,resize:'both'}}>
 <header className="lumi-border flex shrink-0 items-center justify-between gap-3 border-b p-3"><div className="min-w-0"><strong className="lumi-text">Мия</strong><p className="lumi-muted text-xs">Помощница в вашем рабочем дне</p></div><div className="flex shrink-0 gap-2"><button aria-expanded={memoryOpen} onClick={()=>setMemoryOpen(v=>!v)} className="lumi-control rounded-lg px-2 text-xs">Память</button><button aria-label="Изменить размер чата" onClick={()=>setLarge(v=>!v)} className="lumi-control rounded-lg p-2">↔</button><button aria-label="Закрыть чат" onClick={()=>setOpen(false)} className="lumi-control rounded-lg p-2">✕</button></div></header>
 {memoryOpen&&<div className="lumi-border max-h-[45%] shrink-0 space-y-2 overflow-y-auto border-b p-3"><label className="lumi-text flex items-center gap-2 text-sm"><input type="checkbox" checked={useMemory} onChange={e=>void saveMemory(preferences,e.target.checked)}/>Учитывать мои предпочтения и задачи</label><label className="lumi-text block text-sm">Что Мия помнит<textarea aria-label="Память Мии" rows={3} maxLength={4000} value={memoryDraft??preferences} onChange={e=>setMemoryDraft(e.target.value)} className="lumi-control mt-1 w-full rounded-lg p-2" placeholder="Например: отвечать кратко, звонки планировать после 11:00"/></label><p className="lumi-muted text-xs">Сохраняется в вашем аккаунте и доступно на других устройствах. Можно написать в чате «Запомни: …». Частые задачи и просрочки учитываются по текущей базе.</p><div className="flex flex-wrap gap-3"><button onClick={()=>void saveMemory(memoryDraft??preferences,useMemory)} className="lumi-control rounded-lg p-2 text-xs">Сохранить память</button><button onClick={()=>void saveMemory('',useMemory)} className="text-xs text-red-400">Очистить предпочтения</button></div>{cloud.state.facts?.map(f=><div key={f.id} className="lumi-panel-muted rounded-lg p-2 text-sm"><p className={`whitespace-pre-wrap break-words ${f.retired?"opacity-50 line-through":""}`}>{f.text}</p>{f.references?.map(t=><button key={t.id} className="lumi-accent-text mr-2 text-xs" onClick={()=>navigate(t.entity==='contact'?`/contacts?client=${t.id}`:`/properties/${t.id}`)}>Открыть {t.entity==='contact'?'контакт':'объект'}</button>)}<button className="mr-3 mt-2 text-xs" onClick={()=>void miaCloud({op:'retire',id:f.id,retired:!f.retired},user.id).then(()=>cloud.refresh()).catch(e=>setCloudError(e.message))}>{f.retired?'Снова актуально':'Неактуально'}</button><button className="mt-2 text-red-400" onClick={()=>void miaCloud({op:'forget',id:f.id},user.id).then(()=>cloud.refresh()).catch(e=>setCloudError(e.message))}>Забыть</button></div>)}</div>}
 <div ref={scroller} role="log" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"><p className="lumi-muted text-sm">Здравствуйте, {user.firstName||user.displayName}! Я Мия. Помогу записать показ, поставить задачу или открыть нужный раздел. Если деталей не хватит, уточню.</p>{cloud.state.hasOlder&&<button className="lumi-control rounded-lg p-2" onClick={()=>void cloud.older().catch(e=>setCloudError(e.message))}>Ранее</button>}{messages.map(m=><div key={m.id}><p className={`whitespace-pre-wrap break-words rounded-xl p-3 text-sm ${m.role==='user'?'lumi-accent-soft ml-6':'lumi-panel-muted lumi-text mr-3'}`}>{m.text}</p>{m.receipts?.map(r=><MiaActionCard key={r.id} receipt={r} userId={user.id}/>)}</div>)}{busy&&<p className="lumi-muted text-sm">Разбираюсь…</p>}</div>
 {pending.current&&<div className="p-3">{pending.current.plan&&<p className="lumi-muted mb-2 text-sm">Выполнено действий: {pending.current.completed?.length||0} из {pending.current.plan.commands.length}. Остальные можно повторить или отменить.</p>}<button disabled={busy} className="lumi-control rounded-lg p-2" onClick={async()=>{setBusy(true);try{await miaCloud({op:'claim',token:lease.current},user.id);await save(user.id)}catch(e){setCloudError(e instanceof Error?e.message:'Сохранение не подтверждено.')}finally{await miaCloud({op:'release',token:lease.current},user.id).catch(()=>undefined);setBusy(false)}}}>Повторить сохранение</button><button disabled={busy} className="lumi-muted ml-2 p-2 text-sm" onClick={async()=>{try{await miaCloud({op:'claim',token:lease.current},user.id);await persistPending(user.id,null);pending.current=null;await add('Оставила уже сохранённые записи. Остальные действия отменены.')}catch(e){setCloudError(e instanceof Error?e.message:'Не удалось отменить.')}finally{await miaCloud({op:'release',token:lease.current},user.id).catch(()=>undefined)}}}>Оставить как есть</button></div>}
 {(cloudError||cloud.error)&&<p role="alert" className="px-3 text-sm text-amber-400">{cloudError||cloud.error}</p>}
 <div className="px-3 pb-2"><VoiceInputButton key={user.id} disabled={busy} onText={text=>setInput(value=>[value.trimEnd(),text].filter(Boolean).join("\n"))}/></div>
 <form onSubmit={e=>{e.preventDefault();void send()}} className="lumi-border flex shrink-0 gap-2 border-t p-3"><textarea aria-label="Сообщение Мии" rows={2} maxLength={20000} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!busy)void send()}}} value={input} onChange={e=>setInput(e.target.value)} placeholder="Напишите Мие…" title="Enter отправляет, Shift+Enter переносит строку" className="lumi-control min-w-0 flex-1 resize-none rounded-xl p-3"/><button aria-label="Отправить сообщение" disabled={busy||!cloud.ready||!!pending.current||!input.trim()} className="lumi-gradient-button rounded-xl px-3 disabled:opacity-50">↑</button></form></section>}</>
}
