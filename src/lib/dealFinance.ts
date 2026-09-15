export const DEAL_FINANCE_PREFIX = 'deal-finance:'

export type DealFinance = {
  agencyIncome?: number
  agentIncome?: number
}

export type DealFinanceActivity = {
  external_key?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

const optionalMoney = (value: unknown) => {
  if (value === null || value === undefined || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

export const dealFinanceKey = (dealId: string) => `${DEAL_FINANCE_PREFIX}${dealId}`

const firstMoney = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = optionalMoney(value)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

const nestedRecord = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : undefined

export const readDealFinance = (input?: object | null): DealFinance => {
  const source = input as Record<string, unknown> | undefined
  const metadata = nestedRecord(source?.metadata) ?? source
  const finance = nestedRecord(metadata?.finance)
  return {
    agencyIncome: firstMoney(
      metadata?.agency_income,
      metadata?.agencyIncome,
      finance?.agency_income,
      finance?.agencyIncome,
      source?.agency_income,
      source?.agencyIncome,
    ),
    agentIncome: firstMoney(
      metadata?.agent_income,
      metadata?.agentIncome,
      finance?.agent_income,
      finance?.agentIncome,
      source?.agent_income,
      source?.agentIncome,
    ),
  }
}

export const mergeDealFinance = (preferred?: DealFinance, fallback?: DealFinance): DealFinance => ({
  agencyIncome: preferred?.agencyIncome ?? fallback?.agencyIncome,
  agentIncome: preferred?.agentIncome ?? fallback?.agentIncome,
})

export const isDealFinanceComplete = (finance: DealFinance) => (
  finance.agencyIncome !== undefined && finance.agentIncome !== undefined
)

export const indexDealFinance = (activities: DealFinanceActivity[]) => {
  const result = new Map<string, DealFinance>()
  const ordered = [...activities].sort((left, right) => {
    const leftTime = Date.parse(String(left.updated_at || left.created_at || '')) || 0
    const rightTime = Date.parse(String(right.updated_at || right.created_at || '')) || 0
    return leftTime - rightTime
  })
  for (const activity of ordered) {
    if (!activity.external_key?.startsWith(DEAL_FINANCE_PREFIX)) continue
    const dealId = activity.external_key.slice(DEAL_FINANCE_PREFIX.length)
    result.set(dealId, mergeDealFinance(readDealFinance(activity), result.get(dealId)))
  }
  return result
}

export const formatMoney = (value?: number) => value === undefined
  ? 'Не указано'
  : `${value.toLocaleString('ru-RU')} ₽`
