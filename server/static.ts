import type {IncomingMessage, ServerResponse} from 'node:http'
import {readFile} from 'node:fs/promises'
import {resolve, extname, sep} from 'node:path'
import {fail} from './http.ts'

const staticRoot = resolve('dist/chess')
const types: Record<string, string> = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml'}
export async function staticFile(req: IncomingMessage, res: ServerResponse, path: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') fail(405, 'Method not allowed')
  if (path === '/') { res.writeHead(302, {location: '/chess/'}).end(); return }
  if (!path.startsWith('/chess/')) fail(404, 'Not found')
  const name = path.slice('/chess/'.length) || 'index.html'
  if (!/^[a-zA-Z0-9._/-]+$/.test(name) || name.split('/').includes('..')) fail(404, 'Not found')
  const absolute = resolve(staticRoot, name)
  if (!absolute.startsWith(staticRoot + sep) && absolute !== staticRoot) fail(404, 'Not found')
  try {
    const data = await readFile(absolute)
    res.writeHead(200, {'content-type': types[extname(name)] || 'application/octet-stream',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"})
    res.end(req.method === 'HEAD' ? undefined : data)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail(404, 'Not found')
    throw error
  }
}
