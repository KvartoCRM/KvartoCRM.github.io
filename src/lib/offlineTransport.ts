type SessionSnapshot = {
  accessToken: string | null
  userId: string | null
}

type CachedResponse = {
  key: string
  userId: string
  userTable: string
  table: string
  url: string
  body: string
  status: number
  headers: Record<string, string>
  updatedAt: number
}

type QueuedRequest = {
  id: string
  userId: string
  table: string
  url: string
  method: string
  headers: Record<string, string>
  body: string
  createdAt: number
  attempts: number
  lastError?: string
}

export type OfflineStatus = {
  online: boolean
  pending: number
  syncing: boolean
  error?: string
}

export type OfflineQueueIssue = {
  id: string
  table: string
  method: string
  createdAt: number
  attempts: number
  lastError?: string
}

const DB_NAME = 'lumicrm-offline-v1'
const DB_VERSION = 1
const RESPONSE_STORE = 'responses'
const QUEUE_STORE = 'queue'
const UUID_TABLES = new Set([
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
  'client_requirements',
  'monthly_plans',
  'property_shares',
  'notifications',
  'push_subscriptions',
  'monthly_plans',
  'crm_imports',
  'crm_import_rows',
])
const SOFT_DELETE_TABLES = new Set(['clients', 'properties', 'tasks', 'events', 'deals', 'crm_activities'])
const SAFE_HEADERS = new Set(['accept', 'content-type', 'content-profile', 'prefer', 'range', 'range-unit'])
const nativeFetch = globalThis.fetch.bind(globalThis)
// Mobile networks can need more than two seconds before a Supabase REST body
// completes. A premature timeout returned stale cache after a successful write.
const READ_TIMEOUT_MS = 6_000
const WRITE_TIMEOUT_MS = 6_000
// Queue replay runs in the background. Give unstable mobile and regional
// routes enough time to finish instead of aborting a valid Supabase write.
const QUEUE_WRITE_TIMEOUT_MS = 20_000
const INTERACTIVE_NETWORK_TIMEOUT_MS = 8_000
const FILE_NETWORK_TIMEOUT_MS = 30_000

let sessionProvider: (() => Promise<SessionSnapshot>) | null = null
let syncPromise: Promise<number> | null = null
let syncTimer: number | null = null
let transportConfig: { url: string; fallback?: string; apiKey: string } | null = null
let activeUserId: string | null = null
let forcedNetworkRefreshUntil = 0
const tableMutationEpochs = new Map<string, number>()

const mutationEpochKey = (userId: string, table: string) => `${userId}:${table}`
const currentMutationEpoch = (userId: string, table: string) => tableMutationEpochs.get(mutationEpochKey(userId, table)) ?? 0
const bumpMutationEpoch = (userId: string, table: string) => {
  const next = currentMutationEpoch(userId, table) + 1
  tableMutationEpochs.set(mutationEpochKey(userId, table), next)
  return next
}

export const setOfflineSession = (userId: string | null) => {
  activeUserId = userId
}

export const requestWorkspaceNetworkRefresh = (durationMs = 30_000) => {
  forcedNetworkRefreshUntil = Math.max(forcedNetworkRefreshUntil, Date.now() + durationMs)
}

export const clearWorkspaceNetworkRefresh = () => {
  forcedNetworkRefreshUntil = 0
}

export const isWorkspaceNetworkRefreshForced = (now = Date.now()) => now < forcedNetworkRefreshUntil

const hasIndexedDb = () => typeof indexedDB !== 'undefined'
const isOnline = () => typeof navigator === 'undefined' || navigator.onLine

const fetchWithTimeout = async (request: Request, timeoutMs: number) => {
  request.signal.throwIfAborted()
  const controller = new AbortController()
  const abort = () => controller.abort(request.signal.reason)
  request.signal.addEventListener('abort', abort, { once: true })
  let rejectTimeout: ((reason?: unknown) => void) | null = null
  const timeoutFailure = new Promise<never>((_, reject) => { rejectTimeout = reject })
  const timeout = globalThis.setTimeout(() => {
    controller.abort()
    rejectTimeout?.(new DOMException('Network request timed out', 'TimeoutError'))
  }, timeoutMs)
  try {
    return await Promise.race([
      (async () => {
        const response = await nativeFetch(new Request(request, { signal: controller.signal }))
        // fetch resolves on headers. A stalled body must remain inside the
        // deadline too. A mutation is not acknowledged until its complete
        // response has arrived; headers alone are not proof of a durable write.
        // 204/205/304 responses deliberately have no body. Reconstructing
        // them with Response(null, { status }) throws in WebView, even though
        // the server has already completed the DELETE/PATCH successfully.
        if (!response.body || [204, 205, 304].includes(response.status)) return response
        const body = await response.arrayBuffer()
        const buffered = new Response(body, {
          status: response.status, statusText: response.statusText, headers: response.headers,
        })
        Object.defineProperty(buffered, 'url', { value: response.url })
        return buffered
      })(),
      timeoutFailure,
    ])
  } finally {
    globalThis.clearTimeout(timeout)
    request.signal.removeEventListener('abort', abort)
  }
}

