import {type Coord, type Order, type Player, type Resolution, type State, PLAYERS, initialState, inside, survivors} from './model.ts'
import {resolveRound, sourceBudget} from './resolve.ts'
import {legalMoves, routeKey} from './moves.ts'

export const SAVE_KEY = 'four-player-multiverse-chess/v1'
export interface Session {
  frames: State[]
  results: Resolution[]
  journal: Order[][]
  locked: Order[][]
  draft: Order[]
}
export const newSession = (): Session => ({frames: [initialState()], results: [], journal: [], locked: [], draft: []})
export const liveState = (s: Session) => s.frames[s.frames.length - 1]
export const planner = (s: Session) => survivors(liveState(s))[s.locked.length]

const cleanCoord = ({x, y, u, t}: Coord): Coord => ({x, y, u, t})
const cleanOrder = ({player, from, to, route}: Order): Order =>
  ({player, from: cleanCoord(from), to: cleanCoord(to), route: [...route]})
export function commit(s: Session): Resolution | undefined {
  s.locked.push(s.draft.map(cleanOrder))
  s.draft = []
  if (planner(s)) return
  const orders = s.locked.flat()
  const result = resolveRound(liveState(s), orders)
  s.journal.push(orders)
  s.results.push(result)
  s.frames.push(result.state)
  s.locked = []
  return result
}

export const encode = (s: Session) => JSON.stringify({
  format: SAVE_KEY, journal: s.journal, locked: s.locked, draft: s.draft.map(cleanOrder)
})
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
function coord(v: unknown): Coord {
  if (!isObject(v) || !natural(v.x) || !natural(v.y) || !natural(v.u) || !natural(v.t) ||
    !inside({x: v.x, y: v.y})) throw new Error('Invalid board coordinate')
  return {x: v.x, y: v.y, u: v.u, t: v.t}
}
function orders(v: unknown, limit: number): Order[] {
  if (!Array.isArray(v) || v.length > limit) throw new Error('Invalid order list')
  return v.map(o => {
    if (!isObject(o) || !PLAYERS.includes(o.player as Player) || !Array.isArray(o.route) ||
      !o.route.length || !o.route.every(natural)) throw new Error('Invalid order')
    return {player: o.player as Player, from: coord(o.from), to: coord(o.to), route: [...o.route]}
  })
}
function checkPlan(s: State, moves: Order[], player: Player | undefined) {
  const checked: Order[] = []
  for (const move of moves) {
    if (move.player !== player || !sourceBudget(s, move.from, checked) ||
      !legalMoves(s, move.from, move.to).some(m => m.player === player && routeKey(m.route) === routeKey(move.route))) {
      throw new Error('Invalid pending plan')
    }
    checked.push(move)
  }
}

export function decode(text: string): Session {
  const raw: unknown = JSON.parse(text)
  if (!isObject(raw) || raw.format !== SAVE_KEY || !Array.isArray(raw.journal) ||
    !Array.isArray(raw.locked) || !Array.isArray(raw.draft)) throw new Error('Unsupported save format')
  const s = newSession()
  for (const row of raw.journal) {
    const snapshot = liveState(s)
    if (survivors(snapshot).length <= 1) throw new Error('Orders after the game ended')
    const batch = orders(row, 20)
    const result = resolveRound(snapshot, batch)
    if (result.rejected.length) throw new Error(`Invalid orders in round ${snapshot.round}`)
    s.journal.push(batch)
    s.results.push(result)
    s.frames.push(result.state)
  }
  const current = liveState(s)
  const alive = survivors(current)
  if (raw.locked.length >= alive.length && (raw.locked.length || alive.length > 1)) {
    throw new Error('Too many locked plans')
  }
  if (alive.length <= 1 && (raw.locked.length || raw.draft.length)) throw new Error('Orders after the game ended')
  s.locked = raw.locked.map((v, i) => {
    const batch = orders(v, 5)
    checkPlan(current, batch, alive[i])
    return batch
  })
  s.draft = orders(raw.draft, 5)
  checkPlan(current, s.draft, alive[s.locked.length])
  return s
}
