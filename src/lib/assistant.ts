import {miaFetch} from './miaTransport'
import {supabase} from './supabase'
export type AiMode='mia'|'note'|'summary'|'message'|'description'|'report'
export type AiResult={mia?:unknown;remember?:boolean;text:string;warnings:string[];action:null|{kind:'task'|'call'|'meeting';title:string;date:string;time:string;notes:string};usage:number;description?:{strengths:string[];titles:string[];recommended:number;reason:string}}
export async function askAssistant(mode:AiMode,context:string,images:string[]=[],signal?:AbortSignal):Promise<AiResult>{
 const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw new Error('Войдите в CRM.')
 let response:Response;try{response=await miaFetch('https://kvartocrm-ai.denzotrail.workers.dev/generate',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({mode,context,images}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)})}catch{throw new Error('Не удалось связаться с Мией. Проверьте интернет и повторите сообщение.')}
 const result=await response.json();if(!response.ok)throw new Error(result.error||'ИИ недоступен.');return result
}