/**
 * Temporary production transport while Android synchronization is repaired.
 * It deliberately bypasses IndexedDB snapshots and the mutation queue: a UI
 * write either receives a complete direct Supabase response or fails visibly.
 */
export const createOnlineOnlyFetch = (supabaseUrl: string) => async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (url.origin !== new URL(supabaseUrl).origin) return nativeFetch(request)
  // This is an internal transport marker, not an HTTP header. Forwarding it
  // through the Cloudflare gateway triggers a CORS preflight rejection and
  // makes a healthy account look offline.
  request.headers.delete('x-lumicrm-network-only')
  const timeout = url.pathname.includes('/storage/v1/') ? FILE_NETWORK_TIMEOUT_MS : INTERACTIVE_NETWORK_TIMEOUT_MS
  // Android WebView may reuse a successful REST list response after a write.
  // The CRM is temporarily online-only, so every Supabase read must bypass the
  // HTTP cache as well as IndexedDB; otherwise the confirmed new row is hidden.
  return fetchWithTimeout(new Request(request, { cache: 'no-store' }), timeout)
}

// Existing installations can still contain records queued by the legacy
// client. Keep a direct configuration solely to deliver those records; new
// application requests never enter that queue in online-only mode.
export const configureLegacyQueueTransport = (url: string, apiKey: string, fallback?: string) => {
  transportConfig = { url, apiKey, fallback }
}

export const rewriteRequestUrl = (urlValue: string, endpoint: string) => {
  const source = new URL(urlValue)
  const target = new URL(endpoint)
  target.pathname = source.pathname
  target.search = source.search
  target.hash = source.hash
  return target.toString()
}

export const orderEndpointsForOrigin = (
  primary: string,
  fallback?: string,
  currentOrigin = typeof window !== 'undefined' ? window.location.origin : undefined,
): [string, string | undefined] => {
  const endpoints = [...new Set([primary, fallback].filter((value): value is string => Boolean(value)))]
  const sameOrigin = currentOrigin
    ? endpoints.find(endpoint => new URL(endpoint).origin === currentOrigin)
    : undefined
  if (!sameOrigin) return [primary, fallback]
  return [sameOrigin, endpoints.find(endpoint => endpoint !== sameOrigin)]
}

const fetchWithFallback = async (request: Request, timeoutMs: number, fallbackUrl?: string) => {
  // Repeating any mutation through a second origin after an ambiguous timeout
  // can duplicate a record. Stable-ID writes are queued and replayed instead.
  const method = request.method.toUpperCase()
  const pathname = new URL(request.url).pathname
  const canRetryAcrossOrigins = ['GET', 'HEAD'].includes(method)
    || (method === 'POST' && pathname === '/auth/v1/token')
  if (!canRetryAcrossOrigins) fallbackUrl = undefined
  let primaryResponse: Response | null = null
  let primaryError: unknown
  try {
    primaryResponse = await fetchWithTimeout(request.clone(), timeoutMs)
    if (primaryResponse.status < 500 || !fallbackUrl) return primaryResponse
  } catch (error) {
    request.signal.throwIfAborted()
    primaryError = error
    if (!fallbackUrl) throw error
  }

  const primaryOrigin = new URL(request.url).origin
  const fallbackOrigin = new URL(fallbackUrl).origin
  if (primaryOrigin === fallbackOrigin) {
    if (primaryResponse) return primaryResponse
    throw primaryError
  }

  return fetchWithTimeout(new Request(rewriteRequestUrl(request.url, fallbackUrl), request.clone()), timeoutMs)
}

const emitStatus = (detail: OfflineStatus) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lumicrm:offline-status', { detail }))
}

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (!hasIndexedDb()) {
    reject(new Error('IndexedDB is unavailable'))
    return
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(RESPONSE_STORE)) {
      const responses = database.createObjectStore(RESPONSE_STORE, { keyPath: 'key' })
      responses.createIndex('userId', 'userId')
      responses.createIndex('userTable', 'userTable')
    }
    if (!database.objectStoreNames.contains(QUEUE_STORE)) {
      const queue = database.createObjectStore(QUEUE_STORE, { keyPath: 'id' })
      queue.createIndex('userId', 'userId')
      queue.createIndex('createdAt', 'createdAt')
    }
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
})

const runStore = async <T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) => {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = operation(transaction.objectStore(storeName))
    request.onerror = () => { database.close(); reject(request.error ?? new Error('IndexedDB operation failed')) }
    transaction.oncomplete = () => { database.close(); resolve(request.result) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('IndexedDB transaction aborted')) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('IndexedDB transaction failed')) }
  })
}

const getAllByIndex = async <T>(storeName: string, indexName: string, value: IDBValidKey) => {
  const database = await openDatabase()
  return new Promise<T[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).index(indexName).getAll(value)
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => { database.close(); reject(request.error ?? new Error('IndexedDB query failed')) }
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('IndexedDB transaction failed')) }
  })
}

const cacheRequestSignature = (request: Request) => {
  const url = new URL(request.url)
  return `${url.pathname}${url.search}:${request.method}:${['accept', 'range', 'prefer', 'accept-profile'].map(key => request.headers.get(key) ?? '').join(':')}`
}

