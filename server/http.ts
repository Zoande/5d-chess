import type {IncomingMessage, ServerResponse} from 'node:http'

export function fail(status: number, message: string): never {throw Object.assign(new Error(message), {status})}
export function json(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers})
  res.end(JSON.stringify(value))
}
export async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += bytes.length
    if (length > 32_768) fail(413, 'Request too large')
    chunks.push(bytes)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch { /* return the same client-facing validation error */ }
  return fail(400, 'Invalid JSON')
}
export function string(value: unknown, name: string, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `Invalid ${name}`)
  return value.trim()
}
export function passwordValue(value: unknown, optional = false): string | undefined {
  if (optional && (value === '' || value == null)) return undefined
  if (typeof value !== 'string' || !value.length || value.length > 256) fail(400, 'Invalid password')
  return value
}
export function checkOrigin(req: IncomingMessage): void {
  if (req.method === 'GET' || req.method === 'HEAD') return
  const origin = req.headers.origin
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host
  if (origin && new URL(origin).host !== forwardedHost) fail(403, 'Cross-origin request denied')
}
