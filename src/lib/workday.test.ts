import {test} from 'node:test'
import assert from 'node:assert/strict'
import {reportPeriod,contactAttention} from './workday.ts'
import {sameTaskPayload} from './taskRetry.ts'
import type {Client,Event} from '../types/index.ts'
test('Thursday interval does not overlap the next report, including month boundaries',()=>{assert.deepEqual(reportPeriod('2026-11-05'),{start:'2026-10-29',end:'2026-11-05'});assert.deepEqual(reportPeriod('2026-11-08'),{start:'2026-10-29',end:'2026-11-05'})})
test('attention excludes cold leads and future planned contacts, includes overdue',()=>{const clients=[{id:'a',lastContactDate:'2026-10-01'},{id:'b',lastContactDate:'2026-10-01',leadTemperature:'cold'},{id:'c',lastContactDate:'2026-10-01'}] as Client[];const events=[{relatedClientId:'c',eventDate:'2026-11-06',isCompleted:false}] as Event[];assert.deepEqual(contactAttention(clients,[],events,[],'2026-11-05').map(r=>r.client.id),['a']);events[0].eventDate='2026-11-04';assert.equal(contactAttention(clients,[],events,[],'2026-11-05').length,2)})
test('uncertain task retry accepts equivalent JSON and time but not changed or deleted records',()=>{const payload={title:'Звонок',due_time:'10:00',smart_criteria:{clientId:'a',propertyId:'b'}};assert(sameTaskPayload({...payload,due_time:'10:00:00',smart_criteria:{propertyId:'b',clientId:'a'}},payload));assert(!sameTaskPayload({...payload,title:'Другая задача'},payload));assert(!sameTaskPayload({...payload,deleted_at:'2026-11-05'},payload))})
