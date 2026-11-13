import {archiveWithReason} from './archiveWithReason'
import type {ArchiveReason} from './archiveReason'
import {stopCallFollowups} from './callFollowups'
import {supabase} from './supabase'
import {saveContact} from './contacts'
import {saveProperty} from './properties'
import {saveTask,fetchTasks,setTaskStatus} from './tasks'
import {saveEvent} from './events'
import {fetchDeals,saveDeal} from './deals'
import {saveCallActivity} from './callActivities'
import type {ContactInput} from './contactRecordMapping'
import type {PropertyUpsertInput} from './propertyRecordMapping'
import type {TaskUpsertInput} from './taskMapping'
import type {EventUpsertInput} from './eventMapping'
import {calendarParts,zonedInstant} from './scheduling'
import {validateAccounting} from './businessAccounting'
import {recurrenceId} from './recurrenceIdentity'
import {tables,fields,uuid,required,enumValue,date,time,type MiaCommand} from './miaActionSchema'
export {validateMiaPlan,type MiaCommand,type MiaPlan} from './miaActionSchema'
async function owned(userId:string,table:string,id:string){if(!uuid.test(id))throw new Error('Запись не выбрана.');const r=await supabase.from(table).select('*').eq('user_id',userId).eq('id',id).setHeader('x-lumicrm-network-only','true').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('Запись недоступна в этом аккаунте.');return r.data}
async function patch(userId:string,table:string,id:string,values:Record<string,unknown>){const before=await owned(userId,table,id);let q=supabase.from(table).update(values).eq('user_id',userId).eq('id',id);if(before.updated_at)q=q.eq('updated_at',before.updated_at);const r=await q.select('id').setHeader('x-lumicrm-network-only','true').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('Запись изменилась. Повторите после обновления.');return id}
export async function executeMiaCommand(userId:string,command:MiaCommand,operationId:string,previousIds:string[],setTheme:(theme:string)=>void,settings?:(fields:Record<string,unknown>)=>Promise<void>){
 const c=structuredClone(command),f=c.fields,id=c.id||operationId
 for(const key of ['clientId','propertyId','ownerId'])if(typeof f[key]==='string'&&String(f[key]).startsWith('@'))f[key]=previousIds[Number(String(f[key]).slice(1))]
 for(const key of ['clientId','ownerId','propertyId'])if(f[key]){const row=await owned(userId,key==='propertyId'?'properties':'clients',String(f[key]));if(row.deleted_at)throw new Error('Связанная запись в корзине.');if(c.operation==='create'&&row.status==='archived')throw new Error('Связанный контакт или объект в архиве.')}
 const table=tables[c.entity||'']
 if(['archive','restore','trash'].includes(c.operation)){
  if(!table||!c.id)throw new Error('Укажите запись.');const row=await owned(userId,table,id)
  if(c.operation==='trash')return patch(userId,table,id,{deleted_at:new Date().toISOString()})
  if(c.operation==='restore'&&row.deleted_at)return patch(userId,table,id,{deleted_at:null})
  if(!['clients','properties'].includes(table))throw new Error('Архив доступен контактам и объектам.')
  if(c.operation==='archive'){const savedReason=await supabase.from('crm_activities').select('occurred_at').eq('id',operationId).eq('user_id',userId).maybeSingle();if(savedReason.error)throw savedReason.error;const receipt=savedReason.data;await archiveWithReason(userId,c.entity as 'contact'|'property',id,{reason:f.reason as ArchiveReason['reason'],note:String(f.note||''),resumeDate:String(f.resumeDate||'')},{id:operationId,at:String(receipt?.occurred_at||new Date().toISOString())});return id}
  return patch(userId,table,id,{status:c.operation==='archive'?'archived':table==='clients'?'active':'available',archived_at:c.operation==='archive'?new Date().toISOString():null})
 }
 if(c.operation==='update'){
  if(!table||!fields[c.entity||'']||!c.id)throw new Error('Нельзя изменить эту запись.');const values:Record<string,unknown>={}
  for(const [key,value]of Object.entries(f)){const column=fields[c.entity!][key];if(!column)throw new Error('Поле не поддерживается: '+key);if(/Date$/.test(key)&&value)date(value);if(/Time$/.test(key))time(value);if(key==='priority')enumValue(value,['low','medium','high']);if(key==='recurrenceRule')enumValue(value,['none','daily','weekly','monthly']);if(key==='listingType')enumValue(value,['sale','rent']);if(key==='workStream')enumValue(value,['active','cold']);if(['title','firstName','address'].includes(key)&&!String(value).trim())throw new Error('Поле не может быть пустым: '+key);values[column]=(/Date$|Time$/.test(key)&&value==='')?null:value}
  if(!Object.keys(values).length)throw new Error('Нет изменений.');return patch(userId,table,id,values)
 }
 if(c.operation==='task_status'){
  const task=(await fetchTasks(userId)).find(t=>t.id===id);if(!task)throw new Error('Задача не найдена.');const status=enumValue(f.status,['todo','inprogress','done']) as TaskUpsertInput['status'];if(task.status!==status)await setTaskStatus(userId,task,status);return id
 }
 if(c.operation==='settings'){if(f.iconSize)enumValue(f.iconSize,['compact','comfortable','large']);if(f.density)enumValue(f.density,['compact','comfortable','spacious']);if(f.navigationPosition)enumValue(f.navigationPosition,['left','right']);if(f.reminderMinutes!==undefined&&![5,10,15,30,60,120].includes(Number(f.reminderMinutes)))throw new Error('Выберите напоминание за 5, 10, 15, 30, 60 или 120 минут.');if(!settings)throw new Error('Настройки недоступны.');await settings(f);return id}
 if(c.operation==='theme'){setTheme(enumValue(f.theme,['lumi-light','midnight','aurora','graphite','warm-sand']));return id}
 if(c.operation==='deal'){
  const deal=(await fetchDeals(userId)).find(d=>d.id===id);if(!deal)throw new Error('Сделка не найдена.');const allowed=['price','agencyIncome','agentIncome','expenses','stage','status','notes','nextAction','nextActionAt','accounting'];if(Object.keys(f).some(k=>!allowed.includes(k)))throw new Error('Недопустимое поле сделки.')
  const input={...deal,...f,propertyId:deal.propertyId,buyerIds:deal.buyerIds||[],ownerIds:deal.ownerIds||[],accounting:{...deal.accounting,...(f.accounting as object||{})}}
  enumValue(input.status,['active','pending','closed','cancelled']);enumValue(input.stage,['preparation','documents','approval','registration','settlement','completed','lost']);validateAccounting(input.accounting,input.status)
  await saveDeal(userId,input,id,undefined,deal.financeActivityId,await recurrenceId(userId,operationId));return id
 }
 // Creation retries use a stable operation id; read-before-write recovers lost replies.
 const creationTable=c.operation==='call'?'events':c.operation==='activity'?'crm_activities':table
 if(!creationTable)throw new Error('Неизвестное действие.')
 const exists=await supabase.from(creationTable).select('id').eq('user_id',userId).eq('id',id).setHeader('x-lumicrm-network-only','true').maybeSingle();if(exists.error)throw exists.error;if(exists.data&&c.entity!=='property'){if(c.operation==='call')await stopCallFollowups(userId,f.clientId as string,String(f.outcome||''),zonedInstant(date(f.date),time(f.time)||'12:00').toISOString());return id}
 if(c.operation==='call'){
  if(date(f.date)>miaToday())throw new Error('Будущий звонок нужно запланировать, а не записывать состоявшимся.');
  const when=zonedInstant(date(f.date),time(f.time)||'12:00').toISOString();await saveCallActivity(userId,{title:required(f,'title'),occurred_at:when,source:'mia',outcome:String(f.outcome||''),notes:String(f.notes||''),metadata:{status:String(f.outcome||''),call_type:enumValue(f.callType,['cold','warm','inbound','selection'],'warm') as 'cold',client_id:f.clientId as string,property_id:f.propertyId as string,contact_name:String(f.contactName||''),phone:String(f.phone||'')}},undefined,id);return id
 }
 if(c.operation==='activity'){
  if(date(f.date)>miaToday())throw new Error('Итог нельзя записать будущей датой.');
  const payload={id,user_id:userId,type:enumValue(f.kind,['meeting','note','message'],'note'),status:'completed',title:required(f,'title'),notes:String(f.notes||''),outcome:String(f.outcome||''),client_id:f.clientId||null,property_id:f.propertyId||null,occurred_at:zonedInstant(date(f.date),time(f.time)||'12:00').toISOString(),metadata:{source:'mia',sent:false}}
  const r=await supabase.from('crm_activities').insert(payload).select('id').single();if(r.error)throw r.error;return id
 }
 if(c.operation!=='create')throw new Error('Неизвестная операция.')
 if(c.entity==='contact'){
  const type=enumValue(f.type,['seller','buyer']) as ContactInput['type'];await saveContact(userId,{...f,type,firstName:required(f,'firstName'),lastName:String(f.lastName||''),phone:required(f,'phone'),roles:[type],tags:[]} as ContactInput,undefined,id);return id
 }
 if(c.entity==='property'){
  const input={price:f.price as number|undefined,rooms:f.rooms as number|undefined,area:f.area as number|undefined,floor:f.floor as number|undefined,totalFloors:f.totalFloors as number|undefined,constructionYear:f.constructionYear as number|undefined,...f,address:required(f,'address'),listingType:enumValue(f.listingType,['sale','rent']),workStream:enumValue(f.workStream,['active','cold'],'active'),status:'available',ownerId:required(f,'ownerId'),tags:[],description:String(f.description||''),propertyType:String(f.propertyType||''),sourceUrl:String(f.sourceUrl||''),repair:String(f.repair||''),heating:String(f.heating||''),walls:String(f.walls||''),balcony:f.balcony===true,elevator:f.elevator===true,parking:f.parking===true} as PropertyUpsertInput
  const owner=await owned(userId,'clients',input.ownerId);await saveProperty(userId,input,{},exists.data?id:undefined,id,[{clientId:input.ownerId,isPrimary:true,ownershipShare:null,roles:owner.roles||[owner.type]}]);return id
 }
 if(c.entity==='task'){
  if(f.stopOnContact&&!f.clientId)throw new Error('Для цепочки звонков нужен контакт.');
  const dueDate=f.date?date(f.date):'';if(f.recurrenceRule&&f.recurrenceRule!=='none'&&!dueDate)throw new Error('Для повторения нужна дата.')
  await saveTask(userId,{title:required(f,'title'),description:String(f.notes||''),status:'todo',priority:enumValue(f.priority,['low','medium','high'],'medium') as TaskUpsertInput['priority'],dueDate,dueTime:time(f.time),recurrenceRule:enumValue(f.recurrenceRule,['none','daily','weekly','monthly'],'none') as TaskUpsertInput['recurrenceRule'],smartCriteria:{stopOnContact:f.stopOnContact===true,clientId:f.clientId as string|undefined,propertyId:f.propertyId as string|undefined,timeZone:'Europe/Moscow'},eisenhowerQuadrant:'plan'},undefined,id);return id
 }
 if(c.entity==='event'){
  await saveEvent(userId,{title:required(f,'title'),type:enumValue(f.kind,['meeting','call']) as EventUpsertInput['type'],eventDate:date(f.date),eventTime:time(required(f,'time')),notes:String(f.notes||''),relatedClientId:f.clientId as string,relatedPropertyId:f.propertyId as string,timeZone:'Europe/Moscow'},undefined,id);return id
 }
 throw new Error('Создание этого типа пока не подключено.')
}
export const miaToday=()=>calendarParts(new Date()).date