// The cache represents a Supabase project, not one of its transport hosts.
// Keeping the origin out lets an installed app move safely between gateway
// and direct endpoints without losing its device-local snapshot.
const cacheKey = (userId: string, request: Request) => `${userId}:${cacheRequestSignature(request)}`

const decodeUserId = (request: Request) => {
  const authorization = request.headers.get('authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return String(JSON.parse(atob(payload)).sub ?? '') || null
  } catch {
    return null
  }
}

const getTable = (url: URL) => {
  const match = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)
  const table = match?.[1]
  return table && (UUID_TABLES.has(table) || table === 'profiles' || table === 'property_details') ? table : null
}

const safeHeaders = (headers: Headers) => {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    if (SAFE_HEADERS.has(key.toLowerCase())) result[key] = value
  })
  return result
}

const cloneResponseHeaders = (headers: Headers) => {
  const result: Record<string, string> = {}
  for (const key of ['content-type', 'content-range', 'preference-applied']) {
    const value = headers.get(key)
    if (value) result[key] = value
  }
  return result
}

const parseFilterValue = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const valuesEqual = (left: unknown, right: string) => {
  if (left === null) return right === 'null'
  if (typeof left === 'boolean') return String(left) === right
  return String(left ?? '') === right
}

export const filterRowsForUrl = (rows: Record<string, unknown>[], urlValue: string) => {
  const url = new URL(urlValue, 'https://offline.local')
  let result = [...rows]
  const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'or'])

  url.searchParams.forEach((expression, field) => {
    if (reserved.has(field)) return
    const decoded = parseFilterValue(expression)
    if (decoded.startsWith('eq.')) {
      const expected = decoded.slice(3)
      result = result.filter(row => valuesEqual(row[field], expected))
    } else if (decoded.startsWith('neq.')) {
      const expected = decoded.slice(4)
      result = result.filter(row => !valuesEqual(row[field], expected))
    } else if (decoded.startsWith('is.')) {
      const expected = decoded.slice(3)
      result = result.filter(row => valuesEqual(row[field], expected))
    } else if (decoded.startsWith('not.is.')) {
      const expected = decoded.slice(7)
      result = result.filter(row => !valuesEqual(row[field], expected))
    } else if (decoded.startsWith('ilike.')) {
      const expected = decoded.slice(6).replace(/^%|%$/g, '').toLocaleLowerCase('ru-RU')
      result = result.filter(row => String(row[field] ?? '').toLocaleLowerCase('ru-RU').includes(expected))
    } else if (/^(gte|lte|gt|lt)\./.test(decoded)) {
      const [operator, ...parts] = decoded.split('.')
      const expected = parts.join('.')
      result = result.filter(row => {
        const actual = row[field]
        const numeric = Number(actual)
        const expectedNumeric = Number(expected)
        const left = Number.isNaN(numeric) || Number.isNaN(expectedNumeric) ? String(actual ?? '') : numeric
        const right = Number.isNaN(numeric) || Number.isNaN(expectedNumeric) ? expected : expectedNumeric
        if (operator === 'gte') return left >= right
        if (operator === 'lte') return left <= right
        if (operator === 'gt') return left > right
        return left < right
      })
    } else if (decoded.startsWith('in.(') && decoded.endsWith(')')) {
      const expected = decoded.slice(4, -1).split(',').map(value => value.replace(/^"|"$/g, ''))
      result = result.filter(row => expected.some(value => valuesEqual(row[field], value)))
    } else if (decoded.startsWith('cs.')) {
      try {
        const expected = JSON.parse(decoded.slice(3)) as Record<string, unknown>
        result = result.filter(row => {
          const actual = row[field]
          return actual && typeof actual === 'object'
            && Object.entries(expected).every(([key, value]) => JSON.stringify((actual as Record<string, unknown>)[key]) === JSON.stringify(value))
        })
      } catch {
        // An unsupported contains expression is left to the exact cache entry.
      }
    }
  })

  const orExpression = url.searchParams.get('or')
  if (orExpression) {
    const conditions = parseFilterValue(orExpression).replace(/^\(|\)$/g, '').split(',')
    result = result.filter(row => conditions.some(condition => {
      const match = condition.match(/^([^.]+)\.(eq|ilike)\.(.*)$/)
      if (!match) return false
      const [, field, operator, expectedValue] = match
      if (operator === 'eq') return valuesEqual(row[field], expectedValue)
      const expected = expectedValue.replace(/^%|%$/g, '').toLocaleLowerCase('ru-RU')
      return String(row[field] ?? '').toLocaleLowerCase('ru-RU').includes(expected)
    }))
  }

  const order = url.searchParams.get('order')
  if (order) {
    const clauses = order.split(',').map(clause => clause.split('.'))
    result.sort((left, right) => {
      for (const [field, direction] of clauses) {
        const a = String(left[field] ?? '')
        const b = String(right[field] ?? '')
        const comparison = a.localeCompare(b)
        if (comparison) return (direction === 'desc' ? -1 : 1) * comparison
      }
      return 0
    })
  }
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const limitValue = url.searchParams.get('limit')
  return result.slice(offset, limitValue ? offset + Number(limitValue) : undefined)
}

