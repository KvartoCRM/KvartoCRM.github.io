import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const script = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
const origin = 'https://kvartocrm.github.io'

function harness() {
  const listeners = {}
  const context = {
    URL,
    self: { location: { origin }, addEventListener: (name, listener) => { listeners[name] = listener } },
    caches: { match: async () => undefined, open: async () => ({ put() {} }) },
    fetch: async () => ({ ok: true, clone() { return this } }),
  }
  vm.runInNewContext(script, context)
  return listeners.fetch
}

test('service worker never caches authenticated API or network diagnostics', () => {
  const handle = harness()
  for (const path of ['/auth/v1/user', '/rest/v1/tasks', '/storage/v1/object/private/file', '/realtime/v1/websocket', '/functions/v1/send', '/__health?bytes=65536', '/network-check.html']) {
    handle({
      request: { url: origin + path, method: 'GET', mode: 'navigate' },
      respondWith() { assert.fail('Unexpected cache interception: ' + path) },
    })
  }
})

test('service worker still handles the application shell', async () => {
  const handle = harness()
  let response
  handle({
    request: { url: origin + '/work?view=tasks', method: 'GET', mode: 'navigate' },
    respondWith(value) { response = value },
    waitUntil() {},
  })
  assert.equal((await response).ok, true)
})
