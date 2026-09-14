import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequest as handlePagesRequest } from './pages.js'
import { handleGatewayRequest } from './worker.js'

const gateway = 'https://lumicrm-gateway.denzotrail.workers.dev'
const origin = 'https://kvartocrm.github.io'
const pagesOrigin = 'https://lumicrm.pages.dev'

test('network probes return bounded incompressible data without upstream access', async () => {
  for (const size of [1024, 65536]) {
    const response = await handleGatewayRequest(new Request(`${gateway}/__health?bytes=${size}`, { headers: { origin } }), () => { throw new Error('No upstream allowed') })
    assert.equal(response.status, 200)
    assert.equal((await response.arrayBuffer()).byteLength, size)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
    assert.equal(response.headers.get('cache-control'), 'no-store, no-transform')
  }
  for (const size of ['-1', '100000000', 'NaN', '']) {
    assert.equal((await handleGatewayRequest(new Request(`${gateway}/__health?bytes=${size}`))).status, 400)
  }
})

test('Pages adapter exposes the gateway on the application origin', async () => {
  const response = await handlePagesRequest({ request: new Request(`${pagesOrigin}/__health`) })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, service: 'KvartoCRM gateway' })
  assert.equal(response.headers.get('x-lumicrm-gateway'), 'cloudflare')
})

test('gateway rejects host-switch, encoded separator and admin routes without forwarding credentials', async () => {
  for (const path of ['//attacker.example/rest/v1/tasks', '/storage%2fv1/object/x', '/auth/v1/admin/users', '/unknown', '/rest/v1/../../../admin']) {
    let calls = 0
    const response = await handleGatewayRequest(new Request(gateway + path, { headers: { authorization: 'Bearer private' } }), async () => { calls++; return new Response('bad') })
    assert.equal(response.status, 404, path)
    assert.equal(calls, 0, path)
  }
})

test('gateway forwards bearer credentials only to the fixed upstream, without cookies and caching', async () => {
  let forwarded
  let options
  const response = await handleGatewayRequest(new Request(`${gateway}/rest/v1/tasks?select=id`, {
    method: 'POST', body: '{"id":"task"}', headers: { origin, authorization: 'Bearer example', apikey: 'public', cookie: 'session=private', 'content-type': 'application/json' },
  }), async (request, init) => {
    forwarded = request; options = init
    return new Response('[]', { headers: { 'access-control-allow-origin': '*', 'set-cookie': 'secret=value', 'content-range': '0-0/*' } })
  })
  assert.equal(forwarded.url, 'https://flwsglkkarikekkopdbu.supabase.co/rest/v1/tasks?select=id')
  assert.equal(await forwarded.text(), '{"id":"task"}')
  assert.equal(forwarded.headers.get('authorization'), 'Bearer example')
  assert.equal(forwarded.headers.get('cookie'), null)
  assert.equal(options.redirect, 'manual')
  assert.equal(response.headers.get('access-control-allow-origin'), origin)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('content-range'), '0-0/*')
})

test('gateway permits native origins and rejects foreign browser origins before upstream work', async () => {
  for (const value of [origin, pagesOrigin, 'https://localhost', 'null']) {
    const response = await handleGatewayRequest(new Request(`${gateway}/rest/v1/tasks`, {
      method: 'OPTIONS',
      headers: {
        origin: value,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'apikey,authorization,content-profile,content-type,x-client-info',
      },
    }))
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), value)
    const allowedHeaders = response.headers.get('access-control-allow-headers')
    assert.match(allowedHeaders, /accept-profile/)
    assert.match(allowedHeaders, /content-profile/)
  }
  const response = await handleGatewayRequest(new Request(`${gateway}/rest/v1/tasks`, { headers: { origin: 'https://attacker.example' } }), () => { throw new Error('Must not fetch') })
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})

test('gateway bounds declared uploads, rejects invalid upgrades and redacts upstream errors', async () => {
  const tooLarge = await handleGatewayRequest(new Request(`${gateway}/storage/v1/object/crm-documents/test`, { method: 'POST', body: 'x', headers: { 'content-length': String(27 * 1024 * 1024) } }))
  assert.equal(tooLarge.status, 413)
  const upgrade = await handleGatewayRequest(new Request(`${gateway}/rest/v1/tasks`, { headers: { upgrade: 'websocket' } }))
  assert.equal(upgrade.status, 400)
  const error = await handleGatewayRequest(new Request(`${gateway}/auth/v1/health`), async () => { throw new Error('Authorization: Bearer private') })
  assert.equal(error.status, 502)
  assert.doesNotMatch(await error.text(), /private/)
})

test('gateway rewrites only redirects whose parsed origin matches upstream', async () => {
  for (const [location, expected] of [
    ['https://flwsglkkarikekkopdbu.supabase.co/auth/v1/verify?token=t', `${gateway}/auth/v1/verify?token=t`],
    ['https://flwsglkkarikekkopdbu.supabase.co.attacker.example/', 'https://flwsglkkarikekkopdbu.supabase.co.attacker.example/'],
  ]) {
    const response = await handleGatewayRequest(new Request(`${gateway}/auth/v1/verify`), async () => new Response(null, { status: 302, headers: { location } }))
    assert.equal(response.headers.get('location'), expected)
  }
})
