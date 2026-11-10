import {readFile} from 'node:fs/promises'

const token = process.env.CLOUDFLARE_API_TOKEN
if (!token) throw new Error('Set CLOUDFLARE_API_TOKEN with Workers Scripts Edit and Workers Routes Edit.')
const config = JSON.parse(await readFile(new URL('../cloudflare-deploy.json', import.meta.url), 'utf8'))
const source = await readFile(new URL('../.cloudflare/worker.mjs', import.meta.url), 'utf8')
const routePath = `/zones/${config.zoneId}/workers/routes`
const scriptPath = `/accounts/${config.accountId}/workers/scripts/${config.script}`

async function request(method, path, body) {
  const headers = {Authorization: `Bearer ${token}`}
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  }
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {method, headers, body})
  const envelope = await response.json()
  if (!response.ok || !envelope.success) {
    throw new Error(`${method} ${path}: ${response.status} ${envelope.errors?.map(e => e.message).join(', ') || ''}`)
  }
  return envelope.result
}

const routes = await request('GET', routePath)
for (const route of routes) {
  const hostnameAndPath = route.pattern.replace(/^https?:\/\//, '')
  if (hostnameAndPath === '316123.nl/chess' || hostnameAndPath.startsWith('316123.nl/chess/')) {
    if (route.script !== config.script) throw new Error(`Existing route belongs to a different Worker: ${route.pattern}`)
  }
}

const upload = new FormData()
upload.set('metadata', new Blob([JSON.stringify({main_module: 'worker.mjs',
  compatibility_date: config.compatibilityDate})], {type: 'application/json'}))
upload.set('worker.mjs', new Blob([source], {type: 'application/javascript+module'}), 'worker.mjs')
await request('PUT', scriptPath, upload)
await request('POST', `${scriptPath}/subdomain`, {enabled: false, previews_enabled: false})
for (const pattern of config.routes) {
  if (!routes.some(r => r.pattern === pattern && r.script === config.script)) {
    await request('POST', routePath, {pattern, script: config.script})
  }
}
console.log('Deployed https://316123.nl/chess/')
