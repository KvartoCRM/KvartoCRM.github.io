import type { Client, Property } from '../types'

export type BuyerMatch = {
  client: Client
  score: number
  matched: string[]
  conflicts: string[]
}

type Requirement = Record<string, unknown>
type PropertyDetails = Record<string, unknown>

const numberValue = (value: unknown) => value === null || value === undefined || value === '' ? undefined : Number(value)
const strings = (value: unknown) => Array.isArray(value) ? value.map(String).filter(Boolean) : []

export const scoreBuyerRequirement = (property: Property, details: PropertyDetails, requirement: Requirement) => {
  const matched: string[] = []
  const conflicts: string[] = []
  let checked = 0
  const check = (condition: boolean, success: string, failure: string) => {
    checked += 1
    if (condition) matched.push(success)
    else conflicts.push(failure)
  }

  const purpose = requirement.purpose === 'rent' ? 'rent' : 'sale'
  check((property.listingType || 'sale') === purpose, purpose === 'rent' ? 'Подходит аренда' : 'Подходит покупка', 'Другой тип сделки')
  const propertyType = String(requirement.property_type || '').trim().toLocaleLowerCase('ru-RU')
  if (propertyType) check(String(property.propertyType || '').toLocaleLowerCase('ru-RU').includes(propertyType) || propertyType.includes(String(property.propertyType || '').toLocaleLowerCase('ru-RU')), 'Подходит тип объекта', 'Не совпадает тип объекта')
  const price = numberValue(property.price)
  const priceMin = numberValue(requirement.price_min)
  const priceMax = numberValue(requirement.price_max)
  if (price !== undefined && (priceMin !== undefined || priceMax !== undefined)) check((priceMin === undefined || price >= priceMin) && (priceMax === undefined || price <= priceMax), 'Цена в бюджете', 'Цена вне бюджета')
  const area = numberValue(property.area)
  const areaMin = numberValue(requirement.total_area_min)
  const areaMax = numberValue(requirement.total_area_max)
  if (area !== undefined && (areaMin !== undefined || areaMax !== undefined)) check((areaMin === undefined || area >= areaMin) && (areaMax === undefined || area <= areaMax), 'Подходит площадь', 'Не совпадает площадь')
  const rooms = strings(requirement.rooms).map(Number).filter(Number.isFinite)
  if (rooms.length && property.rooms != null) check(rooms.includes(Number(property.rooms)), 'Подходит количество комнат', 'Не совпадает количество комнат')
  const floorMin = numberValue(requirement.floor_min)
  const floorMax = numberValue(requirement.floor_max)
  if (property.floor != null && (floorMin !== undefined || floorMax !== undefined)) check((floorMin === undefined || property.floor >= floorMin) && (floorMax === undefined || property.floor <= floorMax), 'Подходит этаж', 'Не совпадает этаж')
  const locations = strings(requirement.locations).map(value => value.toLocaleLowerCase('ru-RU'))
  if (locations.length) {
    const address = property.address.toLocaleLowerCase('ru-RU')
    check(locations.some(location => address.includes(location) || location.includes(address)), 'Подходит район', 'Не совпадает район')
  }
  const objectCriteria = requirement.object_criteria && typeof requirement.object_criteria === 'object' ? requirement.object_criteria as Requirement : {}
  const repair = String(objectCriteria.repair || '').trim().toLocaleLowerCase('ru-RU')
  if (repair) check(String(property.repair || details.renovation || '').toLocaleLowerCase('ru-RU').includes(repair), 'Подходит ремонт', 'Не совпадает ремонт')

  return { score: checked ? Math.round(matched.length / checked * 100) : 50, matched, conflicts }
}

export const rankPropertyBuyers = (property: Property, details: PropertyDetails, requirements: Requirement[], clients: Client[]): BuyerMatch[] => {
  const clientById = new Map(clients.map(client => [client.id, client]))
  return requirements.flatMap(requirement => {
    const client = clientById.get(String(requirement.client_id))
    if (!client || ['archived','closed','inactive'].includes(client.status || '')) return []
    const result = scoreBuyerRequirement(property, details, requirement)
    if (result.conflicts.includes('Другой тип сделки')) return []
    return [{ client, ...result }]
  }).sort((left, right) => right.score - left.score || left.client.lastName.localeCompare(right.client.lastName, 'ru'))
}
