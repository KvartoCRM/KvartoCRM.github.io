import test from 'node:test'
import assert from 'node:assert/strict'
import { zonedInstant, calendarParts, conflictsFor, nextFreeTime, weekDates } from './scheduling.ts'
import { buildFullArchive, readFullArchive } from './fullArchive.ts'
import { parseWorkspaceBackup } from './workspaceBackupFormat.ts'
import type { Event } from '../types'

test('calendar instant is independent of device timezone and rejects DST gaps',()=>{
  const value=zonedInstant('2026-10-30','10:30','Europe/Moscow')
  assert.equal(value.toISOString(),'2026-10-30T07:30:00.000Z')
  assert.deepEqual(calendarParts(value,'Asia/Yekaterinburg'),{date:'2026-10-30',time:'12:30'})
  assert.throws(()=>zonedInstant('2026-03-29','02:30','Europe/Berlin'))
  assert.equal(weekDates('2026-11-01')[0],'2026-10-26')
})
test('overlaps include midnight and exclude adjacent slots or completed events',()=>{
  const a={id:'a',eventDate:'2026-10-30',eventTime:'23:30',timeZone:'Europe/Moscow',durationMinutes:120,type:'meeting',isCompleted:false} as Event
  const start=zonedInstant('2026-10-31','00:15')
  assert.equal(conflictsFor([a],start,30).length,1)
  assert.equal(calendarParts(nextFreeTime([a],start,30)).time,'01:30')
  assert.equal(conflictsFor([a],zonedInstant('2026-10-31','01:30'),30).length,0)
  assert.equal(conflictsFor([{...a,isCompleted:true}],start,30).length,0)
})
const id='10000000-0000-4000-8000-000000000001'
const backup=()=>parseWorkspaceBackup({format:'kvartocrm-workspace-backup',version:1,exportedAt:'2026-10-30T00:00:00Z',sourceUserId:id,tables:{crm_files:[{id,name:'Фото',bucket:'crm-images',storage_path:id+'/photo.jpg'}]},fileUrls:{[id]:'https://expired.invalid/file'}})
test('full archive retains actual bytes without signed URLs',async()=>{
  const bytes=new Uint8Array([0,255,100,1,2]);const blob=await buildFullArchive(backup(),new Map([[id,new Blob([bytes])]]));const result=await readFullArchive(blob)
  assert.deepEqual(new Uint8Array(await result.files.get(id)!.arrayBuffer()),bytes)
  assert.deepEqual(result.backup.fileUrls,{})
})
test('full archive rejects missing content, tampering and truncated archives',async()=>{
  await assert.rejects(()=>buildFullArchive(backup(),new Map()))
  const archive=await buildFullArchive(backup(),new Map([[id,new Blob(['original'])]]))
  const bytes=new Uint8Array(await archive.arrayBuffer());const needle=new TextEncoder().encode('original');const offset=bytes.findIndex((_,i)=>needle.every((value,j)=>bytes[i+j]===value));bytes[offset]=88
  await assert.rejects(()=>readFullArchive(new Blob([bytes])),/Контрольная сумма/)
  await assert.rejects(()=>readFullArchive(archive.slice(0,800)))
})
