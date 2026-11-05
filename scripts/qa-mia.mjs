import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const {chromium}=await import('../docs/design/update-concept-2026-10-28/.build/node_modules/playwright/index.mjs')
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',buyer='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',property='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
await fs.writeFile('tmp/qa-mia.html','<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tmp/qa-mia.tsx"></script>')
await fs.writeFile('tmp/qa-mia.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{QueryClientProvider}from'@tanstack/react-query';import{queryClient}from'/src/lib/queryClient';import MiaChat from'/src/components/MiaChat';import'/src/index.css';document.documentElement.dataset.theme='midnight';createRoot(document.getElementById('root')).render(<BrowserRouter><QueryClientProvider client={queryClient}><MiaChat/></QueryClientProvider></BrowserRouter>)`)
const tables={clients:[{id:buyer,user_id:uid,type:'buyer',first_name:'Анна',status:'active'}],properties:[{id:property,user_id:uid,address:'Ленина, 10',status:'available'}],crm_activities:[],tasks:[]}
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];let requests=0,failTask=true,writes=0
try{
 const page=await browser.newPage({viewport:{width:390,height:844}})
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(({uid})=>localStorage.setItem('sb-flwsglkkarikekkopdbu-auth-token',JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:uid}})),{uid})
 await page.route('**/*',async route=>{
 const u=new URL(route.request().url()),method=route.request().method()
 if(u.pathname==='/src/context/AuthContext.tsx')return route.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({user:{id:'${uid}',firstName:'Денис'}})`})
 if(u.hostname==='kvartocrm-ai.denzotrail.workers.dev'){
 if(method==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type'}})
 requests++;const body=route.request().postDataJSON();const context=JSON.parse(body.context)
 return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{text:'Подготовила запись.',warnings:[],action:null,mia:requests===1?null:requests===2?{type:'record',clientId:buyer,propertyId:property,meeting:{date:context.today,notes:'Понравилась, думает'},task:{date:context.nextMonday,title:'Уточнить решение',notes:'После показа'}}:{type:'navigate',page:'reports'}}})
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
 })
 await page.goto('http://127.0.0.1:3000/tmp/qa-mia.html')
 await page.getByRole('button',{name:'Мия · помощница'}).click()
 await page.getByText('Здравствуйте, Денис!',{exact:false}).waitFor()
 const send=async text=>{await page.getByLabel('Сообщение Мии').fill(text);await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click()}
 await send('Провёл показ.');await page.getByText('Подготовила запись.',{exact:true}).waitFor();assert.equal(writes,0)
 await send('Анна смотрела Ленина, 10. Понравилась, думает. Позвонить в ближайший понедельник.')
 await page.getByRole('button',{name:'Повторить сохранение'}).waitFor();assert.equal(tables.crm_activities.length,1);assert.equal(tables.tasks.length,0)
 await page.reload();await page.getByRole('button',{name:'Мия · помощница'}).click();await page.getByRole('button',{name:'Повторить сохранение'}).click()
 await page.getByText('Задача «Уточнить решение» создана',{exact:false}).waitFor();assert.equal(tables.crm_activities.length,1);assert.equal(tables.tasks.length,1)
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Изменить размер чата'}).click();const panel=page.getByRole('region',{name:'Чат с Мией'});assert(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth));await page.screenshot({path:`tmp/qa-mia-${width}.png`})}
 await page.getByRole('button',{name:'Закрыть чат'}).click();await page.getByRole('button',{name:'Мия · помощница'}).click();assert(await page.getByRole('log').evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight<3))
 await send('Открой отчёты собственникам');await page.getByRole('dialog',{name:'Отчёты собственникам'}).waitFor()
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,writes,requests,widths:[320,390,768,1440],retryAcrossReload:true}))
}catch(e){const page=browser.contexts()[0]?.pages()[0];console.log(errors);if(page){console.log(await page.locator('body').innerText());await page.screenshot({path:'tmp/qa-mia-failure.png'})}throw e}finally{await browser.close()}