export const prepareOfflinePayload = (table: string, body: unknown) => {
  const source = Array.isArray(body) ? body : [body]
  const prepared = source.map(value => {
    if (!value || typeof value !== 'object') return value
    const row = { ...(value as Record<string, unknown>) }
    if (UUID_TABLES.has(table) && !row.id) row.id = crypto.randomUUID()
    if (SOFT_DELETE_TABLES.has(table) && row.deleted_at === undefined) row.deleted_at = null
    if (table === 'property_shares' && !row.slug) row.slug = crypto.randomUUID()
    return row
  })
  return Array.isArray(body) ? prepared : prepared[0]
}

const cacheResponse = async (
  request: Request,
  response: Response,
  userId: string,
  table: string,
  expectedMutationEpoch = currentMutationEpoch(userId, table),
) => {
  if (!hasIndexedDb() || !response.ok) return
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) return
  const body = await response.clone().text()
  // A GET started before a local write can finish afterwards with the old
  // server snapshot. Never let that late response erase the record which the
  // mutation has already placed in the device cache.
  if (currentMutationEpoch(userId, table) !== expectedMutationEpoch) return false
  const record: CachedResponse = {
    key: cacheKey(userId, request),
    userId,
    userTable: `${userId}:${table}`,
    table,
    url: request.url,
    body,
    status: response.status,
    headers: cloneResponseHeaders(response.headers),
    updatedAt: Date.now(),
  }
  await runStore(RESPONSE_STORE, 'readwrite', store => store.put(record)).catch(() => undefined)
  return true
}

const responseFromCache = (cached: CachedResponse) => new Response(cached.body, {
  status: cached.status,
  headers: { 'content-type': 'application/json', ...cached.headers, 'x-lumicrm-offline': 'cache' },
})

const findCachedResponse = async (request: Request, userId: string, table: string) => {
  if (!hasIndexedDb()) return null
  const exact = await runStore<CachedResponse | undefined>(RESPONSE_STORE, 'readonly', store => store.get(cacheKey(userId, request))).catch(() => undefined)
  if (exact) return responseFromCache(exact)

  // v1.2.9 and older included the endpoint origin in the key. Accept a
  // matching legacy record during migration so offline data stays visible.
  const suffix = `:${cacheRequestSignature(request)}`
  const legacy = (await getAllByIndex<CachedResponse>(RESPONSE_STORE, 'userTable', `${userId}:${table}`).catch(() => []))
    .filter(record => record.key.endsWith(suffix))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]
  if (legacy) return responseFromCache(legacy)

  // Another query/page is not evidence that a complete table is cached.
  return null
}

const matchesMutation = (row: Record<string, unknown>, url: string) => filterRowsForUrl([row], url).length === 1

const updateCachedTable = async (userId: string, table: string, method: string, url: string, payload: unknown) => {
  if (!hasIndexedDb()) return
  const records = await getAllByIndex<CachedResponse>(RESPONSE_STORE, 'userTable', `${userId}:${table}`).catch(() => [])
  const incoming = (Array.isArray(payload) ? payload : [payload]).filter(Boolean) as Record<string, unknown>[]
  await Promise.all(records.map(async record => {
    try {
      const parsed = JSON.parse(record.body)
      if (!Array.isArray(parsed)) return
      let rows = parsed as Record<string, unknown>[]
      if (method === 'POST') {
        const mutationUrl = new URL(url)
        const identityFields = (mutationUrl.searchParams.get('on_conflict') || conflictFields[table] || 'id').split(',')
        for (const row of incoming) {
          const hasIdentity = identityFields.every(field => row[field] !== undefined)
          const existing = hasIdentity
            ? rows.findIndex(item => identityFields.every(field => JSON.stringify(item[field]) === JSON.stringify(row[field])))
            : -1
          if (existing >= 0) rows[existing] = { ...rows[existing], ...row }
          else if (matchesMutation(row, record.url)) rows.push(row)
        }
      } else if (method === 'PATCH') {
        rows = rows.map(row => matchesMutation(row, url) ? { ...row, ...incoming[0] } : row)
      } else if (method === 'DELETE') {
        rows = rows.filter(row => !matchesMutation(row, url))
      }
      const pageUrl = new URL(record.url)
      pageUrl.searchParams.delete('offset') // Cached rows already belong to this page.
      record.body = JSON.stringify(filterRowsForUrl(rows, pageUrl.toString()))
      record.updatedAt = Date.now()
      await runStore(RESPONSE_STORE, 'readwrite', store => store.put(record))
    } catch {
      // A malformed old cache entry must not block an offline write.
    }
  }))
}

const applyQueuedMutation = (
  rows: Record<string, unknown>[],
  entry: Pick<QueuedRequest, 'table' | 'method' | 'url' | 'body'>,
) => {
  const parsedBody = entry.body ? JSON.parse(entry.body) : null
  const incoming = parsedBody
    ? (Array.isArray(parsedBody) ? parsedBody : [parsedBody]) as Record<string, unknown>[]
    : []
  let result = [...rows]
  if (entry.method === 'POST') {
    const mutationUrl = new URL(entry.url)
    const identityFields = (mutationUrl.searchParams.get('on_conflict') || conflictFields[entry.table] || 'id').split(',')
    for (const row of incoming) {
      const hasIdentity = identityFields.every(field => row[field] !== undefined)
      const existing = hasIdentity
        ? result.findIndex(item => identityFields.every(field => JSON.stringify(item[field]) === JSON.stringify(row[field])))
        : -1
      if (existing >= 0) result[existing] = { ...result[existing], ...row }
      else result.push(row)
    }
  } else if (entry.method === 'PATCH') {
    result = result.map(row => matchesMutation(row, entry.url) ? { ...row, ...incoming[0] } : row)
  } else if (entry.method === 'DELETE') {
    result = result.filter(row => !matchesMutation(row, entry.url))
  }
  return result
}

