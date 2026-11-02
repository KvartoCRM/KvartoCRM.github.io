// Start Vite first. Set PLAYWRIGHT_MODULE to an installed Playwright module if needed.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '../docs/design/update-concept-2026-10-28/.build/node_modules/playwright/index.mjs')
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3000'
await fs.mkdir('tmp', { recursive: true })
await fs.writeFile('tmp/qa-close.html', '<div id="root"></div><script type="module" src="/tmp/qa-close.tsx"></script>')
await fs.writeFile('tmp/qa-close.tsx', `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{QueryClientProvider}from'@tanstack/react-query';import{queryClient}from'/src/lib/queryClient';import QuickCallComposer from'/src/components/QuickCallComposer';import NewEventForm from'/src/components/NewEventForm';import'/src/index.css';function App(){const[open,setOpen]=useState('');return <><button onClick={()=>setOpen('call')}>Открыть звонок</button><button onClick={()=>setOpen('event')}>Открыть встречу</button>{open==='call'&&<QuickCallComposer onClose={()=>setOpen('')}/>}<NewEventForm isOpen={open==='event'} onClose={()=>setOpen('')}/></>}document.documentElement.dataset.theme='midnight';createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><App/></QueryClientProvider>);`)
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const page=await browser.newPage();let writes=0;const errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.pathname==='/src/context/AuthContext.tsx')return route.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'qa@example.test'}});`})
  if(u.pathname.includes('/rest/v1/')){if(route.request().method()!=='GET')writes++;return route.fulfill({json:[]})}
  if(u.origin===base)return route.continue();return route.abort()
 })
 for(const width of [390,1440]) {
  await page.setViewportSize({width,height:900});await page.goto(base+'/tmp/qa-close.html')
  for(const way of ['cross','button','escape']){
   await page.getByRole('button',{name:'Открыть звонок',exact:true}).click()
   await page.getByLabel('Что обсудили').fill('Черновик '+width+' '+way)
   if(way==='cross')await page.getByRole('button',{name:'Закрыть окно',exact:true}).click()
   else if(way==='button')await page.getByRole('button',{name:'Закрыть',exact:true}).click()
   else await page.keyboard.press('Escape')
   await page.getByRole('dialog').waitFor({state:'hidden'})
   await page.reload();await page.getByRole('button',{name:'Открыть звонок',exact:true}).click()
   assert.equal(await page.getByLabel('Что обсудили').inputValue(),'Черновик '+width+' '+way)
   await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})
  }
  await page.getByRole('button',{name:'Открыть встречу',exact:true}).click();await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})
 }
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError')}})
 await page.getByRole('button',{name:'Открыть звонок',exact:true}).click();await page.getByLabel('Что обсудили').fill('Недоступное хранилище')
 await page.getByRole('button',{name:'Закрыть',exact:true}).click()
 const warning=page.getByRole('dialog',{name:'Черновик не сохранён на устройстве'})
 await warning.waitFor();await page.screenshot({path:'tmp/qa-close-storage-warning.png'})
 await page.keyboard.press('Escape');await warning.waitFor({state:'hidden'});assert.equal(await page.getByLabel('Что обсудили').inputValue(),'Недоступное хранилище')
 await page.getByRole('button',{name:'Закрыть',exact:true}).click();await page.getByRole('button',{name:'Всё равно закрыть',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})
 assert.equal(writes,0);assert.deepEqual(errors,[])
 console.log('PASS: cross, Close, Escape, restored drafts after reload, meeting close, visible storage warning; 390/1440px; zero API writes, zero page errors')
} finally {await browser.close()}
