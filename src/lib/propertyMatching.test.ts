import assert from 'node:assert/strict'
import test from 'node:test'
import { rankPropertyBuyers, scoreBuyerRequirement } from './propertyMatching.ts'
import type { Client, Property } from '../types/index.ts'

const property = { id: 'p1', userId: 'u1', address: 'Курск, Центральный район', price: 5_000_000, rooms: 2, area: 55, floor: 4, totalFloors: 9, status: 'available', listingType: 'sale', propertyType: 'Квартира', tags: [], isFavorite: false, createdAt: '', updatedAt: '', photos: [], documents: [], notes: [] } satisfies Property
const client = { id: 'c1', userId: 'u1', type: 'buyer', firstName: 'Анна', lastName: 'Иванова', phone: '', tags: [], roles: ['buyer'], isFavorite: false, createdAt: '', updatedAt: '', photos: [], documents: [], notes: [] } satisfies Client

test('scores matching buyer criteria', () => {
  const result = scoreBuyerRequirement(property, {}, { purpose: 'sale', property_type: 'Квартира', price_max: 5_500_000, total_area_min: 50, rooms: [2], locations: ['Центральный'] })
  assert.equal(result.score, 100)
  assert.equal(result.conflicts.length, 0)
})

test('ranks and excludes requirements for another deal type', () => {
  const matches = rankPropertyBuyers(property, {}, [{ client_id: 'c1', purpose: 'rent' }, { client_id: 'c1', purpose: 'sale', price_max: 4_000_000 }], [client])
  assert.equal(matches.length, 1)
  assert.ok(matches[0].conflicts.includes('Цена вне бюджета'))
})

test('archived buyers are excluded while active buyers remain',()=>{
 const requirements=[{client_id:'c1',purpose:'sale'}]
 assert.equal(rankPropertyBuyers(property,{},requirements,[{...client,status:'archived'}]).length,0)
 assert.equal(rankPropertyBuyers(property,{},requirements,[{...client,status:'active'}]).length,1)
})
