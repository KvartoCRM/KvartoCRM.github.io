import { inferContactRoles } from './contactRoles.ts'
import { indexDealFinance, reportedDealFinance } from './dealFinance.ts'
export type Row = Record<string, unknown>
export type Accounting = { direction?: 'sale' | 'rent'; closedOn?: string; paidOn?: string; agencyReceived?: number; agentReceived?: number }
export const ACCOUNTING_ID = 'kvartocrm:accounting-v1'
export const readAccounting = (row: Row): Accounting => {
  const value = Array.isArray(row.checklist) ? row.checklist.find((x: Row) => x.id === ACCOUNTING_ID) : undefined
  return value?.accounting || {}
}
export const accountingSnapshot = (accounting: Accounting) => ({ id: ACCOUNTING_ID, title: '', completed: true, accounting })
export const currentProperty = (row: Row) => !row.deleted_at && row.status !== 'archived' && row.status !== 'sold'
export const inPortfolio = (row: Row) => currentProperty(row) && row.work_stream === 'active'
export const within = (value: unknown, from: string, to: string) => typeof value === 'string' && Boolean(value) && (!from || value.slice(0,10) >= from) && (!to || value.slice(0,10) <= to)
export const mortgageStates = { submitted: 'Подана', reviewing: 'Рассматривается', approved: 'Одобрена', rejected: 'Отказ', withdrawn: 'Отозвана' }
export type MortgageState = keyof typeof mortgageStates
export const mortgageData = (row: Row) => row.metadata as { bank: string; amount?: number; state: MortgageState; submittedOn: string }
export type BusinessSource = { clients: Row[]; properties: Row[]; deals: Row[]; finance: Row[]; mortgages: Row[] }
export const emptyBusiness: BusinessSource = { clients: [], properties: [], deals: [], finance: [], mortgages: [] }
export type Metric = { label: string; value: number | null; money?: boolean; rows: Row[]; kind: 'clients' | 'properties' | 'deals' | 'mortgages'; field?: string }
export function businessMetrics(source: BusinessSource, mode: 'sale' | 'rent' | 'mortgage', from: string, to: string): Metric[] {
 const {clients,properties,deals,finance,mortgages}=source
 if(mode==='mortgage') {
  const rows=mortgages.filter(r=>within(mortgageData(r).submittedOn,from,to))
  return [
   {label:'Подано за период',value:rows.length,rows,kind:'mortgages'},
   {label:'Покупателей в заявках',value:new Set(rows.map(r=>r.client_id)).size,rows,kind:'mortgages'},
   ...(['reviewing','approved','rejected','withdrawn'] as const).map(state=>({label:mortgageStates[state]+' · из поданных за период',value:rows.filter(r=>mortgageData(r).state===state).length,rows:rows.filter(r=>mortgageData(r).state===state),kind:'mortgages' as const})),
  ]
 }
 const selected=deals.filter(r=>readAccounting(r).direction===mode)
 const closed=selected.filter(r=>r.status==='closed'&&within(readAccounting(r).closedOn,from,to))
 const received=selected.filter(r=>within(readAccounting(r).paidOn,from,to))
 const index=indexDealFinance(finance)
 const enriched=closed.map(r=>({...r,...reportedDealFinance(r,index.get(String(r.id)))}))
 const paid=received.map(r=>({...r,...readAccounting(r)}))
 const people=clients.filter(r=>inferContactRoles(r).some(role=>(mode==='sale'?['seller','buyer']:['landlord','tenant']).includes(role))&&within(r.created_at,from,to))
 const portfolio=properties.filter(r=>inPortfolio(r)&&r.listing_type===mode)
 const cold=properties.filter(r=>currentProperty(r)&&r.work_stream==='cold'&&r.listing_type===mode)
 const active=selected.filter(r=>r.status!=='closed'&&r.status!=='cancelled')
 const sum=(rows:Row[],field:string)=>rows.some(r=>r[field]===undefined||r[field]===null||r[field]==='')?null:rows.reduce((n,r)=>n+Number(r[field]),0)
 return [
  {label:'Новых контактов за период',value:people.length,rows:people,kind:'clients'},
  {label:'Объекты в работе сейчас',value:portfolio.length,rows:portfolio,kind:'properties'},
  {label:'Холодная база сейчас',value:cold.length,rows:cold,kind:'properties'},
  {label:'Из действующих: принято за период',value:portfolio.filter(r=>within(r.work_started_on,from,to)).length,rows:portfolio.filter(r=>within(r.work_started_on,from,to)),kind:'properties'},
  {label:'Активные сделки сейчас',value:active.length,rows:active,kind:'deals'},
  {label:mode==='sale'?'Закрыто продаж за период':'Заключено договоров аренды',value:closed.length,rows:closed,kind:'deals'},
  {label:mode==='sale'?'Стоимость закрытых продаж':'Сумма месячных ставок, ₽/мес.',value:sum(closed,'price'),money:true,rows:closed,kind:'deals',field:'price'},
  {label:'Вознаграждение агентства · начислено',value:sum(enriched,'agencyIncome'),money:true,rows:enriched,kind:'deals',field:'agencyIncome'},
  {label:'Доход агента · начислено',value:sum(enriched,'agentIncome'),money:true,rows:enriched,kind:'deals',field:'agentIncome'},
  {label:'Агентству получено за период',value:sum(paid,'agencyReceived'),money:true,rows:paid,kind:'deals',field:'agencyReceived'},
  {label:'Агенту получено за период',value:sum(paid,'agentReceived'),money:true,rows:paid,kind:'deals',field:'agentReceived'},
 ]
}
export const unresolvedDeals = (deals: Row[]) => deals.filter(r=>!readAccounting(r).direction||(r.status==='closed'&&!readAccounting(r).closedOn))

export function validateAccounting(value: Accounting, status: string) {
 if(value.direction!=='sale'&&value.direction!=='rent')throw new Error('Укажите направление сделки')
 const date=(v:string|undefined)=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v)
 if(!date(value.closedOn)||!date(value.paidOn))throw new Error('Некорректная дата учёта')
 if(status==='closed'&&!value.closedOn)throw new Error('Укажите фактическую дату закрытия')
 for(const n of [value.agencyReceived,value.agentReceived])if(n!==undefined&&(!Number.isFinite(n)||n<0))throw new Error('Полученная сумма должна быть неотрицательным числом')
 if(value.paidOn&&(value.agencyReceived===undefined||value.agentReceived===undefined))throw new Error('Укажите обе полученные суммы, включая нулевую')
 if(!value.paidOn&&(value.agencyReceived!==undefined||value.agentReceived!==undefined))throw new Error('Укажите дату поступления')
}
