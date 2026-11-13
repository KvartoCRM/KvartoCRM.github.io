import {validateArchiveReason,type ArchiveReason} from './archiveReason.ts'
export type MiaCommand={operation:string;entity?:string;id?:string;fields:Record<string,unknown>}
export type MiaPlan={type:'commands';commands:MiaCommand[]}
export const tables:Record<string,string>={contact:'clients',property:'properties',task:'tasks',event:'events',activity:'crm_activities',deal:'deals'}
export const fields:Record<string,Record<string,string>>={
 contact:{firstName:'first_name',lastName:'last_name',middleName:'middle_name',phone:'phone',email:'email',contactComment:'contact_comment',description:'description',nextContactDate:'next_contact_date',lastContactDate:'last_contact_date',leadTemperature:'lead_temperature',source:'source'},
 property:{address:'address',description:'description',price:'price',rooms:'rooms',area:'area',floor:'floor',totalFloors:'total_floors',sourceUrl:'source_url',workStream:'work_stream',listingType:'listing_type'},
 task:{title:'title',description:'description',dueDate:'due_date',dueTime:'due_time',priority:'priority',recurrenceRule:'recurrence_rule'},
 event:{title:'title',notes:'notes',eventDate:'event_date',eventTime:'event_time',location:'location'},
 activity:{title:'title',notes:'notes',outcome:'outcome',occurredAt:'occurred_at'}
}
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validateMiaPlan(value:unknown):MiaPlan{
 if(!value||typeof value!=='object')throw new Error('Не удалось разобрать действия.')
 const plan=value as MiaPlan
 if(plan.type!=='commands'||!Array.isArray(plan.commands)||!plan.commands.length||plan.commands.length>10)throw new Error('Допустимо от 1 до 10 действий за раз.')
 for(const [index,c] of plan.commands.entries()){
  if(!c||!['create','update','archive','restore','trash','task_status','activity','call','deal','theme','settings'].includes(c.operation)||!c.fields||typeof c.fields!=='object'||Array.isArray(c.fields))throw new Error('Неизвестное действие Мии.')
  if(c.entity&&!tables[c.entity])throw new Error('Неизвестный раздел.')
  if(['create','call','activity'].includes(c.operation)&&c.id)throw new Error('Для новой записи нельзя задавать существующий ID.')
  if(['update','archive','restore','trash','task_status','deal'].includes(c.operation)&&!c.id)throw new Error('Нужен ID записи.')
  const allowed=c.operation==='create'?({contact:['type','firstName','lastName','middleName','phone','email','contactComment','source'],property:['address','listingType','workStream','ownerId','price','rooms','area','floor','totalFloors','constructionYear','propertyType','description','sourceUrl','repair','heating','walls','balcony','elevator','parking'],task:['title','notes','date','time','priority','recurrenceRule','clientId','propertyId','stopOnContact'],event:['kind','title','date','time','notes','clientId','propertyId']} as Record<string,string[]>)[c.entity||'']:c.operation==='update'?Object.keys(fields[c.entity||'']||{}):c.operation==='call'?['title','date','time','notes','outcome','callType','clientId','propertyId','contactName','phone']:c.operation==='activity'?['kind','title','date','time','notes','outcome','clientId','propertyId']:c.operation==='deal'?['price','agencyIncome','agentIncome','expenses','stage','status','notes','nextAction','nextActionAt','accounting']:c.operation==='settings'?['iconSize','density','navigationPosition','enabled','taskReminders','callReminders','meetingReminders','reminderMinutes']:c.operation==='archive'?['reason','note','resumeDate']:c.operation==='theme'?['theme']:c.operation==='task_status'?['status']:[]
  if(!allowed||Object.keys(c.fields).some(key=>!allowed.includes(key)))throw new Error('Неподдерживаемое поле действия.')

  if(c.operation==='archive')validateArchiveReason({reason:c.fields.reason as ArchiveReason['reason'],note:String(c.fields.note||''),resumeDate:String(c.fields.resumeDate||'')})
  if(c.id&&!uuid.test(c.id))throw new Error('Нужен точный идентификатор записи из поиска.')
  for(const [key,val]of Object.entries(c.fields)){
   if(['user_id','userId','id','deleted_at','__proto__','constructor'].includes(key))throw new Error('Недопустимое поле.')
   if(['price','rooms','area','floor','totalFloors','constructionYear','reminderMinutes','agencyIncome','agentIncome','expenses'].includes(key)&&typeof val!=='number')throw new Error('Ожидается число: '+key)
   if(['balcony','elevator','parking','stopOnContact','enabled','taskReminders','callReminders','meetingReminders'].includes(key)&&typeof val!=='boolean')throw new Error('Ожидается логическое значение.')
   if(!['accounting','price','rooms','area','floor','totalFloors','constructionYear','reminderMinutes','agencyIncome','agentIncome','expenses','balcony','elevator','parking','stopOnContact','enabled','taskReminders','callReminders','meetingReminders'].includes(key)&&typeof val!=='string')throw new Error('Ожидается текст: '+key)
   if(key==='accounting'&&(!val||typeof val!=='object'||Array.isArray(val)||Object.keys(val).some(k=>!['direction','closedOn','paidOn','agencyReceived','agentReceived'].includes(k))))throw new Error('Неверные поля учёта.')
   if(typeof val==='string'&&val.length>5000)throw new Error('Слишком длинное поле.')
   if(typeof val==='number'&&(!Number.isFinite(val)||val<0))throw new Error('Число должно быть неотрицательным.')
   if(['clientId','propertyId','ownerId'].includes(key)&&val&&!(typeof val==='string'&&(uuid.test(val)||(/^@[0-9]+$/.test(val)&&Number(val.slice(1))<index))))throw new Error('Нужен найденный контакт или объект.')
  }
 }
 return plan
}
export const required=(f:Record<string,unknown>,key:string)=>{if(typeof f[key]!=='string'||!String(f[key]).trim())throw new Error('Не указано поле '+key);return String(f[key]).trim()}
export const enumValue=(value:unknown,values:string[],fallback?:string)=>{if(value===undefined&&fallback)return fallback;if(typeof value!=='string'||!values.includes(value))throw new Error('Недопустимое значение: '+String(value));return value}
export const date=(value:unknown)=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error('Неверная дата.');return value}
export const time=(value:unknown)=>{if(value&&!(typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)))throw new Error('Неверное время.');return value as string|undefined}
