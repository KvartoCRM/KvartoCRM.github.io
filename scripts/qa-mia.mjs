import {MiaAccount} from '../cloudflare/kvartocrm-ai/mia-account.js'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const {chromium}=await import('../docs/design/update-concept-2026-10-28/.build/node_modules/playwright/index.mjs')
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',buyer='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',property='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
await fs.writeFile('tmp/qa-mia.html','<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tmp/qa-mia.tsx"></script>')
await fs.writeFile('tmp/qa-mia.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{QueryClientProvider}from'@tanstack/react-query';import{queryClient}from'/src/lib/queryClient';import MiaChat from'/src/components/MiaChat';import{ThemeProvider}from'/src/context/ThemeContext';import'/src/index.css';document.documentElement.dataset.theme='midnight';createRoot(document.getElementById('root')).render(<BrowserRouter><QueryClientProvider client={queryClient}><ThemeProvider><MiaChat/></ThemeProvider></QueryClientProvider></BrowserRouter>)`)
const tables={clients:[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',user_id:uid,type:'seller',first_name:'Александр',status:'archived'},{id:buyer,user_id:uid,type:'buyer',first_name:'Анна',status:'active'}],properties:[{id:property,user_id:uid,address:'Ленина, 10',status:'available'}],crm_activities:[],tasks:[]}
const cloudRows=new Map();const storage={delete:async k=>cloudRows.delete(k),get:async k=>structuredClone(cloudRows.get(k)),put:async(k,v)=>cloudRows.set(k,structuredClone(v)),list:async({prefix,end,limit})=>new Map([...cloudRows].filter(([k])=>k.startsWith(prefix)&&k<end).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,limit)),transaction:async cb=>cb(storage)};const accountStore=new MiaAccount({storage});
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];let requests=0,failTask=true,writes=0
try{
 const page=await browser.newPage({viewport:{width:390,height:844}})
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(({uid})=>localStorage.setItem('sb-flwsglkkarikekkopdbu-auth-token',JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:uid}})),{uid})
 const routeHandler=async route=>{
 const u=new URL(route.request().url()),method=route.request().method()
 if(u.pathname==='/src/context/AuthContext.tsx')return route.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({user:{id:'${uid}',firstName:'Денис'}})`})
 if(u.hostname==='kvartocrm-ai.denzotrail.workers.dev'){
 if(method==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type'}})
 if(u.pathname==='/mia-cloud'){const response=await accountStore.fetch(new Request('https://account/',{method:'POST',body:route.request().postData()}));return route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},json:await response.json()})}
 requests++;const body=route.request().postDataJSON();const context=JSON.parse(body.context)
 const last=context.conversation?.at(-1)?.text||context.request?.conversation?.at(-1)?.text||''
 if(last.includes('Марии по Дейнеки'))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{text:'Создала задачу.',warnings:[],mia:context.validationError?{type:'commands',commands:[{operation:'create',entity:'task',fields:{title:'Позвонить Марии по Дейнеки',date:'2026-11-13',time:'12:00'}}]}:{type:'commands',commands:[{operation:'create_task',entity:'tasks',fields:{title:'Позвонить Марии'}}]}}})
 if(last.includes('Александр')){assert(context.owners.some(o=>o.name==='Александр'&&o.status==='archived'));return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{text:context.personalContext?.facts?.some(f=>f.text.includes('квартира продана'))?'Учла проданную квартиру.':'Учту причину архива.',warnings:[],mia:null,remember:last.includes('квартира продана')}})}
 return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{text:'Подготовила запись.',warnings:[],action:null,mia:requests===1?null:requests===2?{type:'record',clientId:buyer,propertyId:property,meeting:{date:context.today,notes:'Понравилась, думает'},task:{date:context.nextMonday,title:'Уточнить решение',notes:'После показа'}}:requests===4?{type:'commands',commands:[{operation:'create',entity:'contact',fields:{type:'seller',firstName:'Валерия',phone:'+79990001122'}},{operation:'create',entity:'task',fields:{title:'Перезвонить Валерии',date:context.nextMonday,clientId:'@0'}}]}:{type:'navigate',page:'reports'}}})
 }
 if(u.pathname.includes('/rest/v1/')){
 const table=u.pathname.split('/').pop();let rows=tables[table]||[]
 assert.equal(u.searchParams.get('user_id')||'eq.'+uid,'eq.'+uid)
 if(method==='POST'){
 const body=route.request().postDataJSON();assert.equal(body.user_id,uid)
 if(table==='tasks'&&failTask){failTask=false;return route.fulfill({status:503,json:{message:'fixture unavailable'}})}
 writes++;rows.push(body);tables[table]=rows;return route.fulfill({json:body})
 }
 for(const [k,v] of u.searchParams)if(v.startsWith('eq.'))rows=rows.filter(r=>String(r[k])===v.slice(3))
 rows=rows.slice(Number(u.searchParams.get('offset')||0),Number(u.searchParams.get('offset')||0)+Number(u.searchParams.get('limit')||500))
 return route.fulfill({json:route.request().headers().accept?.includes('vnd.pgrst.object')?rows[0]||null:rows})
 }
 if(u.hostname==='127.0.0.1')return route.continue();return route.abort()
 };await page.route('**/*',routeHandler)
 await page.addInitScript(uid=>{const key='kvarto:account:'+uid+':draft:mia-messages';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify([{role:'user',text:'Старая локальная запись'}]))},uid)
 await page.goto('http://127.0.0.1:3000/tmp/qa-mia.html')
 assert.equal(await page.getByRole('button',{name:'Открыть чат с Мией'}).innerText(),'');await page.getByRole('button',{name:'Открыть чат с Мией'}).click()
 await page.getByText('Здравствуйте, Денис!',{exact:false}).waitFor()
 const send=async text=>{await page.getByLabel('Сообщение Мии').fill(text);await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click()}
 await send('Запомни: отвечай коротко');await page.getByText('Запомнила в вашем аккаунте.',{exact:false}).waitFor();assert.equal(requests,0);await page.getByRole('button',{name:'Память',exact:true}).click();assert.equal(await page.getByLabel('Память Мии').inputValue(),'отвечай коротко');await page.getByRole('button',{name:'Память',exact:true}).click();await send('Провёл показ.');await page.getByText('Подготовила запись.',{exact:true}).waitFor();assert.equal(writes,0)
 await send('Анна смотрела Ленина, 10. Понравилась, думает. Позвонить в ближайший понедельник.')
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Повторить сохранение'&&!b.disabled));assert.equal(tables.crm_activities.length,1);assert.equal(tables.tasks.length,0)
 await page.reload();await page.getByRole('button',{name:'Открыть чат с Мией'}).click();await page.getByRole('button',{name:'Повторить сохранение'}).click()
 await page.getByText('Задача «Уточнить решение» создана',{exact:false}).waitFor();assert.equal(tables.crm_activities.length,1);assert.equal(tables.tasks.length,1)
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Изменить размер чата'}).click();const panel=page.getByRole('region',{name:'Чат с Мией'});assert(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth));await page.screenshot({path:`tmp/qa-mia-${width}.png`})}
 await page.getByRole('button',{name:'Закрыть чат'}).click();await page.getByRole('button',{name:'Открыть чат с Мией'}).click();assert(await page.getByRole('log').evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight<3))
 await send('Открой отчёты собственникам');await page.getByRole('dialog',{name:'Отчёты собственникам'}).waitFor()
 await page.getByRole('dialog').getByRole('button',{name:'Закрыть окно'}).click();failTask=true;await send('Создай Валерию и задачу перезвонить');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Повторить сохранение'&&!b.disabled));assert.equal(tables.clients.filter(c=>c.first_name==='Валерия').length,1);
 const phoneContext=await browser.newContext({viewport:{width:390,height:844}});await phoneContext.addInitScript(uid=>localStorage.setItem('sb-flwsglkkarikekkopdbu-auth-token',JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:4102444800,user:{id:uid}})),uid);const phone=await phoneContext.newPage();await phone.route('**/*',routeHandler);await phone.goto('http://127.0.0.1:3000/tmp/qa-mia.html');await phone.getByRole('button',{name:'Открыть чат с Мией'}).click();await phone.getByText('Старая локальная запись',{exact:true}).waitFor();assert.equal(await phone.getByText('Старая локальная запись',{exact:true}).count(),1);await phone.getByText('Задача «Уточнить решение» создана',{exact:false}).waitFor();await phone.getByRole('button',{name:'Повторить сохранение'}).click();await phone.waitForFunction(()=>![...document.querySelectorAll('button')].some(b=>b.textContent==='Повторить сохранение'));assert.equal(tables.clients.filter(c=>c.first_name==='Валерия').length,1);assert.equal(tables.tasks.filter(t=>t.title==='Перезвонить Валерии').length,1);await phone.getByRole('button',{name:'Память',exact:true}).click();assert.equal(await phone.getByLabel('Память Мии').inputValue(),'отвечай коротко');await phone.getByLabel('Память Мии').fill('Звонки после 11:00');await phone.getByRole('button',{name:'Сохранить память',exact:true}).click();await page.getByRole('button',{name:'Память',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Память Мии"]')?.value==='Звонки после 11:00');await phoneContext.close();
 await page.getByRole('button',{name:'Память',exact:true}).click();
 const field=page.getByLabel('Сообщение Мии');await field.fill('первая строка');await field.press('Shift+Enter');assert.equal(await field.inputValue(),'первая строка\n');
 await field.fill('Позвонить Марии по Дейнеки 13 ноября в 12:00');await field.press('Enter');await page.getByText('Создала задачу.',{exact:true}).waitFor();assert.equal(tables.tasks.filter(t=>t.title==='Позвонить Марии по Дейнеки').length,1)
 const countBefore=requests;await send('😁');await page.getByText('Пожалуйста 😊',{exact:true}).waitFor();assert.equal(requests,countBefore)
 await send('Александр в архиве, потому что квартира продана. Не предлагай договор.');await page.getByText('Учту причину архива.',{exact:true}).waitFor();await page.goto('http://127.0.0.1:3000/tmp/qa-mia.html');await page.getByRole('button',{name:'Открыть чат с Мией'}).click();await send('Александр подходит?');await page.getByText('Учла проданную квартиру.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Память',exact:true}).click();await page.getByRole('button',{name:'Забыть',exact:true}).waitFor();await page.getByRole('button',{name:'Забыть',exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(b=>b.textContent==='Забыть'));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,writes,requests,widths:[320,390,768,1440],retryAcrossReload:true}))
}catch(e){const page=browser.contexts()[0]?.pages()[0];console.log(errors);if(page){console.log(await page.locator('body').innerText());await page.screenshot({path:'tmp/qa-mia-failure.png'})}throw e}finally{await browser.close()}
