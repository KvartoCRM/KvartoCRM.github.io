import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const {chromium}=await import('../docs/design/update-concept-2026-10-28/.build/node_modules/playwright/index.mjs')
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
await fs.writeFile('tmp/qa-mia-actions.html','<script type="module">import{executeMiaCommand,validateMiaPlan}from"/src/lib/miaActions.ts";import{miaLookup}from"/src/lib/miaLookup.ts";window.actions={executeMiaCommand,validateMiaPlan,miaLookup}</script>')
const tables={clients:[],properties:[],property_details:[],property_owners:[],property_history:[],tasks:[],events:[],crm_activities:[],deals:[],deal_participants:[]};let writes=0
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const page=await browser.newPage();await page.addInitScript(uid=>localStorage.setItem('sb-flwsglkkarikekkopdbu-auth-token',JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:4102444800,user:{id:uid}})),uid)
 await page.route('**/*',async route=>{const u=new URL(route.request().url()),method=route.request().method();if(u.pathname.includes('/rest/v1/')){
 const table=u.pathname.split('/').pop();let rows=tables[table]||[];assert.equal(u.searchParams.get('user_id')||'eq.'+uid,'eq.'+uid)
 const match=r=>[...u.searchParams].every(([k,v])=>v.startsWith('eq.')?String(r[k])===v.slice(3):v==='is.null'?r[k]==null:v.startsWith('in.(')?v.slice(4,-1).split(',').includes(String(r[k])):true)
 const object=route.request().headers().accept?.includes('vnd.pgrst.object')
 if(method==='POST'){const body=route.request().postDataJSON();const entries=Array.isArray(body)?body:[body];for(const entry of entries){assert.equal(entry.user_id,uid);const old=rows.find(r=>r.id&&r.id===entry.id||table==='property_details'&&r.property_id===entry.property_id);if(old)Object.assign(old,entry);else rows.push({...entry,created_at:new Date().toISOString(),updated_at:new Date().toISOString()})}tables[table]=rows;writes+=entries.length;return route.fulfill({json:object?entries[0]:entries})}
 if(method==='PATCH'){const body=route.request().postDataJSON(),found=rows.filter(match);found.forEach(r=>Object.assign(r,body));writes++;return route.fulfill({json:object?found[0]||null:found})}
 if(method==='DELETE'){tables[table]=rows.filter(r=>!match(r));writes++;return route.fulfill({json:[]})}
 rows=rows.filter(match);const offset=Number(u.searchParams.get('offset')||0);rows=rows.slice(offset,offset+Number(u.searchParams.get('limit')||500));return route.fulfill({json:object?rows[0]||null:rows})}
 if(u.hostname==='127.0.0.1')return route.continue();return route.abort()})
 await page.goto('http://127.0.0.1:3000/tmp/qa-mia-actions.html');await page.waitForFunction(()=>window.actions)
 const run=async(command,ids=[])=>page.evaluate(async({command,uid,ids})=>{window.actions.validateMiaPlan({type:'commands',commands:[command]});return window.actions.executeMiaCommand(uid,command,crypto.randomUUID(),ids,t=>window.theme=t)},{command,uid,ids})
 const owner=await run({operation:'create',entity:'contact',fields:{firstName:'Валерия',type:'seller',phone:'+70000000000'}});assert.equal(tables.clients[0].first_name,'Валерия')
 const property=await run({operation:'create',entity:'property',fields:{address:'Тестовая, 28',listingType:'sale',workStream:'cold',ownerId:owner,price:5000000}});assert.equal(tables.properties[0].owner_id,owner);assert.equal(tables.property_owners[0].client_id,owner)
 const task=await run({operation:'create',entity:'task',fields:{title:'Перезвонить',date:'2026-11-09',clientId:owner,propertyId:property}})
 await run({operation:'update',entity:'task',id:task,fields:{title:'Уточнить решение',priority:'high'}});assert.equal(tables.tasks[0].smart_criteria.clientId,owner);assert.equal(tables.tasks[0].priority,'high')
 await run({operation:'task_status',entity:'task',id:task,fields:{status:'done'}});assert.equal(tables.tasks[0].is_completed,true)
 await run({operation:'task_status',entity:'task',id:task,fields:{status:'todo'}});assert.equal(tables.tasks[0].is_completed,false)
 await run({operation:'call',fields:{title:'Первый звонок',date:'2026-11-06',clientId:owner,propertyId:property,notes:'Обсудит с братом',callType:'cold'}});assert(tables.events[0].external_key.startsWith('call-log:'))
 const conditional=await run({operation:'create',entity:'task',fields:{title:'Позвонить до связи',date:'2026-11-10',clientId:owner,stopOnContact:true}});tables.tasks.find(t=>t.id===conditional).created_at='2026-11-05T10:00:00Z';await run({operation:'call',fields:{title:'Дозвонился',date:'2026-11-06',clientId:owner,outcome:'Состоялся'}});assert(tables.tasks.find(t=>t.id===conditional).deleted_at);assert(!tables.tasks.find(t=>t.id===task).deleted_at);
 await run({operation:'activity',fields:{kind:'meeting',title:'Переговоры',date:'2026-11-06',clientId:owner,propertyId:property,notes:'Даст ответ'}});assert.equal(tables.crm_activities[0].client_id,owner)
 await run({operation:'create',entity:'event',fields:{kind:'call',title:'Связаться',date:'2026-11-09',time:'11:00',clientId:owner}})
 await run({operation:'archive',entity:'contact',id:owner,fields:{}});assert.equal(tables.clients[0].status,'archived');await run({operation:'restore',entity:'contact',id:owner,fields:{}});assert.equal(tables.clients[0].status,'active')
 await run({operation:'trash',entity:'property',id:property,fields:{}});assert(tables.properties[0].deleted_at);await run({operation:'restore',entity:'property',id:property,fields:{}});assert.equal(tables.properties[0].deleted_at,null)
 await run({operation:'theme',fields:{theme:'aurora'}});assert.equal(await page.evaluate(()=>window.theme),'aurora')
 const dealId=crypto.randomUUID(),buyerId=crypto.randomUUID();tables.deals.push({id:dealId,user_id:uid,property_id:property,buyer_id:buyerId,status:'active',stage:'preparation',price:5000000,notes:'Сохранить заметку',checklist:[{id:'kvartocrm:accounting-v1',accounting:{direction:'sale'}}]});tables.deal_participants.push({id:crypto.randomUUID(),user_id:uid,deal_id:dealId,client_id:owner,role:'owner'},{id:crypto.randomUUID(),user_id:uid,deal_id:dealId,client_id:buyerId,role:'buyer'});await run({operation:'deal',entity:'deal',id:dealId,fields:{stage:'documents',accounting:{paidOn:'2026-11-06',agencyReceived:50000,agentReceived:20000}}});assert.equal(tables.deals[0].notes,'Сохранить заметку');assert.equal(tables.deals[0].stage,'documents');assert.equal(tables.deals[0].checklist.find(x=>x.id==='kvartocrm:accounting-v1').accounting.agencyReceived,50000);
 const before=writes;await assert.rejects(run({operation:'update',entity:'contact',id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',fields:{firstName:'Чужой'}}));await assert.rejects(run({operation:'create',entity:'contact',fields:{firstName:'Нет телефона',type:'seller'}}));assert.equal(writes,before)
 const analytics=await page.evaluate(uid=>window.actions.miaLookup(uid,{entity:'analytics',from:'2026-11-01',to:'2026-11-30'}),uid);assert.equal(analytics.coldCalls,1);assert.equal(analytics.counts.meeting,1)
 for(let i=0;i<45;i++)tables.clients.push({id:crypto.randomUUID(),user_id:uid,first_name:'Контакт '+i});const all=await page.evaluate(uid=>window.actions.miaLookup(uid,{entity:'contacts',query:'Контакт',offset:40}),uid);assert.equal(all.total,45);assert.equal(all.rows.length,5)
 console.log(JSON.stringify({ok:true,writes,searchBeyondInitialIndex:true,analytics:true}))
}finally{await browser.close()}