export const mergeRemoteRowsWithQueuedMutations = (
  remoteRows: Record<string, unknown>[],
  entries: Array<Pick<QueuedRequest, 'table' | 'method' | 'url' | 'body' | 'createdAt'>>,
  table: string,
  requestUrl: string,
) => {
  const merged = entries
    .filter(entry => entry.table === table)
    .sort((left, right) => left.createdAt - right.createdAt)
    .reduce(applyQueuedMutation, remoteRows)
  return filterRowsForUrl(merged, requestUrl)
}

const mergePendingMutationsIntoResponse = async (request: Request, response: Response, userId: string, table: string) => {
  if (!hasIndexedDb() || !response.ok || !response.headers.get('content-type')?.includes('json')) return response
  try {
    const parsed = JSON.parse(await response.clone().text())
    if (!Array.isArray(parsed)) return response
    const entries = await getAllByIndex<QueuedRequest>(QUEUE_STORE, 'userId', userId).catch(() => [])
    const merged = mergeRemoteRowsWithQueuedMutations(parsed, entries, table, request.url)
    const buffered = new Response(JSON.stringify(merged), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
    Object.defineProperty(buffered, 'url', { value: response.url })
    return buffered
  } catch {
    return response
  }
}

const syntheticMutationResponse = (request: Request, method: string, payload: unknown) => {
  const prefersRepresentation = request.headers.get('prefer')?.includes('return=representation')
  if (!prefersRepresentation || method === 'DELETE') return new Response(null, { status: method === 'POST' ? 201 : 204 })
  const acceptsObject = request.headers.get('accept')?.includes('application/vnd.pgrst.object')
  const url = new URL(request.url)
  const source = (Array.isArray(payload) ? payload : [payload]).map(value => {
    if (!value || typeof value !== 'object') return value
    const row = { ...(value as Record<string, unknown>) }
    url.searchParams.forEach((expression, field) => {
      const decoded = parseFilterValue(expression)
      if (row[field] === undefined && decoded.startsWith('eq.')) row[field] = decoded.slice(3)
    })
    return row
  })
  return new Response(JSON.stringify(acceptsObject ? source[0] ?? null : source), {
    status: method === 'POST' ? 201 : 200,
    headers: { 'content-type': 'application/json', 'x-lumicrm-offline': 'queued' },
  })
}

const enqueueMutation = async (request: Request, userId: string, table: string) => {
  const method = request.method.toUpperCase()
  const originalBody = request.body ? await request.clone().text() : ''
  let parsed: unknown = originalBody ? JSON.parse(originalBody) : {}
  if (method === 'POST') parsed = prepareOfflinePayload(table, parsed)

  const queueItem: QueuedRequest = {
    id: crypto.randomUUID(),
    userId,
    table,
    url: request.url,
    method,
    headers: safeHeaders(request.headers),
    body: method === 'DELETE' ? '' : JSON.stringify(parsed),
    createdAt: Date.now(),
    attempts: 0,
  }
  await runStore(QUEUE_STORE, 'readwrite', store => store.put(queueItem))
  await updateCachedTable(userId, table, method, request.url, parsed)
  const pending = await getOfflineQueueCount(userId)
  emitStatus({ online: false, pending, syncing: false })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lumicrm:offline-queued', { detail: { table, pending } }))
  return syntheticMutationResponse(request, method, parsed)
}

export const createOfflineFetch = (supabaseUrl: string, fallbackUrl?: string) => async (input: RequestInfo | URL, init?: RequestInit) => {
  let request = new Request(input, init)
  request.signal.throwIfAborted()
  const networkOnly = request.headers.get('x-lumicrm-network-only') === 'true'
  request.headers.delete('x-lumicrm-network-only')
  const url = new URL(request.url)
  const supabaseOrigins = new Set([supabaseUrl, fallbackUrl].filter(Boolean).map(value => new URL(value as string).origin))
  const isSupabaseRequest = supabaseOrigins.has(url.origin)
  const table = isSupabaseRequest ? getTable(url) : null
  if (!table) {
    if (isSupabaseRequest) {
      const timeout = url.pathname.includes('/storage/v1/')
        ? FILE_NETWORK_TIMEOUT_MS
        : INTERACTIVE_NETWORK_TIMEOUT_MS
      return fetchWithFallback(request, timeout, fallbackUrl)
    }
    return nativeFetch(request)
  }

  const userId = decodeUserId(request)
  if (!userId) return nativeFetch(request)
  if (activeUserId !== userId) return nativeFetch(request)
  const method = request.method.toUpperCase()
  transportConfig = { url: supabaseUrl, fallback: fallbackUrl, apiKey: request.headers.get('apikey') ?? '' }
  if (networkOnly || method === 'HEAD') {
    const readEpoch = currentMutationEpoch(userId, table)
    const forcedRequest = method === 'GET' ? new Request(request, { cache: 'no-store' }) : request
    let response = await fetchWithFallback(forcedRequest, INTERACTIVE_NETWORK_TIMEOUT_MS, fallbackUrl)
    if (networkOnly && method === 'GET' && response.ok) {
      response = await mergePendingMutationsIntoResponse(request, response, userId, table)
      await cacheResponse(request, response, userId, table, readEpoch)
      emitStatus({ online: true, pending: await getOfflineQueueCount(userId), syncing: false })
    }
    return response
  }
  if (method === 'POST') {
    const body = await request.clone().text()
    const payload = prepareOfflinePayload(table, body ? JSON.parse(body) : {})
    request = new Request(request, { body: JSON.stringify(payload) })
  }

  if (method === 'GET' || method === 'HEAD') {
    if (isOnline()) {
      const readEpoch = currentMutationEpoch(userId, table)
      const cached = await findCachedResponse(request, userId, table)
      const forceNetworkRead = method === 'GET' && isWorkspaceNetworkRefreshForced()
      const networkRequest = fetchWithFallback(new Request(request, {
        cache: forceNetworkRead ? 'no-store' : request.cache,
      }), READ_TIMEOUT_MS, fallbackUrl)
      if (cached && !forceNetworkRead) {
        const cachedBody = await cached.clone().text()
        void networkRequest.then(response => mergePendingMutationsIntoResponse(request, response, userId, table)).then(async response => {
          if (!response.ok) return
          const networkBody = await response.clone().text()
          const cachedFreshResponse = await cacheResponse(request, response, userId, table, readEpoch)
          emitStatus({ online: true, pending: await getOfflineQueueCount(userId), syncing: false })
          if (cachedFreshResponse && networkBody !== cachedBody && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('lumicrm:remote-data-changed', { detail: { table, userId } }))
          }
        }).catch(async () => {
          emitStatus({
            online: false,
            pending: await getOfflineQueueCount(userId),
            syncing: false,
            error: 'Синхронизация недоступна — используется копия на устройстве',
          })
        })
        return cached
      }
      try {
        const response = await mergePendingMutationsIntoResponse(request, await networkRequest, userId, table)
        if (response.ok) {
          await cacheResponse(request, response, userId, table, readEpoch)
          emitStatus({ online: true, pending: await getOfflineQueueCount(userId), syncing: false })
        }
        if (response.status < 500) return response
      } catch (error) {
        request.signal.throwIfAborted()
        if (forceNetworkRead) throw error
        // Fall through to the device-local snapshot.
      }
      if (forceNetworkRead) throw new TypeError('Не удалось получить свежие данные из облака')
      emitStatus({ online: false, pending: await getOfflineQueueCount(userId), syncing: false, error: 'Синхронизация недоступна — используется копия на устройстве' })
      if (cached) return cached
    }
    return await findCachedResponse(request, userId, table)
      ?? new Response(JSON.stringify({ message: 'Данные ещё не сохранены на этом устройстве' }), {
        status: 503,
        headers: { 'content-type': 'application/json', 'x-lumicrm-offline': 'miss' },
      })
  }

  // Preserve ordering only for mutations of the same record. A stuck task must
  // not force an unrelated contact, property or deal into the offline queue.
  bumpMutationEpoch(userId, table)
  if (isOnline() && !await hasQueuedEntityConflict(request, userId, table)) {
    try {
      const response = await fetchWithFallback(request.clone(), WRITE_TIMEOUT_MS, fallbackUrl)
      if (response.status < 500) {
        if (response.ok) {
          const body = request.body ? JSON.parse(await request.clone().text()) : {}
          await updateCachedTable(userId, table, method, request.url, body)
        }
        emitStatus({ online: true, pending: await getOfflineQueueCount(userId), syncing: false })
        return response
      }
    } catch {
      request.signal.throwIfAborted()
      // A temporary connection failure is handled as an offline write.
    }
    emitStatus({ online: false, pending: await getOfflineQueueCount(userId), syncing: false, error: 'Изменение сохранено на устройстве и ожидает синхронизации' })
  }
  return enqueueMutation(request, userId, table)
}

