import {supabase} from './supabase'
import {archiveReasons,validateArchiveReason,type ArchiveReason} from './archiveReason'
export async function archiveWithReason(userId:string,entity:'contact'|'property',id:string,reason:ArchiveReason,operation:{id:string;at:string}){
 validateArchiveReason(reason)
 const table=entity==='contact'?'clients':'properties'
 const existing=await supabase.from(table).select('id,status,archived_at,updated_at').eq('user_id',userId).eq('id',id).is('deleted_at',null).setHeader('x-lumicrm-network-only','true').single()
 if(existing.error)throw existing.error
 if(existing.data.status==='archived'&&Date.parse(existing.data.archived_at)===Date.parse(operation.at))return
 const receipt=await supabase.from('crm_activities').select('id,metadata').eq('user_id',userId).eq('id',operation.id).maybeSingle()
 if(receipt.error)throw receipt.error
 if(receipt.data){const m=receipt.data.metadata;if(m?.entityId!==id||m?.entity!==entity||m?.reason!==reason.reason||m?.note!==reason.note||m?.resumeDate!==reason.resumeDate)throw new Error('Предыдущая попытка содержит другую причину. Закройте форму и откройте заново.')}
 if(!receipt.data){
  const result=await supabase.from('crm_activities').insert({id:operation.id,user_id:userId,type:'note',status:'completed',title:'Указана причина архива',notes:[archiveReasons[reason.reason],reason.resumeDate?`Вернуться: ${reason.resumeDate}`:'',reason.note].filter(Boolean).join('\n'),client_id:entity==='contact'?id:null,property_id:entity==='property'?id:null,occurred_at:operation.at,metadata:{kind:'archive_reason',entity,entityId:id,archivedAt:operation.at,...reason}})
  if(result.error)throw result.error
 }
 let update=supabase.from(table).update({status:'archived',archived_at:operation.at}).eq('id',id).eq('user_id',userId).is('deleted_at',null)
 update=existing.data.updated_at?update.eq('updated_at',existing.data.updated_at):update.is('updated_at',null)
 const saved=await update.select('id').single()
 if(saved.error)throw new Error('Причина записана в историю, но перенос в архив не подтверждён. Повторите сохранение.')
}
