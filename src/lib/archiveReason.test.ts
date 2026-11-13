import test from 'node:test'
import assert from 'node:assert/strict'
import {validateArchiveReason,currentArchiveReason} from './archiveReason.ts'
test('archive requires explanation and a real date when postponed',()=>{
 for(const value of [{reason:'other',note:'',resumeDate:''},{reason:'postponed',note:'',resumeDate:'2026-02-30'},{reason:'postponed',note:'',resumeDate:'2026-99-99'}])assert.throws(()=>validateArchiveReason(value as Parameters<typeof validateArchiveReason>[0]))
 assert.equal(validateArchiveReason({reason:'sold',note:'Сделка завершена',resumeDate:''}).reason,'sold')
})
test('only committed current archive reason applies; restored and older facts remain historical',()=>{
 const at='2026-11-13T10:00:00.000Z',activities=[{metadata:{kind:'archive_reason',entityId:'a',archivedAt:at,reason:'sold'}}]
 assert.equal(currentArchiveReason({id:'a',status:'archived',archived_at:at},activities),activities[0].metadata)
 assert.equal(currentArchiveReason({id:'a',status:'active',archived_at:null},activities),null)
 assert.equal(currentArchiveReason({id:'b',status:'archived',archived_at:at},activities),null)
 assert.equal(currentArchiveReason({id:'a',status:'archived',archived_at:'2026-11-12T10:00:00Z'},activities),null)
})
