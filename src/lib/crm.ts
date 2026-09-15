import { supabase } from './supabase'
import { fetchAllRows } from './pagination'
import { indexDealFinance } from './dealFinance'
import { inferContactRoles } from './contactRoles'
import { countContactsByRole, isActiveDealRow } from './crmOverview'

export type OverviewTask = {
  id: string
  title: string
  dueDate?: string
  dueTime?: string
  priority: 'low' | 'medium' | 'high'
  status: 'todo' | 'inprogress' | 'done'
  isCompleted: boolean
}

export type OverviewEvent = {
  id: string
  type: 'meeting' | 'call'
  title: string
  eventDate: string
  eventTime?: string
  location?: string
  isCompleted: boolean
}

export type OverviewProperty = {
  id: string
  address: string
  price?: number
  status: string
}

export type CrmOverview = {
  owners: number
  buyers: number
  properties: number
  activeDeals: number
  completedToday: number
  tasks: OverviewTask[]
  events: OverviewEvent[]
  recentProperties: OverviewProperty[]
  analytics: {
    months: AnalyticsPoint[]
    periods: Record<'days' | 'weeks' | 'months', AnalyticsPoint[]>
    propertyTypes: Array<{ name: string; value: number }>
    totalDealVolume: number
    totalAgencyIncome: number
    totalAgentIncome: number
  }
}

export type AnalyticsPoint = {
  key: string
  label: string
  sellers: number
  buyers: number
  landlords: number
  tenants: number
  saleProperties: number
  rentProperties: number
  mortgageLeads: number
  dealVolume: number
}

const emptyPoint = (key: string, label: string): AnalyticsPoint => ({ key, label, sellers: 0, buyers: 0, landlords: 0, tenants: 0, saleProperties: 0, rentProperties: 0, mortgageLeads: 0, dealVolume: 0 })

const mondayOf = (date: Date) => {
  const result = new Date(date)
  const day = result.getDay() || 7
  result.setDate(result.getDate() - day + 1)
  result.setHours(0, 0, 0, 0)
  return result
}

const localDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const makePeriods = () => {
  const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'short', year: '2-digit' })
  const shortFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' })
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - (11 - index))
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return emptyPoint(key, monthFormatter.format(date).replace('.', ''))
  })
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (29 - index))
    return emptyPoint(date.toISOString().slice(0, 10), shortFormatter.format(date).replace('.', ''))
  })
  const currentMonday = mondayOf(new Date())
  const weeks = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(currentMonday)
    date.setDate(date.getDate() - (11 - index) * 7)
    return emptyPoint(date.toISOString().slice(0, 10), shortFormatter.format(date).replace('.', ''))
  })
  return { days, weeks, months }
}

const emptyOverview: CrmOverview = {
  owners: 0,
  buyers: 0,
  properties: 0,
  activeDeals: 0,
  completedToday: 0,
  tasks: [],
  events: [],
  recentProperties: [],
  analytics: { months: makePeriods().months, periods: makePeriods(), propertyTypes: [], totalDealVolume: 0, totalAgencyIncome: 0, totalAgentIncome: 0 },
}

