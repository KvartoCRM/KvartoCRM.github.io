export const resources=['contact','property','task','event','activity','deal'];
export const actions=['read','create','update','archive','restore','trash'];
export const permissionKeys=[...resources.flatMap(r=>actions.map(a=>r+'.'+a)),'navigate','settings','attachments'];
export const defaultSettings=()=>({name:'Мия',avatar:'',personality:'Доброжелательная, внимательная и практичная помощница.',replyStyle:'Пиши по-русски, понятно и по делу.',reportStyle:'Факты, сделанная работа, результат и следующий шаг.',showStatus:true,permissions:Object.fromEntries(permissionKeys.map(k=>[k,true]))});
export function validateSettings(s){
 if(!s||typeof s!=='object'||!['name','avatar','personality','replyStyle','reportStyle'].every(k=>typeof s[k]==='string')||!s.name.trim()||s.name.length>40||s.personality.length>2000||s.replyStyle.length>4000||s.reportStyle.length>4000||typeof s.showStatus!=='boolean')return false;
 if(s.avatar&&(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s.avatar)||s.avatar.length>85000))return false;
 return s.permissions&&Object.keys(s.permissions).length===permissionKeys.length&&permissionKeys.every(k=>typeof s.permissions[k]==='boolean');
}
export async function deleteFile(storage,id){const f=await storage.get('file:'+id);if(f){for(let i=0;i<f.chunks;i++)await storage.delete('chunk:'+id+':'+i);await storage.delete('file:'+id)}}
export async function settingsOperation(body,meta,storage){
 const reply=(v,status=200)=>Response.json(v,{status});
 const savedSettings=await storage.get('settings');meta.settings={...defaultSettings(),...(savedSettings||meta.settings),permissions:{...defaultSettings().permissions,...(savedSettings||meta.settings)?.permissions}};
 meta.settingsRevision ||=0;meta.historyRevision ||=0;
 if(body.op==='authorize'){
  if(!Array.isArray(body.keys)||!body.keys.length||body.keys.some(k=>!permissionKeys.includes(k)))return reply({error:'Неизвестный доступ.'},400);
  return body.keys.every(k=>meta.settings.permissions[k])?reply({ok:true}):reply({error:'Это действие отключено в настройках Мии.'},403);
 }
 if(body.op==='settings'){
  if(body.revision!==meta.settingsRevision)return reply({error:'Настройки изменены на другом устройстве. Обновите страницу.'},409);
  if(!validateSettings(body.settings))return reply({error:'Проверьте настройки Мии.'},400);
  meta.settings=body.settings;await storage.put('settings',body.settings);meta.settingsRevision++;
 }else if(body.op==='fact_save'){
  if(typeof body.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(body.id)||typeof body.text!=='string'||!body.text.trim()||body.text.length>4000)return reply({error:'Запись памяти должна содержать от 1 до 4000 символов.'},400);
  if(body.version!==meta.version)return reply({error:'Память изменилась. Обновите страницу.'},409);
  const old=await storage.get('fact:'+body.id);await storage.put('fact:'+body.id,{...old,id:body.id,text:body.text.trim(),createdAt:old?.createdAt||new Date().toISOString(),retired:false});
 }else if(['history_clear','message_delete','memory_clear'].includes(body.op)){
  if(body.version!==meta.version)return reply({error:'Данные изменились. Обновите страницу перед удалением.'},409);
  if(meta.lease?.until>Date.now()||meta.pending)return reply({error:'Сначала завершите или отмените действие в чате.'},409);
  if(body.op==='memory_clear'){for(const k of (await storage.list({prefix:'fact:',end:'fact:~'})).keys())await storage.delete(k);meta.preferences='';meta.memoryRevision++;}
  else {
   const messages=body.op==='history_clear'?[...(await storage.list({prefix:'message:',end:'message:~'})).values()]:[await storage.get('id:'+body.id)].filter(Boolean);
   for(const m of messages){for(const f of m.attachments||[])await deleteFile(storage,f.id);await storage.delete('message:'+String(m.sequence).padStart(12,'0'));await storage.delete('id:'+m.id)}
   if(body.op==='history_clear')for(const k of (await storage.list({prefix:'file:',end:'file:~'})).keys())await deleteFile(storage,k.slice(5));
   meta.historyRevision++;
  }
 }else if(body.op==='file_put'){
  if(!meta.settings.permissions.attachments)return reply({error:'Вложения отключены в настройках Мии.'},403);
  if(typeof body.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(body.id)||typeof body.name!=='string'||body.name.length>240||!body.name||typeof body.data!=='string'||body.data.length>2800000||!body.data.length||!/^data:(image\/(jpeg|png|webp)|application\/(pdf|vnd.openxmlformats-officedocument.wordprocessingml.document)|text\/plain);base64,[A-Za-z0-9+/=]+$/.test(body.data))return reply({error:'Файл не поддерживается или превышает 2 МБ.'},400);
  const old=await storage.get('file:'+body.id);if(old)return reply(old);
  const chunks=Math.ceil(body.data.length/60000),f={id:body.id,name:body.name,mime:body.data.slice(5,body.data.indexOf(';')),size:body.size,chunks};
  for(let i=0;i<chunks;i++)await storage.put('chunk:'+body.id+':'+i,body.data.slice(i*60000,(i+1)*60000));await storage.put('file:'+body.id,f);return reply(f);
 }else if(body.op==='file_get'){
  const f=await storage.get('file:'+body.id);if(!f)return reply({error:'Файл удалён или недоступен.'},404);
  let data='';for(let i=0;i<f.chunks;i++)data+=await storage.get('chunk:'+body.id+':'+i);return reply({...f,data});
 }else if(body.op==='file_delete'){const f=await storage.get('file:'+body.id);if(f?.messageId){const m=await storage.get('id:'+f.messageId);if(m){m.attachments=(m.attachments||[]).filter(a=>a.id!==body.id);await storage.put('id:'+m.id,m);await storage.put('message:'+String(m.sequence).padStart(12,'0'),m)}}await deleteFile(storage,body.id);meta.historyRevision++;}
 else return null;
 meta.version++;await storage.put('meta',{...meta,settings:undefined});return reply({ok:true,...meta});
}
