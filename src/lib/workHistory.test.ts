import test from 'node:test'
import assert from 'node:assert/strict'
import {buildWorkHistory, filterWorkHistory, historyDate} from './workHistory.ts'
import {encodeCallEvent} from './callActivityMapping.ts'
const log={id:'call1',type:'meeting',is_completed:true,external_key:'call-log:call1',title:'Позвонить Анне',notes:encodeCallEvent({title:'Позвонить Анне',occurred_at:'2026-11-03T22:30:00Z',notes:'Обсудили документы',outcome:'Состоялся',source:null,metadata:{contact_name:'Анна',next_contact_at:'2026-11-07T09:00:00Z'}})}
test('calls use journal date in Moscow and modern representation wins without duplicating scheduled calls',()=>{
 const rows=buildWorkHistory([log,{id:'scheduled',type:'call',is_completed:true}], [{id:'call1',type:'call',status:'completed',notes:'старый формат'},{id:'call2',type:'call',status:'completed',notes:'другой реальный звонок'}],[])
 assert.equal(rows.length,2);assert.equal(rows[0].date,'2026-11-04');assert.equal(rows[0].time,'01:30');assert.equal(rows[0].notes,'Обсудили документы');assert.equal(rows[0].next,'2026-11-07T09:00:00Z')
})
test('meeting outcome and calendar entry form one record, preserving notes/reaction/date',()=>{
 const rows=buildWorkHistory([{id:'meeting',type:'meeting',title:'Показ квартиры',event_date:'2026-11-02',event_time:'10:30:00',is_completed:true,notes:'Вход со двора'}],[{id:'result',type:'meeting',status:'completed',occurred_at:'2026-11-04T10:00:00Z',outcome:'Состоялся',notes:'Нужна вторая встреча',client_id:'client',metadata:{event_id:'meeting',reaction:'Нужно обсудить'}}],[])
 assert.equal(rows.length,1);assert.equal(rows[0].title,'Показ квартиры');assert.equal(rows[0].date,'2026-11-02');assert.match(rows[0].notes,/Вход со двора/);assert.equal(rows[0].reaction,'Нужно обсудить');assert.equal(rows[0].clientId,'client')
})
test('deleted/open records excluded; old completed meetings and tasks remain visible with honest missing dates',()=>{
 const rows=buildWorkHistory([{...log,deleted_at:'now'},{id:'old',type:'meeting',is_completed:true,event_date:'2026-10-01'},{id:'future',type:'meeting',is_completed:false}],[],[{id:'done',status:'done',description:'Сделано',completed_at:'2026-11-04T10:00Z'},{id:'old-task',is_completed:true,due_date:'2026-09-01'},{id:'no-date',status:'done'},{id:'todo',status:'todo'},{id:'trash',status:'done',deleted_at:'now'}])
 assert.equal(rows.length,4);assert.equal(rows[0].kind,'task');assert.match(rows.find(r=>r.id==='task:old-task')!.dateNote!,/не сохранена/);assert.equal(rows.at(-1)!.date,'')
})
test('date, type, search filters combine; no artificial collapsing of similar real calls',()=>{
 const rows=buildWorkHistory([log,{...log,id:'call2',external_key:'call-log:call2'}],[],[])
 assert.equal(filterWorkHistory(rows,'call','2026-11-04',' АННА ').length,2);assert.equal(filterWorkHistory(rows,'meeting','','').length,0);assert.equal(filterWorkHistory(rows,'','2026-11-03','').length,0);assert.equal(filterWorkHistory(rows,'','','документы').length,2);assert.deepEqual(historyDate('invalid'),{date:'',time:''})
})
