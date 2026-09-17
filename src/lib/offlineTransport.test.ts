import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  filterRowsForUrl,
  clearWorkspaceNetworkRefresh,
  isWorkspaceNetworkRefreshForced,
  mergeRemoteRowsWithQueuedMutations,
  orderEndpointsForOrigin,
  prepareOfflinePayload,
  requestWorkspaceNetworkRefresh,
  removeMissingColumnFromQueuedBody,
  rewriteRequestUrl,
} from './offlineTransport.ts'

test('manual workspace refresh temporarily forces cloud reads', () => {
  clearWorkspaceNetworkRefresh()
  assert.equal(isWorkspaceNetworkRefreshForced(), false)
  requestWorkspaceNetworkRefresh(10_000)
  assert.equal(isWorkspaceNetworkRefreshForced(), true)
  clearWorkspaceNetworkRefresh()
  assert.equal(isWorkspaceNetworkRefreshForced(), false)
})

test('Supabase requests keep their path and query when routed through the gateway', () => {
  assert.equal(
    rewriteRequestUrl(
      'https://flwsglkkarikekkopdbu.supabase.co/rest/v1/tasks?user_id=eq.u1&select=*',
      'https://lumicrm-gateway.denzotrail.workers.dev',
    ),
    'https://lumicrm-gateway.denzotrail.workers.dev/rest/v1/tasks?user_id=eq.u1&select=*',
  )
})

test('a legacy gateway configuration can prefer its same-origin endpoint', () => {
  assert.deepEqual(
    orderEndpointsForOrigin('https://worker.example', 'https://lumicrm.pages.dev', 'https://lumicrm.pages.dev'),
    ['https://lumicrm.pages.dev', 'https://worker.example'],
  )
})

test('a legacy gateway configuration keeps its primary outside Pages', () => {
  assert.deepEqual(
    orderEndpointsForOrigin('https://worker.example', 'https://lumicrm.pages.dev', 'https://kvartocrm.github.io'),
    ['https://worker.example', 'https://lumicrm.pages.dev'],
  )
  assert.deepEqual(
    orderEndpointsForOrigin('https://worker.example', 'https://lumicrm.pages.dev', 'https://localhost'),
    ['https://worker.example', 'https://lumicrm.pages.dev'],
  )
})

test('production uses the Cloudflare gateway first on GitHub, Pages and packaged apps', () => {
  const config = readFileSync(new URL('../../.env.production', import.meta.url), 'utf8')
  const primary = config.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1].trim()
  const fallback = config.match(/^VITE_SUPABASE_FALLBACK_URL=(.+)$/m)?.[1].trim()
  assert.equal(primary, 'https://lumicrm-gateway.denzotrail.workers.dev')
  assert.equal(fallback, 'https://flwsglkkarikekkopdbu.supabase.co')
  for (const origin of ['https://kvartocrm.github.io', 'https://lumicrm.pages.dev', 'https://localhost', 'capacitor://localhost', 'null']) {
    assert.deepEqual(orderEndpointsForOrigin(primary!, fallback, origin), [primary, fallback])
  }
  assert.match(config, /^VITE_SUPABASE_PROJECT_REF=flwsglkkarikekkopdbu\s*$/m)
})

test('offline cache applies PostgREST filters, sorting and limits', () => {
  const rows = [
    { id: '1', user_id: 'u1', status: 'active', created_at: '2026-08-01' },
    { id: '2', user_id: 'u1', status: 'archived', created_at: '2026-08-03' },
    { id: '3', user_id: 'u1', status: 'active', created_at: '2026-08-02' },
    { id: '4', user_id: 'u2', status: 'active', created_at: '2026-08-04' },
  ]
  const result = filterRowsForUrl(rows, 'https://example.test/rest/v1/properties?user_id=eq.u1&status=eq.active&order=created_at.desc&limit=1')
  assert.deepEqual(result.map(row => row.id), ['3'])
})

test('offline cache excludes archived rows and supports JSON contains filters', () => {
  const rows = [
    { id: '1', status: 'available', metadata: { kind: 'property_showing' } },
    { id: '2', status: 'archived', metadata: { kind: 'property_showing' } },
    { id: '3', status: 'available', metadata: { kind: 'call' } },
  ]
  const result = filterRowsForUrl(rows, 'https://example.test/rest/v1/properties?status=neq.archived&metadata=cs.%7B%22kind%22%3A%22property_showing%22%7D')
  assert.deepEqual(result.map(row => row.id), ['1'])
})

test('offline inserts receive durable client identifiers', () => {
  const prepared = prepareOfflinePayload('properties', { user_id: 'u1', address: 'Курск' }) as Record<string, unknown>
  assert.match(String(prepared.id), /^[0-9a-f-]{36}$/)
  assert.equal(prepared.address, 'Курск')
  assert.equal(prepared.deleted_at, null)
})

test('offline property shares receive both id and public slug', () => {
  const prepared = prepareOfflinePayload('property_shares', { user_id: 'u1' }) as Record<string, unknown>
  assert.match(String(prepared.id), /^[0-9a-f-]{36}$/)
  assert.match(String(prepared.slug), /^[0-9a-f-]{36}$/)
})

test('offline cache supports trash, text search and combined OR search', () => {
  const rows = [
    { id: '1', deleted_at: null, first_name: 'Анна', phone: '79000000001' },
    { id: '2', deleted_at: '2026-08-19T10:00:00Z', first_name: 'Борис', phone: '79000000002' },
  ]
  const active = filterRowsForUrl(rows, 'https://example.test/rest/v1/clients?deleted_at=is.null&first_name=ilike.%25%D0%B0%D0%BD%25')
  assert.deepEqual(active.map(row => row.id), ['1'])
  const trash = filterRowsForUrl(rows, 'https://example.test/rest/v1/clients?deleted_at=not.is.null')
  assert.deepEqual(trash.map(row => row.id), ['2'])
  const search = filterRowsForUrl(rows, 'https://example.test/rest/v1/clients?or=(first_name.ilike.%25%D0%B1%D0%BE%D1%80%25,phone.eq.79000000001)')
  assert.deepEqual(search.map(row => row.id), ['1', '2'])
})

test('remote rows stay fresh while pending local task changes remain visible', () => {
  const requestUrl = 'https://example.test/rest/v1/tasks?user_id=eq.u1&deleted_at=is.null&order=due_date.asc'
  const merged = mergeRemoteRowsWithQueuedMutations(
    [{ id: 'remote', user_id: 'u1', title: 'С другого устройства', deleted_at: null, due_date: '2026-09-15' }],
    [{
      table: 'tasks',
      method: 'POST',
      url: 'https://example.test/rest/v1/tasks',
      body: JSON.stringify({ id: 'local', user_id: 'u1', title: 'С этого устройства', deleted_at: null, due_date: '2026-09-14' }),
      createdAt: 1,
    }],
    'tasks',
    requestUrl,
  )
  assert.deepEqual(merged.map(row => row.id), ['local', 'remote'])
})

test('queue replay removes an unsupported optional column and keeps identity fields', () => {
  const body = JSON.stringify({ id: 'task-1', user_id: 'u1', title: 'Задача', smart_criteria: {} })
  const error = JSON.stringify({ message: "Could not find the 'smart_criteria' column of 'tasks' in the schema cache" })
  assert.deepEqual(JSON.parse(removeMissingColumnFromQueuedBody(body, error)!), {
    id: 'task-1',
    user_id: 'u1',
    title: 'Задача',
  })
  assert.equal(removeMissingColumnFromQueuedBody(body, JSON.stringify({ message: "Could not find the 'id' column" })), null)
})
