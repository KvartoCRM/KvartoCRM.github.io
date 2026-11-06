import {supabase} from './supabase'
import {fetchAllRows} from './pagination'
export async function stopCallFollowups(userId:string,clientId:string|undefined,status:string|undefined,occurredAt:string){
 if(!clientId||status!=='Состоялся')return
 const {data}=await fetchAllRows(()=>supabase.from('tasks').select('id,created_at,smart_criteria,status,is_completed').eq('user_id',userId).is('deleted_at',null).setHeader('x-lumicrm-network-only','true'))
 const ids=data.filter(t=>t.smart_criteria?.clientId===clientId&&t.smart_criteria?.stopOnContact===true&&!t.is_completed&&t.status!=='done'&&(!t.created_at||Date.parse(t.created_at)<=Date.parse(occurredAt))).map(t=>String(t.id))
 for(const id of ids){const r=await supabase.from('tasks').update({deleted_at:new Date().toISOString()}).eq('id',id).eq('user_id',userId).select('id').setHeader('x-lumicrm-network-only','true').maybeSingle();if(r.error||!r.data)throw new Error('Звонок сохранён. Не удалось отменить все повторные напоминания; повторите сохранение.')}
}
