type Row = Record<string, unknown>
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>JSON.stringify(key)+':'+canonical(v)).join(',') + '}'
  return JSON.stringify(value)
}
const notesEqual = (left: unknown, right: unknown) => {
  if (left === right) return true
  const prefix = 'kvartocrm-call-v1:'
  if (typeof left !== 'string' || typeof right !== 'string' || !left.startsWith(prefix) || !right.startsWith(prefix)) return false
  try { return canonical(JSON.parse(left.slice(prefix.length))) === canonical(JSON.parse(right.slice(prefix.length))) } catch { return false }
}
export const sameQuickCallRow = (saved: Row, expected: Row) => !saved.deleted_at && Object.entries(expected).every(([key,value]) => {
  if (key === 'notes') return notesEqual(saved[key],value)
  if (key === 'event_time' && value) return String(saved[key]).slice(0,5) === String(value).slice(0,5)
  return saved[key] === value
})
export class QuickCallConflictError extends Error {
  rows: Row[]
  constructor(rows: Row[]) {
    super('Этот черновик связан с ранее сохранённым звонком. Ниже показана сохранённая запись.')
    this.rows = rows
  }
}
