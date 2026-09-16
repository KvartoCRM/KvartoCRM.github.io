import { createClient } from '@supabase/supabase-js'
import { configureLegacyQueueTransport, configureOfflineSync, createOnlineOnlyFetch, orderEndpointsForOrigin } from './offlineTransport'
import { isNetworkFailure } from './syncDiagnostics'

const [supabaseUrl, supabaseFallbackUrl] = orderEndpointsForOrigin(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_FALLBACK_URL,
)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseProjectRef = import.meta.env.VITE_SUPABASE_PROJECT_REF
  || new URL(supabaseFallbackUrl || supabaseUrl).hostname.split('.')[0]

export const authStorageKey = `sb-${supabaseProjectRef}-auth-token`

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: authStorageKey },
  // Do not serve CRM data from device snapshots until Android transport and
  // entity-level sync are proven on a physical device. CapacitorHttp still
  // intercepts this direct fetch in the packaged Android app.
  global: { fetch: createOnlineOnlyFetch(supabaseUrl) },
})

configureLegacyQueueTransport(supabaseUrl, supabaseAnonKey)

export const checkCloudConnection = async () => {
  if (!navigator.onLine) return false
  const endpoints = [...new Set([supabaseUrl, supabaseFallbackUrl].filter(Boolean))]
  for (const endpoint of endpoints) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8_000)
    try {
      const response = await fetch(`${endpoint}/auth/v1/health`, {
        cache: 'no-store',
        headers: { apikey: supabaseAnonKey },
        signal: controller.signal,
      })
      if (response.ok) return true
    } catch {
      // Try the optional fallback when the configured primary is unavailable.
    } finally {
      window.clearTimeout(timeout)
    }
  }
  return false
}

export const checkCloudSession = async (expectedUserId: string) => {
  if (!navigator.onLine) return { valid: false, kind: 'network' as const, message: 'Нет подключения к интернету' }
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      return isNetworkFailure(error)
        ? { valid: false, kind: 'network' as const, message: 'Сервис KvartoCRM временно не ответил' }
        : { valid: false, kind: 'session' as const, message: 'Сессия не связана с текущей базой. Сначала сохраните резервную копию, затем войдите в аккаунт заново.' }
    }
    if (!data.user || data.user.id !== expectedUserId) {
      return { valid: false, kind: 'session' as const, message: 'Сессия не связана с текущей базой. Сначала сохраните резервную копию, затем войдите в аккаунт заново.' }
    }
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', expectedUserId)
      .setHeader('x-lumicrm-network-only', 'true')
      .maybeSingle()
    if (profileError) {
      return isNetworkFailure(profileError)
        ? { valid: false, kind: 'network' as const, message: 'Сервис KvartoCRM временно не ответил' }
        : { valid: false, kind: 'session' as const, message: 'Профиль не найден в текущей базе. Сначала сохраните резервную копию, затем войдите в аккаунт заново.' }
    }
    if (!profile) {
      return { valid: false, kind: 'session' as const, message: 'Профиль не найден в текущей базе. Сначала сохраните резервную копию, затем войдите в аккаунт заново.' }
    }
    return { valid: true, kind: 'valid' as const, message: '' }
  } catch (error) {
    return {
      valid: false,
      kind: isNetworkFailure(error) ? 'network' as const : 'session' as const,
      message: isNetworkFailure(error) ? 'Сервис KvartoCRM временно не ответил' : 'Не удалось проверить сессию в текущей базе.',
    }
  }
}

configureOfflineSync(async () => {
  const { data } = await supabase.auth.getSession()
  return {
    accessToken: data.session?.access_token ?? null,
    userId: data.session?.user.id ?? null,
  }
})

const WORKSPACE_TABLES = [
  'clients',
  'properties',
  'tasks',
  'events',
  'deals',
  'deal_participants',
  'property_owners',
  'property_history',
  'client_contact_points',
  'client_relationships',
  'crm_activities',
  'crm_files',
  'property_details',
  'client_requirements',
  'monthly_plans',
  'property_shares',
  'notifications',
  'push_subscriptions',
  'crm_imports',
  'crm_import_rows',
] as const

const CORE_WORKSPACE_TABLES = ['clients', 'properties', 'tasks', 'events', 'deals', 'notifications'] as const
const BACKGROUND_WORKSPACE_TABLES = WORKSPACE_TABLES.filter(table => !CORE_WORKSPACE_TABLES.includes(table as typeof CORE_WORKSPACE_TABLES[number]))
const warmPromises = new Map<string, Promise<void>>()

const warmTables = async (userId: string, tables: readonly string[], limit: number) => {
  for (let index = 0; index < tables.length; index += 2) {
    const batch = tables.slice(index, index + 2)
    await Promise.allSettled(batch.map(table => supabase.from(table).select('*').eq('user_id', userId).limit(limit)))
  }
}

export const warmOfflineWorkspace = async (userId: string, force = false) => {
  if (!navigator.onLine) return
  const marker = `lumicrm-offline-warmed:${userId}`
  const lastWarm = Number(localStorage.getItem(marker) ?? 0)
  if (!force && Date.now() - lastWarm < 15 * 60_000) return

  const active = warmPromises.get(userId)
  if (active) return active

  const warming = (async () => {
    await Promise.allSettled([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      ...CORE_WORKSPACE_TABLES.map(table => supabase.from(table).select('*').eq('user_id', userId).limit(750)),
    ])
    localStorage.setItem(marker, String(Date.now()))

    const backgroundMarker = `${marker}:background`
    const lastBackgroundWarm = Number(localStorage.getItem(backgroundMarker) ?? 0)
    if (!force && Date.now() - lastBackgroundWarm < 60 * 60_000) return
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    const delay = connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '') ? 30_000 : 6_000
    window.setTimeout(() => {
      if (!navigator.onLine) return
      void warmTables(userId, BACKGROUND_WORKSPACE_TABLES, 1500).then(() => {
        localStorage.setItem(backgroundMarker, String(Date.now()))
      })
    }, delay)
  })().finally(() => warmPromises.delete(userId))
  warmPromises.set(userId, warming)
  return warming
}
