import test from 'node:test'
import assert from 'node:assert/strict'
import {quickCallRows,quickCallError,validQuickDraft,type QuickCallDraft} from './quickCall.ts'
import {recurrenceId} from './recurrenceIdentity.ts'
import {relativeFilters} from './relativeFilters.ts'
import {accountKey,parseAccountValue,writeAccountValue,readAccountValue,clearAccountDrafts} from './accountStorage.ts'

const draft:QuickCallDraft={id:'11111111-1111-4111-8111-111111111111',nextId:'22222222-2222-4222-8222-222222222222',updatedAt:Date.now(),clientId:'client-1',name:'Анна',phone:'',status:'Перезвонить',notes:'После работы',date:'2026-10-29',time:'12:00',type:'warm',schedule:true,nextDate:'2026-10-30',nextTime:'18:30'}
test('call and follow-up share one batch, preserve client and local dates',()=>{
 const rows=quickCallRows('user-1',draft,'buyer')
 assert.equal(rows.length,2);assert.equal(rows[0].is_completed,true);assert.equal(rows[1].is_completed,false)
 assert.equal(rows[0].event_date,'2026-10-29');assert.equal(rows[1].event_time,'18:30')
 assert.equal(rows[1].related_client_id,'client-1');assert.equal(rows[1].related_client_type,'buyer')
 const payload=JSON.parse(String(rows[0].notes).split('kvartocrm-call-v1:')[1]);assert.equal(payload.metadata.client_id,'client-1');assert.equal(payload.metadata.next_contact_at,'2026-10-30T18:30')
 assert.deepEqual(rows,quickCallRows('user-1',draft,'buyer'))
})
test('ordinary call produces no hidden future event',()=>assert.equal(quickCallRows('u',{...draft,schedule:false,status:'Состоялся'}).length,1))
test('callback requires a future date and time',()=>{
 const now=new Date('2026-10-29T13:00');assert.equal(quickCallError(draft,now),'')
 for(const patch of [{schedule:false},{nextDate:''},{nextTime:''},{nextDate:'2026-10-28'},{name:' ',phone:' '}])assert.notEqual(quickCallError({...draft,...patch},now),'')
})
test('draft validates structure and expires after seven days',()=>{
 assert.equal(validQuickDraft(draft),true);assert.equal(validQuickDraft({...draft,updatedAt:Date.now()-8*86400000}),false)
 assert.equal(validQuickDraft({...draft,id:'bad'}),false);assert.equal(validQuickDraft({...draft,nextTime:null}),false)
})
test('each task occurrence has one stable successor across retries and accounts',async()=>{
 const id=await recurrenceId('a','task-1');assert.equal(id,await recurrenceId('a','task-1'))
 assert.notEqual(id,await recurrenceId('a','task-2'));assert.notEqual(id,await recurrenceId('b','task-1'))
 assert.match(id,/^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
})
test('relative saved view advances through month boundaries and weeks start Monday',()=>{
 assert.equal(relativeFilters({period:'today',from:'2000-01-01'},new Date(2026,10,1)).from,'2026-11-01')
 assert.deepEqual(relativeFilters({period:'week'},new Date(2026,10,1)),{period:'week',from:'2026-10-26',to:'2026-11-01'})
 assert.deepEqual(relativeFilters({period:'next7'},new Date(2026,11,29)),{period:'next7',from:'2026-12-29',to:'2027-01-04'})
})
test('account storage isolates users and clears only that account drafts',()=>{
 const a=accountKey('a','draft:quick'),b=accountKey('b','draft:quick'),view=accountKey('a','views:calls')
 writeAccountValue(a,'a');writeAccountValue(b,'b');writeAccountValue(view,'view');clearAccountDrafts('a')
 assert.equal(readAccountValue(a),null);assert.equal(readAccountValue(b),'b');assert.equal(readAccountValue(view),'view')
 assert.deepEqual(parseAccountValue('broken',{}),{});assert.deepEqual(parseAccountValue('[]',{}),{})
})
