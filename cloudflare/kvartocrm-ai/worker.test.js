import {test} from 'node:test'
import assert from 'node:assert/strict'
import {handleAi,AiQuota,PROMPTS} from './worker.js'
import {validDescription} from './avito-prompt.js'
const description={strengths:['Изолированные комнаты'],titles:['Две отдельные комнаты','Квартира с балконом','Двухкомнатная квартира'],recommended:0,reason:'Проверенная планировка'}
const output={text:'Комнаты изолированы. Напишите для согласования просмотра.',warnings:[],action:null,description}
const env={DEEPSEEK_API_KEY:'fixture-secret',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_URL:'https://fixture.supabase.co',AI_ALLOWED_EMAILS:'owner@example.test',QUOTA:{idFromName:n=>n,get:()=>({fetch:async()=>new Response('',{status:200})})}}
const req=(body={mode:'note',context:'Позвонить завтра'},headers={},method='POST')=>new Request('https://ai.test/generate',{method,headers:{origin:'https://kvartocrm.github.io',authorization:'Bearer fixture','Content-Type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})})
const provider=async url=>String(url).includes('/auth/')?Response.json({id:'u',email:'owner@example.test',email_confirmed_at:'2026-01-01'}):Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}],usage:{total_tokens:50}})
test('authentication and origin reject without spending',async()=>{let calls=0;const f=async()=>{calls++;return provider('')};assert.equal((await handleAi(req(undefined,{authorization:''}),env,f)).status,401);assert.equal((await handleAi(req(undefined,{origin:'https://evil.test'}),env,f)).status,403);assert.equal(calls,0)})
test('verified account required',async()=>{assert.equal((await handleAi(req(),env,async()=>Response.json({id:'u',email:'other@test',email_confirmed_at:'yes'}))).status,403)})
test('daily quota is not used by generation',async()=>{let calls=0;const e={...env,QUOTA:{idFromName:()=>{throw Error('Quota must not be called')}}};for(let i=0;i<105;i++)assert.equal((await handleAi(req(),e,async u=>{calls++;return provider(u)})).status,200);assert.equal(calls,210)})
test('description uses structured validated titles and accepts selected photo',async()=>{const r=await handleAi(req({mode:'description',context:'Две комнаты',images:['data:image/jpeg;base64,YQ==']}),env,provider);assert.equal(r.status,200);assert.deepEqual((await r.json()).description,description);assert(validDescription(description));assert(!validDescription({...description,titles:['x'.repeat(31),'Б','В']}));assert(!validDescription({...description,titles:['А','А','Б']}));assert(PROMPTS.description.includes('НЕТ браузинга'))})
test('untrusted mode and external image URLs rejected before auth',async()=>{const f=()=>{throw new Error('must not call')};assert.equal((await handleAi(req({mode:'__proto__',context:'x'}),env,f)).status,400);assert.equal((await handleAi(req({mode:'report',context:'x',images:['https://internal/secret']}),env,f)).status,400)})
test('oversized streaming body rejected',async()=>{assert.equal((await handleAi(req({mode:'note',context:'x'.repeat(3000001)}),env,provider)).status,413)})
test('provider errors and malformed JSON do not reveal credentials',async()=>{for(const response of [new Response('fixture-secret',{status:500}),Response.json({choices:[{finish_reason:'length',message:{content:'{bad'}}]})]){const r=await handleAi(req(),env,async u=>String(u).includes('/auth/')?provider(u):response);assert.equal(r.status,502);assert(!(await r.text()).includes('fixture-secret'))}})
test('daily quota is transactional and stops at twenty',async()=>{let saved;const storage={get:async()=>saved,put:async(k,v)=>{saved=structuredClone(v)}};const quota=new AiQuota({storage:{transaction:fn=>fn(storage)}});for(let i=0;i<21;i++){const r=await quota.fetch(new Request('https://quota',{method:'POST',body:JSON.stringify({user:'u'})}));assert.equal(r.status,i<20?200:429)}})

test('Cloudflare-compatible manual redirects never forward provider credentials',async()=>{let seen=0;const r=await handleAi(req(),env,async(url,options)=>{assert.equal(options.redirect,'manual');seen++;if(String(url).includes('/auth/'))return provider(url);return new Response('',{status:302,headers:{Location:'https://untrusted.test'}})});assert.equal(r.status,502);assert.equal(seen,2)})

test('cloud route derives account from verified token, never body tenant, and uses no provider quota',async()=>{let account,quota=0;const e={...env,QUOTA:{idFromName:()=>{quota++;throw Error('quota must not be used')}},MIA:{idFromName:n=>{account=n;return n},get:()=>({fetch:async()=>Response.json({messages:[]})})}};const request=new Request('https://ai.test/mia-cloud',{method:'POST',headers:{origin:'https://kvartocrm.github.io',authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({op:'read',userId:'victim'})});const response=await handleAi(request,e,provider);assert.equal(response.status,200);assert.equal(account,'u');assert.equal(quota,0)})


test('new verified accounts enabled explicitly; unconfirmed accounts still rejected',async()=>{
 const e={...env,AI_ALL_VERIFIED_USERS:'true'}
 const f=async url=>String(url).includes('/auth/')?Response.json({id:'new-user',email:'new@example.test',email_confirmed_at:'2026-01-01'}):provider(url)
 assert.equal((await handleAi(req(),e,f)).status,200)
 assert.equal((await handleAi(req(),e,async()=>Response.json({id:'new-user',email:'new@example.test'}))).status,403)
})

test('transcription authenticates before invoking hosted speech model and accepts no remote URLs',async()=>{
 let calls=0;const e={...env,DEEPSEEK_API_KEY:undefined,AI:{run:async(model,input)=>{calls++;assert.equal(model,'@cf/openai/whisper-large-v3-turbo');assert.equal(input.language,'ru');assert.equal(input.vad_filter,true);return {text:'Позвонить Анне в понедельник.'}}}};
 const make=(audio='YQ=='.repeat(20),authorization='Bearer fixture')=>new Request('https://ai.test/transcribe',{method:'POST',headers:{authorization,origin:'https://kvartocrm.github.io'},body:JSON.stringify({audio})});
 assert.equal((await handleAi(make('https://internal/audio'),e,provider)).status,400);
 assert.equal((await handleAi(make('YWFh'.repeat(20),''),e,provider)).status,401);assert.equal(calls,0);
 const result=await handleAi(make('YWFh'.repeat(20)),e,provider);assert.equal(result.status,200);assert.equal((await result.json()).text,'Позвонить Анне в понедельник.');assert.equal(calls,1);
 assert.equal((await handleAi(make('YWFh'.repeat(20)),{...e,AI:{run:async()=>({text:''})}},provider)).status,422);
 const failure=await handleAi(make('YWFh'.repeat(20)),{...e,AI:{run:async()=>{throw Error('provider secret')}}},provider);assert.equal(failure.status,503);assert(!(await failure.text()).includes('provider secret'));
})
