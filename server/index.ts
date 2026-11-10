import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto'
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises'
import {join, resolve, extname} from 'node:path'
import {initialState, survivors, type Order, type Player, type State, type Resolution, PLAYERS} from '../src/model.ts'
import {legalMoves, routeKey} from '../src/moves.ts'
import {resolveRound, sourceBudget} from '../src/resolve.ts'

type User = {name: string; salt: string; hash: string}
type Login = {user: string; expires: number}
type Room = {code: string; title: string; owner: string; password?: string; salt?: string;
  seats: Partial<Record<Player, string>>; state: State; journal: Order[][]; results: Resolution[];
  locked: Partial<Record<Player, Order[]>>; created: number}
type Database = {users: User[]; logins: Record<string, Login>; rooms: Room[]}
const file = resolve(process.env.DATA_DIR || 'data', 'multiplayer.json')
const staticRoot = resolve('dist/chess')
const port = Number(process.env.PORT || 4174)
const host = process.env.HOST || '127.0.0.1'
const cookieName = 'multiverse_session'
const maxGames = 50
const maxBody = 32_768
let db: Database = {users: [], logins: {}, rooms: []}
let queue: Promise<unknown> = Promise.resolve()

try { db = JSON.parse(await readFile(file, 'utf8')) as Database } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}
await mkdir(resolve(file, '..'), {recursive: true})

