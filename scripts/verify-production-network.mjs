import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const assetsDir = path.resolve('dist', 'assets')
const files = (await readdir(assetsDir)).filter(file => file.endsWith('.js'))
const runtime = (await Promise.all(files.map(file => readFile(path.join(assetsDir, file), 'utf8')))).join('\n')

const requiredDirectHost = 'flwsglkkarikekkopdbu.supabase.co'
const forbiddenRuntimeHosts = [
  'lumicrm-gateway.denzotrail.workers.dev',
  'lumicrm.pages.dev',
]

if (!runtime.includes(requiredDirectHost)) {
  throw new Error(`Production runtime does not contain the direct data host: ${requiredDirectHost}`)
}

for (const host of forbiddenRuntimeHosts) {
  if (runtime.includes(host)) throw new Error(`Production runtime still depends on blocked host: ${host}`)
}

console.log(`Production network verified: direct ${requiredDirectHost}, no Cloudflare runtime dependency.`)
