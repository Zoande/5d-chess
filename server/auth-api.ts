import {randomBytes} from 'node:crypto'
import type {IncomingMessage} from 'node:http'
import type {UnitOfWork} from './storage.ts'
import type {Reply} from './model.ts'
import {ensureAccount, profile} from './accounts.ts'
import {string, passwordValue, fail} from './http.ts'
import {user, hash, verify, tokenHash, sessionToken, sessionCookie, clearSessionCookie, type LoginLimiter} from './security.ts'

export function authApi(unit: UnitOfWork, req: IncomingMessage, path: string, data: Record<string, unknown>, limiter: LoginLimiter): Reply | undefined {
  const method = req.method || 'GET'
  if (path === '/api/me' && method === 'GET') {
    const name = user(unit, req)
    return {status: 200, value: {user: name ?? null, profile: name ? profile(unit.users.get(name)!) : null}}
  }
  if (path === '/api/signup' && method === 'POST') {
    const name = string(data.username, 'username', 32), password = passwordValue(data.password)!
    if (password !== data.confirm) fail(400, 'Passwords do not match')
    if (unit.findAccount(name)) fail(409, 'Username already taken')
    const salt = randomBytes(16).toString('hex'), token = randomBytes(32).toString('hex')
    unit.users.add(name, ensureAccount({name, salt, hash: hash(password, salt)}))
    unit.putSession(tokenHash(token), {user: name, expires: Date.now()+30*86400_000})
    return {status: 201, value: {user: name}, headers: {'set-cookie': sessionCookie(req, token)}}
  }
  if (path === '/api/login' && method === 'POST') {
    const name = string(data.username, 'username', 32), password = passwordValue(data.password)!
    const limit = limiter.check(req, name), account = unit.findAccount(name)
    if (!account) {limiter.failed(limit.key, limit.current); fail(404, 'Account not found')}
    if (!verify(password, account.salt, account.hash)) {limiter.failed(limit.key, limit.current); fail(401, 'Incorrect password')}
    limiter.succeeded(limit.key)
    const token = randomBytes(32).toString('hex')
    unit.putSession(tokenHash(token), {user: account.name, expires: Date.now()+30*86400_000})
    return {status: 200, value: {user: account.name}, headers: {'set-cookie': sessionCookie(req, token)}}
  }
  if (path === '/api/logout' && method === 'POST') {
    const token = sessionToken(req)
    if (token) unit.deleteSession(tokenHash(token))
    return {status: 200, value: {ok: true}, headers: {'set-cookie': clearSessionCookie}}
  }
}