export async function getCrmOverview(userId: string): Promise<CrmOverview> {
  const [clients, properties, tasks, events, deals, financeActivities] = await Promise.all([
    fetchAllRows(() => supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })),
    fetchAllRows(() => supabase
      .from('properties')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })),
    fetchAllRows(() => supabase
      .from('tasks')
      .select('id,title,due_date,due_time,priority,status,is_completed,completed_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })),
    supabase
      .from('events')
      .select('id,type,title,event_date,event_time,location,is_completed')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .eq('is_completed', false)
      .order('event_date', { ascending: true })
      .limit(8),
    fetchAllRows(() => supabase
      .from('deals')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })),
    fetchAllRows(() => supabase.from('crm_activities').select('id,external_key,metadata').eq('user_id', userId).eq('type', 'note').ilike('external_key', 'deal-finance:%').is('deleted_at', null)),
  ])

  const firstError = [clients.error, properties.error, tasks.error, events.error, deals.error, financeActivities.error].find(Boolean)
  if (firstError) throw firstError

  const periods = makePeriods()
  const maps = {
    days: new Map(periods.days.map(point => [point.key, point])),
    weeks: new Map(periods.weeks.map(point => [point.key, point])),
    months: new Map(periods.months.map(point => [point.key, point])),
  }
  const pointsFor = (value?: string | null) => {
    if (!value) return []
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return []
    const monday = mondayOf(date).toISOString().slice(0, 10)
    return [maps.days.get(value.slice(0, 10)), maps.weeks.get(monday), maps.months.get(value.slice(0, 7))].filter(Boolean) as AnalyticsPoint[]
  }
  for (const client of clients.data ?? []) {
    const roles = inferContactRoles(client)
    for (const point of pointsFor(client.created_at)) {
      if (roles.includes('seller')) point.sellers += 1
      if (roles.includes('buyer')) point.buyers += 1
      if (roles.includes('landlord')) point.landlords += 1
      if (roles.includes('tenant')) point.tenants += 1
      if (client.mortgage_status) point.mortgageLeads += 1
    }
  }
  for (const property of properties.data ?? []) {
    for (const point of pointsFor(property.created_at)) {
      if (property.listing_type === 'rent') point.rentProperties += 1
      else point.saleProperties += 1
    }
  }
  const closedDeals = (deals.data ?? []).filter(deal => deal.status === 'closed')
  const financeByDeal = indexDealFinance(financeActivities.data ?? [])
  for (const deal of closedDeals) {
    for (const point of pointsFor(deal.created_at)) point.dealVolume += Number(deal.price || 0)
  }
  const typeCounts = new Map<string, number>()
  for (const property of properties.data ?? []) {
    const type = property.property_type || 'Не указан'
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
  }

  return {
    ...emptyOverview,
    owners: countContactsByRole(clients.data ?? [], 'seller'),
    buyers: countContactsByRole(clients.data ?? [], 'buyer'),
    properties: properties.data?.length ?? 0,
    activeDeals: (deals.data ?? []).filter(isActiveDealRow).length,
    completedToday: (tasks.data ?? []).filter(task => task.is_completed && typeof task.completed_at === 'string' && localDateKey(task.completed_at) === localDateKey(new Date())).length,
    tasks: (tasks.data ?? []).filter(task => !task.is_completed && task.status !== 'done').map(task => ({
      id: task.id,
      title: task.title,
      dueDate: task.due_date ?? undefined,
      dueTime: task.due_time ?? undefined,
      priority: task.priority,
      status: task.status,
      isCompleted: task.is_completed,
    })),
    events: (events.data ?? []).map(event => ({
      id: event.id,
      type: event.type,
      title: event.title,
      eventDate: event.event_date,
      eventTime: event.event_time ?? undefined,
      location: event.location ?? undefined,
      isCompleted: event.is_completed,
    })),
    recentProperties: (properties.data ?? []).slice(0, 4).map(property => ({
      id: property.id,
      address: property.address,
      price: property.price ?? undefined,
      status: property.status,
    })),
    analytics: {
      months: periods.months,
      periods,
      propertyTypes: Array.from(typeCounts, ([name, value]) => ({ name, value })),
      totalDealVolume: closedDeals.reduce((sum, deal) => sum + Number(deal.price || 0), 0),
      totalAgencyIncome: closedDeals.reduce((sum, deal) => sum + Number(financeByDeal.get(deal.id)?.agencyIncome || 0), 0),
      totalAgentIncome: closedDeals.reduce((sum, deal) => sum + Number(financeByDeal.get(deal.id)?.agentIncome || 0), 0),
    },
  }
}

export async function completeOverviewItem(type: 'task' | 'event', id: string, userId: string) {
  const table = type === 'task' ? 'tasks' : 'events'
  const { error } = await supabase
    .from(table)
    .update(type === 'task' ? { is_completed: true, status: 'done' } : { is_completed: true })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw error
}
