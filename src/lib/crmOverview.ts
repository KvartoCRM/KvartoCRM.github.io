import { inferContactRoles, type ContactRole } from './contactRoles.ts'

type ContactRow = Record<string, unknown>
type DealRow = { status?: unknown }

export const countContactsByRole = (rows: ContactRow[], role: ContactRole) => rows
  .filter(row => inferContactRoles(row).includes(role))
  .length

export const isActiveDealRow = (deal: DealRow) => deal.status !== 'closed' && deal.status !== 'cancelled'