export const getOfflineQueueCount = async (userId: string) => {
  if (!hasIndexedDb()) return 0
  const entries = await getAllByIndex<QueuedRequest>(QUEUE_STORE, 'userId', userId).catch(() => [])
  return entries.length
}

export const getOfflineQueueIssues = async (userId: string): Promise<OfflineQueueIssue[]> => {
  if (!hasIndexedDb()) return []
  const entries = await getAllByIndex<QueuedRequest>(QUEUE_STORE, 'userId', userId).catch(() => [])
  return entries
    .filter(entry => entry.attempts > 0 || Boolean(entry.lastError))
    .sort((left, right) => right.createdAt - left.createdAt)
    .map(({ id, table, method, createdAt, attempts, lastError }) => ({ id, table, method, createdAt, attempts, lastError }))
}

const conflictFields: Record<string, string> = {
  property_details: 'property_id',
  property_owners: 'property_id,client_id',
  client_requirements: 'client_id,purpose',
  property_shares: 'user_id,property_id',
  push_subscriptions: 'user_id,endpoint',
  client_contact_points: 'user_id,client_id,kind,value',
  client_relationships: 'user_id,source_client_id,target_client_id,relationship',
}

const replayUrl = (entry: QueuedRequest) => {
  if (entry.method !== 'POST') return entry.url
  const url = new URL(entry.url)
  if (!url.searchParams.has('on_conflict')) url.searchParams.set('on_conflict', conflictFields[entry.table] ?? 'id')
  return url.toString()
}

