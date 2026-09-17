import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const assetsDir = path.resolve('dist', 'assets')
const files = (await readdir(assetsDir)).filter(file => file.endsWith('.js'))
const runtime = (await Promise.all(files.map(file => readFile(path.join(assetsDir, file), 'utf8')))).join('\n')

const requiredGatewayHost = 'lumicrm-gateway.denzotrail.workers.dev'
const requiredDirectHost = 'flwsglkkarikekkopdbu.supabase.co'
const requiredSiteHost = 'kvartocrm.github.io'
const forbiddenRuntimeHosts = [
  'lumicrm.pages.dev',
  'lumi-crm.github.io',
]

if (!runtime.includes(requiredGatewayHost)) {
  throw new Error(`Production runtime does not contain the Cloudflare gateway: ${requiredGatewayHost}`)
}

if (!runtime.includes(requiredDirectHost)) {
  throw new Error(`Production runtime does not contain the direct fallback host: ${requiredDirectHost}`)
}

if (!runtime.includes(requiredSiteHost)) {
  throw new Error(`Production runtime does not contain the KvartoCRM site host: ${requiredSiteHost}`)
}

for (const host of forbiddenRuntimeHosts) {
  if (runtime.includes(host)) throw new Error(`Production runtime still depends on blocked host: ${host}`)
}

console.log(`Production network verified: gateway ${requiredGatewayHost}, fallback ${requiredDirectHost}, site ${requiredSiteHost}.`)
