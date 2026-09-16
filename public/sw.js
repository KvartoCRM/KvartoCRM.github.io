const CACHE_NAME = 'kvartocrm-shell-v47'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/kvarto-icon-192.png', '/kvarto-icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    let generatedAssets = []
    try {
      const response = await fetch('/offline-assets.json', { cache: 'no-store' })
      if (response.ok) generatedAssets = await response.json()
    } catch {
      // The basic app shell is still enough to recover an existing installation.
    }
    await Promise.allSettled([...new Set([...APP_SHELL, ...generatedAssets])].map(path => cache.add(path)))
  })())
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)),
      )),
      self.clients.claim(),
    ]),
  )
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  // Authenticated API caching belongs to the user-scoped offline transport.
  // The diagnostic document must never replace the cached application shell.
  if (/^\/(auth|rest|storage|realtime|functions)\/v1(?:\/|$)/.test(url.pathname)
    || url.pathname === '/__health' || url.pathname === '/network-check.html') return

  const destination = event.request.destination
  const mustRevalidate = event.request.mode === 'navigate'

  if ((destination === 'script' || destination === 'style' || destination === 'image') && new URL(event.request.url).pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request)
      try {
        const response = await fetch(event.request)
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()))
        return response
      } catch {
        if (cached) return cached
        throw new TypeError('Asset is unavailable')
      }
    })())
    return
  }

  if (mustRevalidate) {
    event.respondWith((async () => {
      const cached = await caches.match('/index.html')
      const network = fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('/index.html', response.clone()))
        return response
      })
      if (!cached) return network
      const timeout = new Promise(resolve => setTimeout(() => resolve(cached), 2500))
      event.waitUntil(network.catch(() => undefined))
      return Promise.race([network.catch(() => cached), timeout])
    })())
    return
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy))
      }
      return response
    })),
  )
})

self.addEventListener('push', event => {
  let payload = { title: 'KvartoCRM', body: 'В вашем офисе новое событие', link: '/' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    if (event.data) payload.body = event.data.text()
  }

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/kvarto-icon-192.png',
    badge: '/kvarto-icon-192.png',
    data: { link: payload.link || '/' },
    tag: payload.tag || 'lumicrm-notification',
    timestamp: payload.timestamp || Date.now(),
    requireInteraction: Boolean(payload.requireInteraction),
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const link = event.notification.data?.link || '/'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(openClients => {
    for (const client of openClients) {
      if ('focus' in client) {
        client.navigate(link)
        return client.focus()
      }
    }
    return clients.openWindow(link)
  }))
})