// Ordering is only relevant for operations that affect the same record. A
// rejected legacy record must not prevent newer records from synchronizing.
const queuedEntityKey = (entry: QueuedRequest) => {
  try {
    const url = new URL(entry.url)
    const idFilter = url.searchParams.get('id')
    if (idFilter?.startsWith('eq.')) return `${entry.table}:${idFilter.slice(3)}`
    if (entry.body) {
      const parsed = JSON.parse(entry.body)
      const row = Array.isArray(parsed) ? parsed[0] : parsed
      if (row && typeof row === 'object' && typeof row.id === 'string') return `${entry.table}:${row.id}`
    }
  } catch {
    // Fall back to table-level ordering for malformed legacy queue entries.
  }
  return `${entry.table}:*`
}

const hasQueuedEntityConflict = async (request: Request, userId: string, table: string) => {
  const entries = await getAllByIndex<QueuedRequest>(QUEUE_STORE, 'userId', userId).catch(() => [])
  if (entries.length === 0) return false
  const current: QueuedRequest = {
    id: '',
    userId,
    table,
    url: request.url,
    method: request.method,
    headers: {},
    body: request.body ? await request.clone().text() : '',
    createdAt: 0,
    attempts: 0,
  }
  const currentKey = queuedEntityKey(current)
  return entries.some(entry => {
    const queuedKey = queuedEntityKey(entry)
    return queuedKey === currentKey || queuedKey === `${table}:*` || currentKey === `${table}:*` && entry.table === table
  })
}

const protectedQueueColumns = new Set(['id', 'user_id'])

