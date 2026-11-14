import {supabase} from './supabase'
export async function transcribeVoice(blob:Blob,userId:string,signal:AbortSignal){
 const {data}=await supabase.auth.getSession()
 if(!data.session||data.session.user.id!==userId)throw new Error('Аккаунт изменился. Запишите заметку заново.')
 if(blob.size>2100000)throw new Error('Запись слишком большая. Разделите заметку на части.')
 const bytes=new Uint8Array(await blob.arrayBuffer());let binary=''
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
 let response:Response
 try{response=await fetch('https://kvartocrm-ai.denzotrail.workers.dev/transcribe',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({audio:btoa(binary)}),signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])})}catch{throw new Error('Не удалось передать запись. Проверьте соединение и повторите обработку.')}
 const result=await response.json()
 if(!response.ok)throw new Error(result.error||'Не удалось распознать запись.')
 const latest=await supabase.auth.getSession()
 if(latest.data.session?.user.id!==userId)throw new Error('Аккаунт изменился.')
 if(typeof result.text!=='string'||!result.text.trim())throw new Error('В записи не удалось разобрать речь.')
 return result.text
}
