const UPSTREAM = 'https://flwsglkkarikekkopdbu.supabase.co'
const ALLOWED_ORIGINS = new Set([
  'https://kvartocrm.github.io',
  'https://lumi-crm.github.io',
  'https://lumicrm.pages.dev',
  'https://localhost', // Packaged Capacitor Android app.
  'capacitor://localhost',
  'null', // Packaged Electron file:// renderer; CORS is not authentication.
  ...['localhost', '127.0.0.1'].flatMap(host => [3000, 4173, 5173].map(port => `http://${host}:${port}`)),
])
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
// PostgREST adds Accept-Profile on reads and Content-Profile on writes. Both
// must be present here or a browser/WebView rejects the request at preflight.
const ALLOWED_HEADERS = 'accept,accept-profile,authorization,apikey,content-type,content-profile,x-client-info,x-supabase-api-version,prefer,range,range-unit,content-range,x-upsert'
const MAX_BODY_BYTES = 26 * 1024 * 1024

const responseHeaders = (request, headers) => {
  const result = new Headers(headers)
  // Never inherit a permissive upstream CORS policy.
  for (const key of [...result.keys()]) if (key.startsWith('access-control-')) result.delete(key)
  const origin = request.headers.get('origin')
  if (origin && ALLOWED_ORIGINS.has(origin)) result.set('Access-Control-Allow-Origin', origin)
  result.set('Access-Control-Allow-Methods', [...ALLOWED_METHODS].join(','))
  result.set('Access-Control-Allow-Headers', ALLOWED_HEADERS)
  result.set('Access-Control-Expose-Headers', 'content-length,content-range,x-lumicrm-gateway')
  result.set('Access-Control-Max-Age', '86400')
  result.append('Vary', 'Origin')
  result.set('x-lumicrm-gateway', 'cloudflare')
  result.set('cache-control', 'no-store')
  result.set('x-content-type-options', 'nosniff')
  result.set('referrer-policy', 'no-referrer')
  result.delete('set-cookie') // The app uses Supabase bearer tokens, not ambient cookies.
  return result
}

export const handleGatewayRequest = async (request, upstreamFetch = fetch) => {
  const incoming = new URL(request.url)
  const reply = (message, status) => Response.json({ message }, { status, headers: responseHeaders(request) })
  const origin = request.headers.get('origin')
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply('Origin is not allowed', 403)
  if (!ALLOWED_METHODS.has(request.method)) return reply('Method is not allowed', 405)
  if (incoming.pathname === '/__health' && ['GET', 'HEAD'].includes(request.method)) {
    // Bounded synthetic data tests transport beyond a tiny health response.
    // It contains no office data and never contacts Supabase.
    if (incoming.searchParams.has('bytes')) {
      const size = Number(incoming.searchParams.get('bytes'))
      if (![1024, 65536].includes(size)) return reply('Unsupported probe size', 400)
      const bytes = crypto.getRandomValues(new Uint8Array(size))
      const headers = responseHeaders(request, {
        'content-type': 'application/octet-stream',
        'content-length': String(size),
      })
      headers.set('cache-control', 'no-store, no-transform')
      return new Response(request.method === 'HEAD' ? null : bytes, { headers })
    }
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ ok: true, service: 'KvartoCRM gateway' }), {
      headers: responseHeaders(request, { 'content-type': 'application/json' }),
    })
  }
  if (!/^\/(auth|rest|storage|realtime|functions)\/v1(?:\/|$)/.test(incoming.pathname)
    || incoming.pathname.includes('\\') || /%2f|%5c/i.test(incoming.pathname)
    || /^\/auth\/v1\/admin(?:\/|$)/.test(incoming.pathname)) return reply('Route is not allowed', 404)
  if (incoming.href.length > 16_384) return reply('Request URL is too long', 414)
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return reply('Request body is too large', 413)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(request) })

  // A relative URL constructor would accept //another-host and leak forwarded credentials.
  const upstream = new URL(UPSTREAM)
  upstream.pathname = incoming.pathname
  upstream.search = incoming.search

  try {
    const upstreamRequest = new Request(upstream, request)
    for (const key of ['host', 'cookie', 'x-forwarded-host', 'x-forwarded-proto']) upstreamRequest.headers.delete(key)
    const upgrade = request.headers.get('upgrade')?.toLowerCase()
    if (upgrade) {
      if (upgrade !== 'websocket' || incoming.pathname !== '/realtime/v1/websocket' || request.method !== 'GET') {
        return reply('Upgrade is not allowed', 400)
      }
      return await upstreamFetch(upstreamRequest, { redirect: 'manual' })
    }
    const response = await upstreamFetch(upstreamRequest, { redirect: 'manual' })
    const headers = responseHeaders(request, response.headers)
    const location = headers.get('location')
    if (location) {
      const redirect = new URL(location, UPSTREAM)
      if (redirect.origin === UPSTREAM) headers.set('location', `${incoming.origin}${redirect.pathname}${redirect.search}${redirect.hash}`)
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  } catch {
    return reply('KvartoCRM cloud gateway is temporarily unavailable', 502)
  }
}

export default { fetch: request => handleGatewayRequest(request) }
