import {randomBytes} from 'node:crypto'
import {type Order, type Player, type State, type PlayerCount, type Movement, initialState, playerCount, players, survivors, shuffledPlayers, PLAYERS} from '../src/model.ts'
import {requiredBoards} from '../src/rules.ts'
import {legalMoves, routeKey} from '../src/moves.ts'
import {resolveRound, sourceBudget} from '../src/resolve.ts'
import {wallet} from './economy.ts'
import {startRatings, settleRatings, gameNotices, notify} from './accounts.ts'
import {hash, verify} from './security.ts'
import {fail, string, passwordValue} from './http.ts'
import type {Room, Reply} from './model.ts'
import type {ChessStore, UnitOfWork} from './storage.ts'

const maxGames = 50
function roomAccounts(unit: UnitOfWork, room: Room) {
  return [...new Set(Object.values(room.seats))].map(name => unit.users.get(name!)!)
}

function roomView(unit: UnitOfWork, room: Room, viewer: string) {
  const seat = PLAYERS.find(player => room.seats[player] === viewer)
  const active = survivors(room.state)
  return {code: room.code, title: room.title, seats: room.seats, seat, state: room.state,
    journal: room.journal, results: room.results, locked: Object.fromEntries(PLAYERS.map(p => [p, !!room.locked[p]])),
    waiting: Object.keys(room.seats).length < playerCount(room.state), finished: active.length <= 1, created: room.created, rated: !!room.rated, ratingChanges: room.ratingChanges,cosmetics:Object.fromEntries(Object.entries(room.seats).map(([p,name])=>[p,structuredClone(wallet(unit.users.get(name!)!).loadout)]))}
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

export function gameApi(store: ChessStore, unit: UnitOfWork, me: string, path: string, method: string, data: Record<string, unknown>): Reply | undefined {
  if (!path.startsWith('/api/games')) return
  if (path === '/api/games' && method === 'GET') return {status: 200, value: {available: store.availableRooms(), mine: store.memberRooms(me), limit: maxGames}}
  if (path === '/api/games' && method === 'POST') {
    const title = string(data.title || `${me}'s game`, 'game name', 60)
    const password = passwordValue(data.password, true)
    if (data.playerCount !== undefined && ![2, 3, 4].includes(data.playerCount as number)) fail(400, 'Invalid player count')
    const count = (data.playerCount ?? 4) as PlayerCount
    if (data.movement !== undefined && !['classic', 'live'].includes(data.movement as string)) fail(400, 'Invalid movement mode')
    const movement = data.movement as Movement | undefined
    if (data.rated !== undefined && typeof data.rated!=='boolean') fail(400,'Invalid rated setting')

    if (store.activeRooms() >= maxGames) fail(409, '50 active games already exist')
    let code = ''
    do { code = Array.from(randomBytes(4), b => String.fromCharCode(65 + b % 26)).join('') }
    while (!!unit.rooms.get(code))
    const salt = password ? randomBytes(16).toString('hex') : undefined
    const room: Room = {code, title, owner: me, password: password && salt ? hash(password, salt) : undefined,
      salt, rated: true, seats: {red: me}, state: initialState(count, movement, movement === 'classic' ? shuffledPlayers(count) : undefined), journal: [], results: [], locked: {}, created: Date.now()}
    unit.rooms.add(room.code,room)
    return {status: 201, value: roomView(unit,room,me)}
  }
  const match = /^\/api\/games\/([A-Z]{4})(?:\/(join|orders))?$/.exec(path)
  if (!match) fail(404, 'Not found')
  const room = unit.rooms.get(match[1]) ?? fail(404, 'Game not found')
  if (match[2] === 'join' && method === 'POST') {
    if (Object.values(room.seats).includes(me)) return {status: 200, value: roomView(unit,room,me)}
    if (Object.keys(room.seats).length >= playerCount(room.state)) fail(409, 'Game is full')
    if (room.password && (!room.salt || typeof data.password !== 'string' || !verify(data.password, room.salt, room.password))) fail(403, 'Incorrect game password')
    const seat = players(room.state).find(p => !room.seats[p])!
    const existing=Object.values(room.seats)
    room.seats[seat] = me
    startRatings(room,roomAccounts(unit,room))
    for(const name of existing){const target=unit.users.get(name!);if(target)notify(target,{kind:'join',code:room.code,title:`${me} joined`,detail:`${room.title}: ${Object.keys(room.seats).length}/${playerCount(room.state)} seats filled.`})}
    if (Object.keys(room.seats).length===playerCount(room.state)) gameNotices(room,roomAccounts(unit,room),me,true)
    return {status: 200, value: roomView(unit,room,me)}
  }
  if (!Object.values(room.seats).includes(me)) fail(403, 'Join this game first')
  if (match[2] === 'orders' && method === 'POST') {
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
      settleRatings(room,roomAccounts(unit,room))
      gameNotices(room,roomAccounts(unit,room),me,true)
    } else {room.locked = locks;gameNotices(room,roomAccounts(unit,room),me,false)}
    return {status: 200, value: roomView(unit,room,me)}
  }
  if (!match[2] && method === 'GET') return {status: 200, value: roomView(unit,room,me)}
  fail(405, 'Method not allowed')
}
