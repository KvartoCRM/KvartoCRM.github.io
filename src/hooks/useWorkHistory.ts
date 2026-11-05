import {useQuery} from '@tanstack/react-query'
import {supabase} from '../lib/supabase'
import {fetchAllRows} from '../lib/pagination'
import {buildWorkHistory} from '../lib/workHistory'
export function useWorkHistory(userId?:string){return useQuery({queryKey:['work-history',userId],enabled:Boolean(userId),staleTime:0,queryFn:async()=>{
 const results=await Promise.all(['events','crm_activities','tasks'].map(table=>fetchAllRows(()=>supabase.from(table).select('*').eq('user_id',userId!).is('deleted_at',null))))
 for(const result of results)if(result.error)throw result.error
 return buildWorkHistory(results[0].data,results[1].data,results[2].data)
}})}
