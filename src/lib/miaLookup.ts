import {calendarParts} from './scheduling'
import {businessMetrics} from './businessAccounting'
import {supabase} from './supabase'
import {fetchAllRows} from './pagination'
import {buildWorkHistory} from './workHistory'
import {mapCallEventRow,mapCallActivityRow} from './callActivityMapping'
import {fetchDeals} from './deals'
type Row=Record<string,unknown>
type Lookup={entity?:string;query?:string;clientId?:string;propertyId?:string;from?:string;to?:string;offset?:number}
export async function miaLookup(userId:string,lookup:Lookup){
 const read=async(table:string)=>(await fetchAllRows(()=>supabase.from(table).select('*').eq('user_id',userId).is('deleted_at',null).setHeader('x-lumicrm-network-only','true'))).data as Row[]
 const q=String(lookup.query||'').toLocaleLowerCase('ru').replace(/ё/g,'е').trim()
 const matches=(text:string)=>!q||q.split(/\s+/).every(w=>text.toLocaleLowerCase('ru').replace(/ё/g,'е').includes(w))
 const during=(value:unknown)=>{if(typeof value!=='string')return false;const date=value.includes('T')&&Number.isFinite(Date.parse(value))?calendarParts(new Date(value)).date:value.slice(0,10);return (!lookup.from||date>=lookup.from)&&(!lookup.to||date<=lookup.to)}
 const related=(r:Row)=>!lookup.clientId||r.client_id===lookup.clientId||r.related_client_id===lookup.clientId||(r.smart_criteria as Row)?.clientId===lookup.clientId
 let rows:Row[]=[]
 if(lookup.entity==='contacts')rows=(await read('clients')).filter(r=>!r.merged_into&&matches([r.first_name,r.last_name,r.middle_name,r.phone].join(' '))).map(r=>({id:r.id,name:[r.first_name,r.last_name,r.middle_name].filter(Boolean).join(' '),role:r.type,status:r.status,phone:r.phone,notes:r.contact_comment||r.description}))
 else if(lookup.entity==='properties')rows=(await read('properties')).filter(r=>matches(String(r.address))).map(r=>({id:r.id,address:r.address,status:r.status,ownerId:r.owner_id,price:r.price,listingType:r.listing_type,workStream:r.work_stream}))
 else if(lookup.entity==='deals')rows=(await fetchDeals(userId)).filter(r=>(!lookup.propertyId||r.propertyId===lookup.propertyId)&&(!lookup.clientId||[...(r.ownerIds||[]),...(r.buyerIds||[])].includes(lookup.clientId))&&matches(JSON.stringify(r))) as unknown as Row[]
 else if(lookup.entity==='tasks')rows=(await read('tasks')).filter(r=>related(r)&&(!(lookup.from||lookup.to)||during(r.due_date))&&(!lookup.propertyId||(r.smart_criteria as Row)?.propertyId===lookup.propertyId)&&matches(String(r.title)+' '+String(r.description))).map(r=>({id:r.id,title:r.title,notes:r.description,date:r.due_date,time:r.due_time,status:r.status,priority:r.priority}))
 else if(lookup.entity==='events'||lookup.entity==='activities')rows=(await read(lookup.entity==='events'?'events':'crm_activities')).filter(r=>related(r)&&(!(lookup.from||lookup.to)||during(r.event_date||r.occurred_at))&&(!lookup.propertyId||r.property_id===lookup.propertyId||r.related_property_id===lookup.propertyId)&&matches(String(r.title)+' '+String(r.notes))).map(r=>({id:r.id,title:r.title,notes:r.notes,date:r.event_date||r.occurred_at,type:r.type,status:r.status}))
 else if(lookup.entity==='trash'){rows=(await Promise.all(['clients','properties','tasks','events','crm_activities','deals'].map(async table=>{const result=await fetchAllRows(()=>supabase.from(table).select('*').eq('user_id',userId).not('deleted_at','is',null).setHeader('x-lumicrm-network-only','true'));return result.data.map(r=>({id:r.id,entity:({clients:'contact',properties:'property',tasks:'task',events:'event',crm_activities:'activity',deals:'deal'} as Record<string,string>)[table],name:r.title||r.address||[r.first_name,r.last_name].filter(Boolean).join(' '),deletedAt:r.deleted_at}))}))).flat().filter(r=>matches(String(r.name)))}
 else if(lookup.entity==='archive'){rows=(await Promise.all(['clients','properties'].map(async table=>(await read(table)).filter(r=>r.status==='archived'||r.status==='sold').map(r=>({id:r.id,entity:table==='clients'?'contact':'property',name:r.address||[r.first_name,r.last_name].join(' '),status:r.status}))))).flat().filter(r=>matches(String(r.name)))}
 else if(lookup.entity==='history'||lookup.entity==='analytics'){
  const [events,activities,tasks]=await Promise.all(['events','crm_activities','tasks'].map(read))
  const entries=buildWorkHistory(events,activities,tasks).filter(r=>(!lookup.clientId||r.clientId===lookup.clientId)&&(!lookup.propertyId||r.propertyId===lookup.propertyId)&&during(r.date)&&matches(r.title+' '+r.notes))
  if(lookup.entity==='analytics'){
   const callMap=new Map([...activities.filter(r=>r.type==='call'&&r.status==='completed').map(mapCallActivityRow),...events.map(mapCallEventRow).filter(r=>r!==null)].map(c=>[c.id,c]))
   const calls=[...callMap.values()].filter(c=>during(c.occurred_at)&&matches(c.title+' '+c.notes)&&(!lookup.clientId||c.metadata?.client_id===lookup.clientId)&&(!lookup.propertyId||c.metadata?.property_id===lookup.propertyId))
   const counts=Object.fromEntries(['call','meeting','task','note','message'].map(kind=>[kind,entries.filter(r=>r.kind===kind).length]))
   const [clients,properties,deals]=await Promise.all(['clients','properties','deals'].map(read));const source={clients,properties,deals:deals.filter(r=>!lookup.propertyId||r.property_id===lookup.propertyId),finance:activities,mortgages:[]};const business=lookup.clientId||lookup.propertyId?null:Object.fromEntries((['sale','rent'] as const).map(mode=>[mode,businessMetrics(source,mode,lookup.from||'',lookup.to||'').map(({label,value})=>({label,value}))]));
   return {complete:true,business,period:{from:lookup.from||null,to:lookup.to||null},counts,coldCalls:calls.filter(c=>c.metadata?.call_type==='cold').length,notes:'Все доступные неудалённые записи за период. Встречи включают показы и переговоры; количество встреч не равно показам. Причинную конверсию звонок→показ эти данные не доказывают. Текст сообщения не доказывает отправку.'}
  }
  rows=entries.map(r=>({...r,historyId:r.id,id:r.id.split(':').slice(1).join(':'),notes:r.notes.slice(0,1500)}))
 }else throw new Error('Этот поиск пока не поддерживается.')
 const offset=Number.isInteger(lookup.offset)&&Number(lookup.offset)>=0?Number(lookup.offset):0
 return {total:rows.length,offset,hasMore:rows.length>offset+20,rows:rows.slice(offset,offset+20)}
}