export const removeMissingColumnFromQueuedBody = (body: string, responseText: string) => {
  const message = (() => {
    try {
      const parsed = JSON.parse(responseText) as { message?: unknown; details?: unknown; hint?: unknown }
      return [parsed.message, parsed.details, parsed.hint].filter(value => typeof value === 'string').join(' ')
    } catch {
      return responseText
    }
  })()
  const match = message.match(/(?:Could not find the|column)\s+["']?([a-z_][a-z0-9_]*)["']?\s+(?:column|of|does not exist)/i)
    ?? message.match(/["']([a-z_][a-z0-9_]*)["']\s+column/i)
  const column = match?.[1]
  if (!column || protectedQueueColumns.has(column)) return null
  try {
    const source = JSON.parse(body)
    const rows = Array.isArray(source) ? source : [source]
    if (!rows.some(row => row && typeof row === 'object' && column in row)) return null
    const cleaned = rows.map(row => {
      if (!row || typeof row !== 'object') return row
      const next = { ...row }
      delete next[column]
      return next
    })
    return JSON.stringify(Array.isArray(source) ? cleaned : cleaned[0])
  } catch {
    return null
  }
}

const sendQueuedEntry = async (entry: QueuedRequest, headers: Headers) => {
  for (let schemaAttempt = 0; schemaAttempt < 8; schemaAttempt += 1) {
    const response = await fetchWithFallback(new Request(rewriteRequestUrl(replayUrl(entry), transportConfig!.url), {
      method: entry.method,
      headers,
      body: entry.body || undefined,
    }), QUEUE_WRITE_TIMEOUT_MS, transportConfig!.fallback)
    if (response.ok || response.status !== 400 || !entry.body) return response
    const responseText = await response.text()
    const compatibleBody = removeMissingColumnFromQueuedBody(entry.body, responseText)
    if (!compatibleBody) {
      return new Response(responseText, { status: response.status, statusText: response.statusText, headers: response.headers })
    }
    entry.body = compatibleBody
    entry.lastError = undefined
    await runStore(QUEUE_STORE, 'readwrite', store => store.put(entry))
  }
  return new Response(JSON.stringify({ message: 'Schema compatibility retry limit reached' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  })
}

const queuedIdentity = (entry: QueuedRequest) => {
  const source = new URL(entry.url)
  const id = source.searchParams.get('id')
  if (id?.startsWith('eq.')) return { id: id.slice(3) }
  try {
    const parsed = entry.body ? JSON.parse(entry.body) : null
    const row = Array.isArray(parsed) ? parsed[0] : parsed
    if (!row || typeof row !== 'object') return null
    const values = row as Record<string, unknown>
    if (typeof values.id === 'string') return { id: values.id }
    const fields = (conflictFields[entry.table] ?? '').split(',').filter(Boolean)
    if (fields.length && fields.every(field => values[field] !== undefined)) {
      return Object.fromEntries(fields.map(field => [field, values[field]]))
    }
  } catch {
    // A malformed legacy payload must stay visible in the queue for repair.
  }
  return null
}

const verifyQueuedEntry = async (entry: QueuedRequest, headers: Headers) => {
  const identity = queuedIdentity(entry)
  if (!identity || !transportConfig) return false
  const url = new URL(`/rest/v1/${entry.table}`, transportConfig.url)
  url.searchParams.set('select', '*')
  url.searchParams.set('limit', '1')
  Object.entries(identity).forEach(([field, value]) => url.searchParams.set(field, `eq.${String(value)}`))
  const readHeaders = new Headers(headers)
  readHeaders.delete('prefer')
  readHeaders.set('accept', 'application/json')
  const response = await fetchWithTimeout(new Request(url, { headers: readHeaders, cache: 'no-store' }), QUEUE_WRITE_TIMEOUT_MS)
  if (!response.ok) return false
  const rows = await response.json() as Record<string, unknown>[]
  if (entry.method === 'DELETE') return rows.length === 0
  const expected = entry.body ? (Array.isArray(JSON.parse(entry.body)) ? JSON.parse(entry.body)[0] : JSON.parse(entry.body)) : {}
  const row = rows[0]
  return Boolean(row && expected && typeof expected === 'object'
    && Object.entries(expected as Record<string, unknown>).every(([field, value]) => JSON.stringify(row[field]) === JSON.stringify(value)))
}

export const flushOfflineQueue = async () => {
  if (syncPromise) return syncPromise
  syncPromise = (async () => {
    if (!sessionProvider || !isOnline() || !transportConfig || !activeUserId) return 0
    const session = await sessionProvider()
    if (!session.userId || !session.accessToken || session.userId !== activeUserId) return 0
    const entries = (await getAllByIndex<QueuedRequest>(QUEUE_STORE, 'userId', session.userId).catch(() => []))
      .sort((a, b) => a.createdAt - b.createdAt)
    emitStatus({ online: true, pending: entries.length, syncing: entries.length > 0 })
    let synced = 0
    const blockedEntities = new Set<string>()
    let transportFailures = 0

    for (const entry of entries.slice(0, 50)) {
      const entityKey = queuedEntityKey(entry)
      if (blockedEntities.has(entityKey) || blockedEntities.has(`${entry.table}:*`)) continue
      try {
        const currentSession = await sessionProvider()
        if (currentSession.userId !== session.userId || !currentSession.accessToken) break
        const headers = new Headers(entry.headers)
        headers.set('authorization', `Bearer ${currentSession.accessToken}`)
        headers.set('apikey', transportConfig.apiKey)
        if (entry.method === 'POST') {
          const prefer = headers.get('prefer') ?? ''
          if (!prefer.includes('resolution=')) headers.set('prefer', [prefer, 'resolution=merge-duplicates'].filter(Boolean).join(','))
        }
        const response = await sendQueuedEntry(entry, headers)
        if (response.ok) {
          if (await verifyQueuedEntry(entry, headers)) {
            await runStore(QUEUE_STORE, 'readwrite', store => store.delete(entry.id))
            synced += 1
            continue
          }
          entry.attempts += 1
          entry.lastError = 'Сервер не подтвердил итоговую запись. Изменение оставлено в очереди.'
          await runStore(QUEUE_STORE, 'readwrite', store => store.put(entry))
          blockedEntities.add(entityKey)
          continue
        }
        if (response.status === 401 || response.status === 403) {
          entry.attempts += 1
          entry.lastError = `HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`
          await runStore(QUEUE_STORE, 'readwrite', store => store.put(entry))
          break
        }
        if (response.status >= 500) {
          entry.attempts += 1
          entry.lastError = `HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`
          await runStore(QUEUE_STORE, 'readwrite', store => store.put(entry))
          blockedEntities.add(entityKey)
          transportFailures += 1
          if (transportFailures >= 3) break
          continue
        }
        entry.attempts += 1
        entry.lastError = `HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`
        await runStore(QUEUE_STORE, 'readwrite', store => store.put(entry))
        blockedEntities.add(entityKey)
      } catch (error) {
        entry.attempts += 1
        entry.lastError = error instanceof Error ? error.message : String(error)
        await runStore(QUEUE_STORE, 'readwrite', store => store.put(entry)).catch(() => undefined)
        blockedEntities.add(entityKey)
        transportFailures += 1
        if (transportFailures >= 3) break
      }
    }

    const pending = await getOfflineQueueCount(session.userId)
    emitStatus({ online: pending === 0 || synced > 0 ? isOnline() : false, pending, syncing: false, error: pending > 0 && synced === 0 ? 'Синхронизация будет повторена' : undefined })
    if (synced > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lumicrm:data-synced', { detail: { synced, pending } }))
      if (entries.length > 50 && pending > 0) window.setTimeout(() => void flushOfflineQueue(), 250)
    }
    return synced
  })().finally(() => {
    syncPromise = null
  })
  return syncPromise
}

export const configureOfflineSync = (provider: () => Promise<SessionSnapshot>) => {
  sessionProvider = provider
  if (typeof window === 'undefined') return
  const startSync = () => void flushOfflineQueue()
  window.addEventListener('online', startSync)
  window.addEventListener('focus', startSync)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') startSync()
  })
  if (syncTimer === null) syncTimer = window.setInterval(startSync, 30_000)
}
