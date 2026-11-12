// One Durable Object per verified Supabase account. No caller-supplied tenant IDs.
export class MiaAccount {
 constructor(state){this.state=state}
 async fetch(request){
  const body=await request.json()
  return this.state.storage.transaction(async storage=>{
   const meta=await storage.get('meta')||{version:0,sequence:0,preferences:'',memoryEnabled:true,memoryRevision:0,pending:null,lease:null}
   const reply=(data,status=200)=>Response.json(data,{status})
   if(body.op==='read'){
    const before=Number.isInteger(body.before)?body.before:meta.sequence+1
    const rows=await storage.list({prefix:'message:',reverse:true,limit:101,end:'message:'+String(before).padStart(12,'0')})
    const messages=[...rows.values()].slice(0,100).reverse()
    const facts=await storage.list({prefix:'fact:',end:'fact:~',reverse:true});return reply({...meta,facts:[...facts.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)),messages,hasOlder:rows.size>100})
   }
   if(body.op==='remember'){
    if(!meta.memoryEnabled)return reply({error:'Память отключена.'},409)
    const source=await storage.get('id:'+body.messageId)
    if(!source||source.role!=='user')return reply({error:'Нет исходного сообщения пользователя.'},400)
    await storage.put('fact:'+source.id,{id:source.id,text:source.text,createdAt:source.createdAt})
   }else if(body.op==='forget'){
    if(typeof body.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(body.id))return reply({error:'Неверная запись памяти.'},400)
    await storage.delete('fact:'+body.id)
   }else if(body.op==='claim'){
    if(typeof body.token!=='string'||body.token.length>100)return reply({error:'Неверный запрос.'},400)
    if(meta.lease&&meta.lease.until>Date.now()&&meta.lease.token!==body.token)return reply({error:'Мия обрабатывает просьбу на другом устройстве. Дождитесь ответа.'},409)
    meta.lease={token:body.token,until:Date.now()+300000}
   }else if(body.op==='release'){
    if(meta.lease?.token===body.token)meta.lease=null
   }else if(body.op==='append'||body.op==='finish'){
    if(body.op==='finish')body.role='assistant'
    if(typeof body.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(body.id)||!['user','assistant'].includes(body.role)||typeof body.text!=='string'||!body.text.trim()||body.text.length>20000)return reply({error:'Неверное сообщение.'},400)
    const old=await storage.get('id:'+body.id)
    if(old){if(old.text!==body.text||old.role!==body.role)return reply({error:'Сообщение с этим номером уже существует.'},409);return reply(old)}
    if(body.op==='finish'){if(meta.lease?.token!==body.token||meta.lease.until<Date.now()||meta.pending?.id!==body.planId)return reply({error:'Действие уже изменилось. Обновите чат.'},409);meta.pending=null}
    const row={id:body.id,role:body.role,text:body.text,sequence:++meta.sequence,createdAt:new Date().toISOString()}
    await storage.put('message:'+String(row.sequence).padStart(12,'0'),row);await storage.put('id:'+row.id,row);meta.version=(meta.version||0)+1;await storage.put('meta',meta);return reply(row)
   }else if(body.op==='memory'){
    if(body.revision!==meta.memoryRevision)return reply({error:'Память изменена на другом устройстве. Обновите её перед сохранением.'},409)
    if(typeof body.preferences!=='string'||body.preferences.length>4000||typeof body.memoryEnabled!=='boolean')return reply({error:'Недопустимая память.'},400)
    meta.preferences=body.preferences;meta.memoryEnabled=body.memoryEnabled;meta.memoryRevision++
   }else if(body.op==='pending'){
    if(!meta.lease||meta.lease.token!==body.token||meta.lease.until<Date.now())return reply({error:'Срок обработки истёк. Обновите чат.'},409)
    if(JSON.stringify(body.value).length>50000)return reply({error:'Слишком много действий.'},400)
    meta.pending=body.value
   }else return reply({error:'Неизвестная операция.'},400)
   meta.version=(meta.version||0)+1;await storage.put('meta',meta);return reply({ok:true,...meta})
  })
 }
}
