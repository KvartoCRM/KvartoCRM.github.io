import {useQuery} from '@tanstack/react-query'
import {useState} from 'react'
import {supabase} from '../lib/supabase'
import {archiveReasons,currentArchiveReason,type ArchiveReason} from '../lib/archiveReason'
import ArchiveReasonDialog from './ArchiveReasonDialog'
export default function ArchiveReasonSummary({userId,entity,id}:{userId:string;entity:'contact'|'property';id:string}){
 const [editing,setEditing]=useState(false)
 const query=useQuery({queryKey:['archive-reason',userId,entity,id],queryFn:async()=>{const [row,activities]=await Promise.all([supabase.from(entity==='contact'?'clients':'properties').select('id,status,archived_at').eq('id',id).eq('user_id',userId).single(),supabase.from('crm_activities').select('metadata').eq('user_id',userId).eq(entity==='contact'?'client_id':'property_id',id).eq('metadata->>kind','archive_reason').is('deleted_at',null).order('occurred_at',{ascending:false}).limit(100)]);if(row.error)throw row.error;if(activities.error)throw activities.error;return {status:row.data.status,reason:currentArchiveReason(row.data,activities.data) as ArchiveReason|null}}})
 return <div className="my-3 space-y-2 text-sm">{query.isPending?<p className="lumi-muted">Загрузка причины…</p>:query.isError?<p className="text-amber-400">Не удалось загрузить причину.</p>:<><p>{query.data.reason?archiveReasons[query.data.reason.reason]:'Причина не указана'}</p>{query.data.reason?.note&&<p className="lumi-muted whitespace-pre-wrap">{query.data.reason.note}</p>}{query.data.reason?.resumeDate&&<p className="lumi-accent-text">Вернуться к вопросу: {query.data.reason.resumeDate}</p>}</>}{query.data?.status==='archived'&&<button className="lumi-accent-text" onClick={()=>setEditing(true)}>Уточнить причину</button>}{editing&&<ArchiveReasonDialog userId={userId} entity={entity} id={id} onClose={()=>setEditing(false)} onSaved={()=>setEditing(false)}/>}</div>
}
