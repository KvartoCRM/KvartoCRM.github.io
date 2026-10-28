import type { Event } from '../types/index.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { filterCalls, filterMeetings, inDateRange, inNumberRange, matchesText, sortRecords } from './listFiltering.ts'
import type { WorkCall } from './callActivityMapping.ts'

test('search matches Russian spelling, unordered words and formatted phones', () => {
  assert.ok(matchesText('петр квартира', ['Квартира', 'Пётр']))
  assert.ok(matchesText('+7 (900) 123', ['+79001234567']))
  assert.ok(!matchesText('Анна', ['Пётр']))
})
test('date boundaries include the whole local day and exclude missing dates only when filtered', () => {
  assert.ok(inDateRange(new Date(2026, 9, 27, 23, 59).toISOString(), '2026-10-27', '2026-10-27'))
  assert.ok(!inDateRange(new Date(2026, 9, 28, 0, 0).toISOString(), '', '2026-10-27'))
  assert.ok(inDateRange(null))
  assert.ok(!inDateRange(null, '2026-10-27'))
  assert.ok(!inDateRange('invalid', '2026-10-27'))
  assert.ok(!inDateRange('2026-10-27', '2026-10-28', '2026-10-26'))
})
test('numeric bounds distinguish missing prices from zero', () => {
  assert.ok(inNumberRange(0, '0', '10'))
  assert.ok(!inNumberRange(null, '0', '10'))
  assert.ok(inNumberRange(null))
  assert.ok(!inNumberRange(100, '200', '50'))
})
test('sorting uses numeric and Russian order, preserves ties and keeps missing values last in both directions', () => {
  const rows = [{v:10,id:1},{v:null,id:2},{v:2,id:3},{v:10,id:4}]
  assert.deepEqual(sortRecords(rows, x=>x.v, 'asc').map(x=>x.id), [3,1,4,2])
  assert.deepEqual(sortRecords(rows, x=>x.v, 'desc').map(x=>x.id), [1,4,3,2])
  assert.deepEqual(sortRecords(['Объект 10','Объект 2','Анна'], x=>x, 'asc'), ['Анна','Объект 2','Объект 10'])
  assert.deepEqual(rows.map(x=>x.id), [1,2,3,4])
})
test('call filters intersect date, local time, name, type, result and source', () => {
  const call = (id:string, hour:number, name:string): WorkCall => ({id,title:name,occurred_at:new Date(2026,9,27,hour).toISOString(),source:'Авито',outcome:'Состоялся',notes:null,metadata:{contact_name:name,call_type:'warm',status:'Состоялся'}})
  const calls = [call('1',9,'Анна'),call('2',15,'Анна'),call('3',15,'Борис')]
  const filters = {from:'2026-10-27',to:'2026-10-27',timeFrom:'10:00',timeTo:'16:00',result:'Состоялся',source:'Авито'}
  assert.deepEqual(filterCalls(calls,filters,'Анна','warm').map(x=>x.id), ['2'])
  assert.equal(filterCalls(calls,filters,'Анна','cold').length,0)
  assert.equal(filterCalls(calls,{...filters,timeFrom:'17:00'}).length,0)
  assert.equal(filterCalls(calls,{}).length,3)
  assert.deepEqual(filterCalls(calls,{sort:'name',direction:'desc'}).map(x=>x.id), ['3','1','2'])
})

test('meeting filters combine local dates, time, text and completion status', () => {
  const base: Event = {id:'a',type:'meeting',title:'Показ квартиры',eventDate:'2026-10-28',eventTime:'10:30:00',location:'Центр',isCompleted:false,isFavorite:false,createdAt:'2026-10-20T10:00:00Z'}
  const rows = [base,{...base,id:'b',eventDate:'2026-10-29',isCompleted:true},{...base,id:'c',eventTime:undefined}]
  assert.deepEqual(filterMeetings(rows,{from:'2026-10-28',to:'2026-10-28',timeFrom:'10:30',timeTo:'10:30',query:'квартиры центр',status:'planned'}).map(x=>x.id),['a'])
  assert.deepEqual(filterMeetings(rows,{status:'completed'}).map(x=>x.id),['b'])
  assert.equal(filterMeetings(rows,{}).length,3)
  assert.equal(filterMeetings(rows,{from:'2026-10-30',to:'2026-10-28'}).length,0)
  assert.equal(filterMeetings(rows,{direction:'desc'})[0].id,'b')
})