function save() {
  const temporary = `${file}.${process.pid}.tmp`
  return writeFile(temporary, JSON.stringify(db), {mode: 0o600}).then(() => rename(temporary, file))
}
function mutate<T>(work: () => Promise<T> | T): Promise<T> {
  const run = queue.then(async () => { const result = await work(); await save(); return result })
  queue = run.catch(() => {})
  return run
}
function fail(status: number, message: string): never { throw Object.assign(new Error(message), {status}) }
function hash(secret: string, salt: string) { return scryptSync(secret, salt, 64).toString('hex') }
function verify(secret: string, salt: string, expected: string) {
  const a = Buffer.from(hash(secret, salt), 'hex'), b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex') }
function user(req: IncomingMessage) {
  const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
  if (!token) return undefined
  const login = db.logins[tokenHash(token)]
  return login && login.expires > Date.now() ? login.user : undefined
}
function requireUser(req: IncomingMessage) { return user(req) ?? fail(401, 'Log in first') }
function json(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers})
  res.end(JSON.stringify(value))
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > maxBody) fail(413, 'Request too large')
  }
  try {
    const value: unknown = JSON.parse(text)
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch { /* handled below */ }
  return fail(400, 'Invalid JSON')
}
function string(value: unknown, name: string, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `Invalid ${name}`)
  return value.trim()
}
function roomView(room: Room, viewer: string) {
  const seat = PLAYERS.find(player => room.seats[player] === viewer)
  const active = survivors(room.state)
  return {code: room.code, title: room.title, seats: room.seats, seat, state: room.state,
    journal: room.journal, results: room.results, locked: Object.fromEntries(PLAYERS.map(p => [p, !!room.locked[p]])),
    waiting: Object.keys(room.seats).length < 4, finished: active.length <= 1, created: room.created}
}
function summary(room: Room) {
  return {code: room.code, title: room.title, players: Object.keys(room.seats).length,
    protected: !!room.password, round: room.state.round, finished: survivors(room.state).length <= 1}
}
function orders(value: unknown, seat: Player, state: State): Order[] {
  if (!Array.isArray(value) || value.length > 5) fail(400, 'Invalid orders')
  const checked: Order[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') fail(400, 'Invalid order')
    const order = raw as Order
    if (order.player !== seat || !order.from || !order.to || !Array.isArray(order.route) ||
      !order.route.every(n => Number.isSafeInteger(n) && n >= 0) ||
      !sourceBudget(state, order.from, checked) ||
      !legalMoves(state, order.from, order.to).some(m => m.player === seat && routeKey(m.route) === routeKey(order.route))) {
      fail(400, 'Illegal order')
    }
    checked.push({player: seat, from: order.from, to: order.to, route: [...order.route]})
  }
  return checked
}
async function api(req: IncomingMessage, res: ServerResponse, path: string) {
  const method = req.method || 'GET'
  if (method !== 'GET') {
    const origin = req.headers.origin
    const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host
    if (origin && new URL(origin).host !== forwardedHost) fail(403, 'Cross-origin request denied')
  }
  if (path === '/api/me' && method === 'GET') return json(res, 200, {user: user(req) ?? null})
  if (path === '/api/signup' && method === 'POST') {
    const data = await body(req)
    const name = string(data.username, 'username', 32)
    const password = string(data.password, 'password', 256)
    if (password !== data.confirm) fail(400, 'Passwords do not match')
    return mutate(() => {
      if (db.users.some(u => u.name.toLowerCase() === name.toLowerCase())) fail(409, 'Username already taken')
      const salt = randomBytes(16).toString('hex'), token = randomBytes(32).toString('hex')
      db.users.push({name, salt, hash: hash(password, salt)})
      db.logins[tokenHash(token)] = {user: name, expires: Date.now() + 30 * 86400_000}
      json(res, 201, {user: name}, {'set-cookie': sessionCookie(req, token)})
    })
  }
  if (path === '/api/login' && method === 'POST') {
    const data = await body(req)
    const name = string(data.username, 'username', 32), password = string(data.password, 'password', 256)
    return mutate(() => {
      const account = db.users.find(u => u.name.toLowerCase() === name.toLowerCase())
      if (!account) fail(404, 'Account not found')
      if (!verify(password, account.salt, account.hash)) fail(401, 'Incorrect password')
      const token = randomBytes(32).toString('hex')
      db.logins[tokenHash(token)] = {user: account.name, expires: Date.now() + 30 * 86400_000}
      json(res, 200, {user: account.name}, {'set-cookie': sessionCookie(req, token)})
    })
  }
  if (path === '/api/logout' && method === 'POST') return mutate(() => {
    const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
    if (token) delete db.logins[tokenHash(token)]
    json(res, 200, {ok: true}, {'set-cookie': `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`})
  })
  const me = requireUser(req)
  if (path === '/api/games' && method === 'GET') return json(res, 200, {
    available: db.rooms.filter(r => !r.password && Object.keys(r.seats).length < 4 && survivors(r.state).length > 1).map(summary),
    mine: db.rooms.filter(r => Object.values(r.seats).includes(me)).map(summary), limit: maxGames})
  if (path === '/api/games' && method === 'POST') {
    const data = await body(req)
    const title = string(data.title || `${me}'s game`, 'game name', 60)
    const password = data.password === '' || data.password == null ? undefined : string(data.password, 'password', 256)
    return mutate(() => {
      if (db.rooms.filter(r => survivors(r.state).length > 1).length >= maxGames) fail(409, '50 active games already exist')
      let code = ''
      do { code = Array.from(randomBytes(4), b => String.fromCharCode(65 + b % 26)).join('') }
      while (db.rooms.some(r => r.code === code))
      const salt = password ? randomBytes(16).toString('hex') : undefined
      const room: Room = {code, title, owner: me, password: password && salt ? hash(password, salt) : undefined,
        salt, seats: {red: me}, state: initialState(), journal: [], results: [], locked: {}, created: Date.now()}
      db.rooms.push(room)
      json(res, 201, roomView(room, me))
    })
  }
  const match = /^\/api\/games\/([A-Z]{4})(?:\/(join|orders))?$/.exec(path)
  if (!match) fail(404, 'Not found')
  const room = db.rooms.find(r => r.code === match[1]) ?? fail(404, 'Game not found')
  if (match[2] === 'join' && method === 'POST') {
    const data = await body(req)
    return mutate(() => {
      if (Object.values(room.seats).includes(me)) return json(res, 200, roomView(room, me))
      if (Object.keys(room.seats).length >= 4) fail(409, 'Game is full')
      if (room.password && (!room.salt || typeof data.password !== 'string' || !verify(data.password, room.salt, room.password))) fail(403, 'Incorrect game password')
      const seat = PLAYERS.find(p => !room.seats[p])!
      room.seats[seat] = me
      return json(res, 200, roomView(room, me))
    })
  }
  if (!Object.values(room.seats).includes(me)) fail(403, 'Join this game first')
  if (match[2] === 'orders' && method === 'POST') {
    const data = await body(req)
    return mutate(() => {
      if (Object.keys(room.seats).length < 4) fail(409, 'Waiting for four players')
      const seat = PLAYERS.find(p => room.seats[p] === me)!
      if (!survivors(room.state).includes(seat)) fail(409, 'Your faction is eliminated')
      if (room.locked[seat]) fail(409, 'Orders already locked')
      room.locked[seat] = orders(data.orders, seat, room.state)
      const alive = survivors(room.state)
      if (alive.every(p => room.locked[p])) {
        const batch = alive.flatMap(p => room.locked[p] || [])
        const result = resolveRound(room.state, batch)
        room.state = result.state
        room.journal.push(batch)
        room.results.push(result)
        room.locked = {}
      }
      return json(res, 200, roomView(room, me))
    })
  }
  if (!match[2] && method === 'GET') return json(res, 200, roomView(room, me))
  fail(405, 'Method not allowed')
}
function sessionCookie(req: IncomingMessage, token: string) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || (req.socket as {encrypted?: boolean}).encrypted
  return `${cookieName}=${token}; Path=/; Max-Age=${30 * 86400}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}
const types: Record<string, string> = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml'}
async function staticFile(req: IncomingMessage, res: ServerResponse, path: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') fail(405, 'Method not allowed')
  if (path === '/') { res.writeHead(302, {location: '/chess/'}).end(); return }
  if (!path.startsWith('/chess/')) fail(404, 'Not found')
  const name = path.slice('/chess/'.length) || 'index.html'
  if (!/^[a-zA-Z0-9._/-]+$/.test(name) || name.split('/').includes('..')) fail(404, 'Not found')
  const absolute = resolve(staticRoot, name)
  if (!absolute.startsWith(staticRoot + '/') && absolute !== staticRoot) fail(404, 'Not found')
  try {
    const data = await readFile(absolute)
    res.writeHead(200, {'content-type': types[extname(name)] || 'application/octet-stream', 'cache-control': 'no-store'})
    res.end(req.method === 'HEAD' ? undefined : data)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail(404, 'Not found')
    throw error
  }
}
createServer(async (req, res) => {
  try {
    const path = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname
    if (path.startsWith('/api/')) await api(req, res, path)
    else await staticFile(req, res, path)
  } catch (error) {
    const status = (error as {status?: number}).status || 500
    json(res, status, {error: status === 500 ? 'Internal server error' : (error as Error).message})
    if (status === 500) console.error(error)
  }
}).listen(port, host, () => console.log(`Multiverse server · http://${host}:${port}/chess/`))
