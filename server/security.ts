import type {IncomingMessage} from 'node:http'
import {scryptSync, timingSafeEqual, createHash} from 'node:crypto'
import type {UnitOfWork} from './storage.ts'
import {fail} from './http.ts'

const cookieName = 'multiverse_session'
export function hash(secret: string, salt: string): string {return scryptSync(secret, salt, 64).toString('hex')}
export function verify(secret: string, salt: string, expected: string): boolean {
  const a = Buffer.from(hash(secret, salt), 'hex'), b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
export function tokenHash(token: string): string {return createHash('sha256').update(token).digest('hex')}
export function sessionToken(req: IncomingMessage): string | undefined {
  return req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length+1)
}
export function user(unit: UnitOfWork, req: IncomingMessage): string | undefined {
  const token = sessionToken(req)
  if (!token) return undefined
  const login = unit.session(tokenHash(token))
  return login && login.expires > Date.now() ? login.user : undefined
}
export function sessionCookie(req: IncomingMessage, token: string): string {
  const secure = req.headers['x-forwarded-proto'] === 'https' || (req.socket as {encrypted?: boolean}).encrypted
  return `${cookieName}=${token}; Path=/; Max-Age=${30*86400}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}
export const clearSessionCookie = `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
type FailedLogin = {count: number; until: number}
export class LoginLimiter {
  private attempts = new Map<string, FailedLogin>()
  check(req: IncomingMessage, name: string) {
    if (this.attempts.size > 10_000) for (const [key, value] of this.attempts) if (value.until <= Date.now()) this.attempts.delete(key)
    const key = `${req.socket.remoteAddress}:${name.toLowerCase()}`, current = this.attempts.get(key)
    if (current && current.until > Date.now() && current.count >= 10) fail(429, 'Too many login attempts. Try again later')
    return {key, current}
  }
  failed(key: string, current?: FailedLogin): void {
    const count = current && current.until > Date.now() ? current.count+1 : 1
    this.attempts.set(key, {count, until: Date.now()+15*60_000})
  }
  succeeded(key: string): void {this.attempts.delete(key)}
}
