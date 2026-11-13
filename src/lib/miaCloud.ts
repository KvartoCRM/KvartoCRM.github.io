import {miaFetch} from './miaTransport'
import {supabase} from './supabase'
export type MiaReceipt={id:string;entity:string;operation:string;title:string;revision?:string}
export type CloudMessage={id:string;role:'user'|'assistant';text:string;sequence:number;createdAt:string;receipts?:MiaReceipt[]}
export type MiaCloudState={facts?:{id:string;text:string;createdAt:string;retired?:boolean;references?:{entity:string;id:string}[]}[];version:number;messages:CloudMessage[];hasOlder:boolean;sequence:number;preferences:string;memoryEnabled:boolean;memoryRevision:number;pending:unknown;lease:null|{token:string;until:number}}
export async function miaCloud<T=MiaCloudState>(body:Record<string,unknown>,expectedUserId?:string):Promise<T>{
 const {data,error}=await supabase.auth.getSession()
 if(error||!data.session)throw new Error('Войдите в CRM.')
 if(expectedUserId&&data.session.user.id!==expectedUserId)throw new Error('Аккаунт изменился.')
 let response:Response;try{response=await miaFetch('https://kvartocrm-ai.denzotrail.workers.dev/mia-cloud',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)})}catch{throw new Error('Чат пока не синхронизирован. Проверьте интернет и повторите.')}
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Облачный чат недоступен.');return result
}
