import {test} from 'node:test'
import assert from 'node:assert/strict'
import {MiaAccount} from './mia-account.js'
function account(){const rows=new Map();const storage={delete:async k=>rows.delete(k),get:async k=>rows.get(k),put:async(k,v)=>rows.set(k,structuredClone(v)),list:async({prefix,end,limit})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)&&k<end).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,limit)),transaction:async cb=>cb(storage)};const object=new MiaAccount({storage});return async body=>{const r=await object.fetch(new Request('https://account',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,data:await r.json()}}}
test('account journal survives device reads, retries do not duplicate, accounts isolated',async()=>{const a=account(),b=account();await a({op:'append',id:'one',role:'user',text:'Привет'});await a({op:'append',id:'one',role:'user',text:'Привет'});assert.equal((await a({op:'read'})).data.messages.length,1);assert.equal((await b({op:'read'})).data.messages.length,0);assert.equal((await a({op:'append',id:'one',role:'user',text:'другая'})).status,409)})
test('memory refuses stale device writes',async()=>{const a=account();await a({op:'memory',revision:0,preferences:'кратко',memoryEnabled:true});assert.equal((await a({op:'memory',revision:0,preferences:'потерять',memoryEnabled:false})).status,409);assert.equal((await a({op:'read'})).data.preferences,'кратко')})
test('device lease protects shared pending work and can be released',async()=>{const a=account();await a({op:'claim',token:'pc'});assert.equal((await a({op:'claim',token:'phone'})).status,409);assert.equal((await a({op:'pending',token:'phone',value:{id:'bad'}})).status,409);await a({op:'pending',token:'pc',value:{id:'stable'}});await a({op:'release',token:'pc'});await a({op:'claim',token:'phone'});assert.equal((await a({op:'read'})).data.pending.id,'stable')})
test('older messages can be paged without loss',async()=>{const a=account();for(let i=0;i<105;i++)await a({op:'append',id:String(i),role:'user',text:String(i)});const latest=(await a({op:'read'})).data;assert.equal(latest.messages.length,100);assert(latest.hasOlder);const older=(await a({op:'read',before:latest.messages[0].sequence})).data;assert.equal(older.messages.length,5);assert.equal(older.messages[0].sequence,1)})

test('completion receipt and pending clear are atomic and retryable',async()=>{const a=account();await a({op:'claim',token:'pc'});await a({op:'pending',token:'pc',value:{id:'job'}});const finish={op:'finish',token:'pc',planId:'job',id:'job-done',text:'Сохранено'};assert.equal((await a(finish)).status,200);assert.equal((await a(finish)).status,200);const state=(await a({op:'read'})).data;assert.equal(state.pending,null);assert.equal(state.messages.length,1)})

test('learned facts require own user message and persist across devices, can be forgotten',async()=>{
 const a=account(),b=account();await a({op:'append',id:'fact-source',role:'user',text:'Александр в архиве, потому что квартира продана. Не предлагать договор.'});await a({op:'append',id:'assistant-guess',role:'assistant',text:'Догадка'})
 assert.equal((await a({op:'remember',messageId:'assistant-guess'})).status,400)
 assert.equal((await a({op:'remember',messageId:'fact-source'})).status,200)
 assert.equal((await a({op:'remember',messageId:'fact-source'})).status,200)
 assert.equal((await a({op:'read'})).data.facts.length,1);assert.equal((await b({op:'read'})).data.facts.length,0)
 await a({op:'forget',id:'fact-source'});assert.equal((await a({op:'read'})).data.facts.length,0)
 await a({op:'memory',revision:0,preferences:'',memoryEnabled:false});assert.equal((await a({op:'remember',messageId:'fact-source'})).status,409)
})

test('facts can be retired across devices and retries cannot reactivate them',async()=>{
 const a=account();await a({op:'append',id:'source',role:'user',text:'Квартира продана'});await a({op:'remember',messageId:'source',references:[{entity:'contact',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}]});await a({op:'retire',id:'source',retired:true});await a({op:'remember',messageId:'source'});const fact=(await a({op:'read'})).data.facts[0];assert.equal(fact.retired,true);assert.equal(fact.references[0].entity,'contact');await a({op:'retire',id:'source',retired:false});assert.equal((await a({op:'read'})).data.facts[0].retired,false)
})
