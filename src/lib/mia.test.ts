import test from 'node:test'
import assert from 'node:assert/strict'
import {nextMonday,validateMiaRecord} from './mia.ts'
import type {Client,Property} from '../types/index.ts'
const clients=[{id:'buyer',type:'buyer',status:'active'},{id:'owner',type:'seller',status:'active'},{id:'archived',type:'buyer',status:'archived'}] as Client[]
const properties=[{id:'flat',status:'available'}] as Property[]
const action={type:'record',clientId:'buyer',propertyId:'flat',meeting:{date:'2026-11-05',notes:'Понравилась, думает'},task:{date:'2026-11-09',title:'Уточнить решение',notes:''}}
test('upcoming Monday handles Sunday, Monday, year boundary',()=>{assert.equal(nextMonday('2026-11-05'),'2026-11-09');assert.equal(nextMonday('2026-11-08'),'2026-11-09');assert.equal(nextMonday('2026-11-09'),'2026-11-16');assert.equal(nextMonday('2026-12-31'),'2027-01-04')})
test('showing and followup accepts owned active entities',()=>assert.equal(validateMiaRecord(action,clients,properties,'2026-11-05').task?.date,'2026-11-09'))
test('rejects invented IDs, archived buyer, owner substituted for buyer',()=>{for(const id of ['other','archived','owner'])assert.throws(()=>validateMiaRecord({...action,clientId:id},clients,properties,'2026-11-05'));assert.throws(()=>validateMiaRecord({...action,propertyId:'foreign'},clients,properties,'2026-11-05'))})
test('rejects invalid dates, future completed showing and past task',()=>{for(const date of ['2026-02-30','2026-11-06'])assert.throws(()=>validateMiaRecord({...action,meeting:{...action.meeting,date}},clients,properties,'2026-11-05'));assert.throws(()=>validateMiaRecord({...action,task:{...action.task,date:'2026-11-04'}},clients,properties,'2026-11-05'))})
