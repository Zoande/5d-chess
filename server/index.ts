import {ensureAccount,profile,notify,startRatings,settleRatings,gameNotices,type Account,type RatedRoom} from './accounts.ts'
import {AVATARS,POOLS,poolFor,type Preferences} from '../src/account-model.ts'
import {requiredBoards} from '../src/rules.ts'
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto'
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises'
import {resolve, extname} from 'node:path'
import {initialState, playerCount, players, survivors, type Order, type Player, type PlayerCount, type State, type Resolution, type Movement, shuffledPlayers, PLAYERS} from '../src/model.ts'
import {legalMoves, routeKey} from '../src/moves.ts'
import {resolveRound, sourceBudget} from '../src/resolve.ts'

type User = Account
type Login = {user: string; expires: number}
type Room = {code: string; title: string; owner: string; password?: string; salt?: string;
  seats: Partial<Record<Player, string>>; state: State; journal: Order[][]; results: Resolution[];
  locked: Partial<Record<Player, Order[]>>; created: number} & RatedRoom
type Database = {users: User[]; logins: Record<string, Login>; rooms: Room[]}
const file = resolve(process.env.DATA_DIR || 'data', 'multiplayer.json')
const staticRoot = resolve('dist/chess')
const port = Number(process.env.PORT || 4174)
const host = process.env.HOST || '127.0.0.1'
const cookieName = 'multiverse_session'
const maxGames = 50
const maxBody = 32_768
const failedLogins = new Map<string, {count: number; until: number}>()
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
type Reply = {status: number; value: unknown; headers?: Record<string, string>}
async function mutation(res: ServerResponse, work: () => Reply) {
  const reply = await mutate(work)
  json(res, reply.status, reply.value, reply.headers)
}
function fail(status: number, message: string): never { throw Object.assign(new Error(message), {status}) }
function hash(secret: string, salt: string) { return scryptSync(secret, salt, 64).toString('hex') }
function verify(secret: string, salt: string, expected: string) {
  const a = Buffer.from(hash(secret, salt), 'hex'), b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
function loginLimit(req: IncomingMessage, name: string) {
  if (failedLogins.size > 10_000) {
    for (const [candidate, record] of failedLogins) if (record.until <= Date.now()) failedLogins.delete(candidate)
  }
  const key = `${req.socket.remoteAddress}:${name.toLowerCase()}`
  const current = failedLogins.get(key)
  if (current && current.until > Date.now() && current.count >= 10) fail(429, 'Too many login attempts. Try again later')
  return {key, current}
}
function loginFailed(key: string, current?: {count: number; until: number}) {
  const count = current && current.until > Date.now() ? current.count + 1 : 1
  failedLogins.set(key, {count, until: Date.now() + 15 * 60_000})
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
function passwordValue(value: unknown, optional = false) {
  if (optional && (value === '' || value == null)) return undefined
  if (typeof value !== 'string' || !value.length || value.length > 256) fail(400, 'Invalid password')
  return value
}
function roomView(room: Room, viewer: string) {
  const seat = PLAYERS.find(player => room.seats[player] === viewer)
  const active = survivors(room.state)
  return {code: room.code, title: room.title, seats: room.seats, seat, state: room.state,
    journal: room.journal, results: room.results, locked: Object.fromEntries(PLAYERS.map(p => [p, !!room.locked[p]])),
    waiting: Object.keys(room.seats).length < playerCount(room.state), finished: active.length <= 1, created: room.created, rated: !!room.rated, ratingChanges: room.ratingChanges}
}
function summary(room: Room) {
  return {code: room.code, title: room.title, players: Object.keys(room.seats).length,
    maxPlayers: playerCount(room.state), protected: !!room.password, movement: room.state.movement ?? 'legacy', rated: !!room.rated, turn: room.state.turn, round: room.state.round, finished: survivors(room.state).length <= 1}
}
function orders(value: unknown, seat: Player, state: State): Order[] {
  if (!Array.isArray(value) || value.length > (state.movement ? Math.min(512, state.universes.length + 1) : 5)) fail(400, 'Invalid orders')
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
async function api(req: IncomingMessage, res: ServerResponse, path: string, search = new URLSearchParams()) {
  const method = req.method || 'GET'
  if (method !== 'GET') {
    const origin = req.headers.origin
    const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host
    if (origin && new URL(origin).host !== forwardedHost) fail(403, 'Cross-origin request denied')
  }
  if (path === '/api/me' && method === 'GET') { const name = user(req); return json(res, 200, {user: name ?? null, profile: name ? profile(db.users.find(a=>a.name===name)!) : null}) }
  if (path === '/api/signup' && method === 'POST') {
    const data = await body(req)
    const name = string(data.username, 'username', 32)
    const password = passwordValue(data.password)!
    if (password !== data.confirm) fail(400, 'Passwords do not match')
    return mutation(res, () => {
      if (db.users.some(u => u.name.toLowerCase() === name.toLowerCase())) fail(409, 'Username already taken')
      const salt = randomBytes(16).toString('hex'), token = randomBytes(32).toString('hex')
      db.users.push({name, salt, hash: hash(password, salt)})
      db.logins[tokenHash(token)] = {user: name, expires: Date.now() + 30 * 86400_000}
      return {status: 201, value: {user: name}, headers: {'set-cookie': sessionCookie(req, token)}}
    })
  }
  if (path === '/api/login' && method === 'POST') {
    const data = await body(req)
    const name = string(data.username, 'username', 32), password = passwordValue(data.password)!
    const limit = loginLimit(req, name)
    return mutation(res, () => {
      const account = db.users.find(u => u.name.toLowerCase() === name.toLowerCase())
      if (!account) { loginFailed(limit.key, limit.current); fail(404, 'Account not found') }
      if (!verify(password, account.salt, account.hash)) { loginFailed(limit.key, limit.current); fail(401, 'Incorrect password') }
      failedLogins.delete(limit.key)
      const token = randomBytes(32).toString('hex')
      db.logins[tokenHash(token)] = {user: account.name, expires: Date.now() + 30 * 86400_000}
      return {status: 200, value: {user: account.name}, headers: {'set-cookie': sessionCookie(req, token)}}
    })
  }
  if (path === '/api/logout' && method === 'POST') return mutation(res, () => {
    const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
    if (token) delete db.logins[tokenHash(token)]
    return {status: 200, value: {ok: true}, headers: {'set-cookie': `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`}}
  })
  const me = requireUser(req)
  const account = ensureAccount(db.users.find(a=>a.name===me)!)
  if (path === '/api/settings' && method === 'POST') {
    const data=await body(req)
    if (!AVATARS.includes(data.avatar as Preferences['avatar']) || !['classic','live'].includes(data.movement as string) ||
      ![2,3,4].includes(data.players as number) || typeof data.moveNotifications !== 'boolean') fail(400,'Invalid settings')
    return mutation(res,()=>{account.settings={avatar:data.avatar as Preferences['avatar'],movement:data.movement as Movement,players:data.players as PlayerCount,moveNotifications:data.moveNotifications as boolean};return {status:200,value:{profile:profile(account)}}})
  }
  if (path === '/api/notifications' && method === 'GET') return json(res,200,{items:account.notifications,unread:account.notifications.filter(n=>!n.read).length})
  if (path === '/api/notifications/read' && method === 'POST') {
    const data=await body(req)
    if (data.all !== true && (!Array.isArray(data.ids) || data.ids.length>100 || data.ids.some(id=>typeof id!=='string'||! /^[a-f0-9]{24}$/.test(id)))) fail(400,'Invalid notification selection')
    return mutation(res,()=>{const ids=new Set((data.ids??[]) as string[]);for(const n of account.notifications)if(data.all===true||ids.has(n.id))n.read=true;return {status:200,value:{items:account.notifications,unread:account.notifications.filter(n=>!n.read).length}}})
  }
  if (path === '/api/leaderboard' && method === 'GET') {
    const selected=search.get('pool')??poolFor(account.settings.movement,account.settings.players)
    if (!POOLS.includes(selected as typeof POOLS[number])) fail(400,'Invalid rating pool')
    const pool=selected as typeof POOLS[number]
    const rows=db.users.map(a=>{const p=profile(a);return {name:p.name,avatar:p.settings.avatar,rating:Math.round(p.ratings[pool].value),games:p.ratings[pool].games}}).filter(a=>a.games>0).sort((a,b)=>b.rating-a.rating||a.name.localeCompare(b.name))
    return json(res,200,{pool,players:rows.slice(0,10).map((p,i)=>({...p,rank:i+1})),me:{name:me,rating:Math.round(account.ratings[pool].value),games:account.ratings[pool].games,rank:rows.findIndex(a=>a.name===me)+1||null}})
  }
  if (path === '/api/games' && method === 'GET') return json(res, 200, {
    available: db.rooms.filter(r => !r.password && Object.keys(r.seats).length < playerCount(r.state) && survivors(r.state).length > 1).map(summary),
    mine: db.rooms.filter(r => Object.values(r.seats).includes(me)).map(r=>{const seat=players(r.state).find(p=>r.seats[p]===me)!;return {...summary(r),myTurn:Object.keys(r.seats).length===playerCount(r.state)&&survivors(r.state).includes(seat)&&!r.locked[seat]&&(r.state.movement!=='classic'||r.state.turn===seat)}}), limit: maxGames})
  if (path === '/api/games' && method === 'POST') {
    const data = await body(req)
    const title = string(data.title || `${me}'s game`, 'game name', 60)
    const password = passwordValue(data.password, true)
    if (data.playerCount !== undefined && ![2, 3, 4].includes(data.playerCount as number)) fail(400, 'Invalid player count')
    const count = (data.playerCount ?? 4) as PlayerCount
    if (data.movement !== undefined && !['classic', 'live'].includes(data.movement as string)) fail(400, 'Invalid movement mode')
    const movement = data.movement as Movement | undefined
    if (data.rated !== undefined && typeof data.rated!=='boolean') fail(400,'Invalid rated setting')
    if (data.rated && !movement) fail(400,'Rated games require a movement mode')
    return mutation(res, () => {
      if (db.rooms.filter(r => survivors(r.state).length > 1).length >= maxGames) fail(409, '50 active games already exist')
      let code = ''
      do { code = Array.from(randomBytes(4), b => String.fromCharCode(65 + b % 26)).join('') }
      while (db.rooms.some(r => r.code === code))
      const salt = password ? randomBytes(16).toString('hex') : undefined
      const room: Room = {code, title, owner: me, password: password && salt ? hash(password, salt) : undefined,
        salt, rated: data.rated === true && !password, seats: {red: me}, state: initialState(count, movement, movement === 'classic' ? shuffledPlayers(count) : undefined), journal: [], results: [], locked: {}, created: Date.now()}
      db.rooms.push(room)
      return {status: 201, value: roomView(room, me)}
    })
  }
  const match = /^\/api\/games\/([A-Z]{4})(?:\/(join|orders))?$/.exec(path)
  if (!match) fail(404, 'Not found')
  const room = db.rooms.find(r => r.code === match[1]) ?? fail(404, 'Game not found')
  if (match[2] === 'join' && method === 'POST') {
    const data = await body(req)
    return mutation(res, () => {
      if (Object.values(room.seats).includes(me)) return {status: 200, value: roomView(room, me)}
      if (Object.keys(room.seats).length >= playerCount(room.state)) fail(409, 'Game is full')
      if (room.password && (!room.salt || typeof data.password !== 'string' || !verify(data.password, room.salt, room.password))) fail(403, 'Incorrect game password')
      const seat = players(room.state).find(p => !room.seats[p])!
      const existing=Object.values(room.seats)
      room.seats[seat] = me
      startRatings(room,db.users)
      for(const name of existing){const target=db.users.find(a=>a.name===name);if(target)notify(target,{kind:'join',code:room.code,title:`${me} joined`,detail:`${room.title}: ${Object.keys(room.seats).length}/${playerCount(room.state)} seats filled.`})}
      if (Object.keys(room.seats).length===playerCount(room.state)) gameNotices(room,db.users,me,true)
      return {status: 200, value: roomView(room, me)}
    })
  }
  if (!Object.values(room.seats).includes(me)) fail(403, 'Join this game first')
  if (match[2] === 'orders' && method === 'POST') {
    const data = await body(req)
    return mutation(res, () => {
      if (Object.keys(room.seats).length < playerCount(room.state)) fail(409, `Waiting for ${playerCount(room.state)} players`)
      const seat = PLAYERS.find(p => room.seats[p] === me)!
      if (survivors(room.state).length <= 1) fail(409,'This game has finished')
      if (!survivors(room.state).includes(seat)) fail(409, 'Your faction is eliminated')
      if (room.locked[seat]) fail(409, 'Orders already locked')
      if (room.state.movement === 'classic' && room.state.turn !== seat) fail(409, 'It is another player’s turn')
      const checked = orders(data.orders, seat, room.state)
      if (requiredBoards(room.state, seat, checked).length) fail(400, 'Play every required Present board first')
      const alive = survivors(room.state)
      const locks = {...room.locked, [seat]: checked}
      if (room.state.movement === 'classic' || alive.every(p => locks[p])) {
        const batch = room.state.movement === 'classic' ? checked : alive.flatMap(p => locks[p] || [])
        const result = resolveRound(room.state, batch)
        if (result.rejected.length) fail(400, result.rejected[0].reason)
        room.state = result.state
        room.journal.push(batch)
        room.results.push(result)
        room.locked = {}
        settleRatings(room,db.users)
        gameNotices(room,db.users,me,true)
      } else {room.locked = locks;gameNotices(room,db.users,me,false)}
      return {status: 200, value: roomView(room, me)}
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
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml'}
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
    res.writeHead(200, {'content-type': types[extname(name)] || 'application/octet-stream',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"})
    res.end(req.method === 'HEAD' ? undefined : data)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail(404, 'Not found')
    throw error
  }
}
createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const path = url.pathname
    if (path.startsWith('/api/')) await api(req, res, path,url.searchParams)
    else await staticFile(req, res, path)
  } catch (error) {
    const status = (error as {status?: number}).status || 500
    json(res, status, {error: status === 500 ? 'Internal server error' : (error as Error).message})
    if (status === 500) console.error(error)
  }
}).listen(port, host, () => console.log(`Multiverse server · http://${host}:${port}/chess/`))
