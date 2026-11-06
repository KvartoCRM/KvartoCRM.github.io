import {accountKey,readAccountValue,writeAccountValue,parseAccountValue} from './accountStorage'
import {miaCloud,type MiaCloudState} from './miaCloud'
import {recurrenceId} from './recurrenceIdentity'
export async function importLocalMia(userId:string,current:MiaCloudState){
 const key=(name:string)=>accountKey(userId,name)
 if(readAccountValue(key('mia:cloud-import-v1')))return
 const old=parseAccountValue<{role:string;text:string}[]>(readAccountValue(key('draft:mia-messages')),[])
 const preferences=parseAccountValue(readAccountValue(key('mia:preferences')),'')
 const pending=parseAccountValue<{id?:string}|null>(readAccountValue(key('draft:mia-pending')),null)
 if(!old.length&&!preferences&&!pending){writeAccountValue(key('mia:cloud-import-v1'),'1');return}
 const token=crypto.randomUUID();await miaCloud({op:'claim',token},userId)
 try{
  for(const [index,message]of old.entries())if(['user','assistant'].includes(message.role)&&typeof message.text==='string'&&message.text.trim())await miaCloud({op:'append',id:await recurrenceId(userId,'legacy:'+index+':'+message.role+':'+message.text),role:message.role,text:message.text},userId)
  if(preferences&&current.memoryRevision===0)await miaCloud({op:'memory',revision:0,preferences,memoryEnabled:parseAccountValue(readAccountValue(key('mia:memory-enabled')),true)},userId)
  if(pending){const fresh=await miaCloud({op:'read'},userId);if(fresh.pending){if((fresh.pending as {id?:string}).id!==pending.id)return}else await miaCloud({op:'pending',token,value:pending},userId);writeAccountValue(key('draft:mia-pending'),null)}
  writeAccountValue(key('mia:cloud-import-v1'),'1');return true
 }finally{await miaCloud({op:'release',token},userId)}
}
