// Read-only generation and idempotent cloud operations may retry one transport failure.
export async function miaFetch(url:string,options:RequestInit){
 try{return await fetch(url,options)}catch(error){
  if(!(error instanceof TypeError)||options.signal?.aborted)throw error
  await new Promise(resolve=>setTimeout(resolve,700))
  return fetch(url,options)
 }
}
