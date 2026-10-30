import { useCallback, useMemo, useSyncExternalStore, type SetStateAction } from 'react'
import { accountKey, parseAccountValue, readAccountValue, writeAccountValue } from '../lib/accountStorage'

const subscribe = (notify: () => void) => {
  window.addEventListener('storage', notify)
  window.addEventListener('kvarto:preferences', notify)
  return () => { window.removeEventListener('storage', notify); window.removeEventListener('kvarto:preferences', notify) }
}
export function useAccountState<T>(userId: string | undefined, name: string, initial: T): [T, (next: SetStateAction<T>) => void] {
  const key = userId ? accountKey(userId, name) : ''
  const raw = useSyncExternalStore(subscribe, () => key ? readAccountValue(key) : null, () => null)
  const value = useMemo(() => parseAccountValue(raw, initial), [raw, initial])
  const set = useCallback((next: SetStateAction<T>) => {
    if (!key) return
    const current = parseAccountValue(readAccountValue(key), initial)
    writeAccountValue(key, JSON.stringify(typeof next === 'function' ? (next as (old: T) => T)(current) : next))
  }, [key, initial])
  return [value, set]
}
