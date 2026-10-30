const prefix = 'kvarto:account:'
const memory = new Map<string, string>()
export const accountKey = (userId: string, name: string) => `${prefix}${encodeURIComponent(userId)}:${name}`
export const readAccountValue = (key: string): string | null => {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? null } catch { return memory.get(key) ?? null }
}
export const writeAccountValue = (key: string, value: string | null) => {
  if (value === null) memory.delete(key); else memory.set(key, value)
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* In-memory fallback, never claim durable storage. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('kvarto:preferences'))
}
export const clearAccountDrafts = (userId: string) => {
  const start = accountKey(userId, 'draft:')
  const keys = new Set([...memory.keys()])
  try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key) keys.add(key) } } catch { /* Storage unavailable. */ }
  keys.forEach(key => { if (key.startsWith(start)) writeAccountValue(key, null) })
}
export const parseAccountValue = <T>(raw: string | null, fallback: T): T => {
  try { const data = JSON.parse(raw || 'null'); return data !== null && typeof data === typeof fallback && Array.isArray(data) === Array.isArray(fallback) ? data as T : fallback } catch { return fallback }
}
