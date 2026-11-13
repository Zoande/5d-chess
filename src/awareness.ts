import {type Candidate, type Coord, type Order, type Player, type State, boardKey, coordKey, frontier, pieceAt, squares} from './model.ts'
import {legalMoves, orderKey} from './moves.ts'
import {resolveRound, sourceBudget} from './resolve.ts'
export interface Threat {king: Coord; attacker: Coord; move: Candidate}
const checkCache = new WeakMap<State, Map<Player, Threat[]>>()
/** Check is advisory. Historical kings and dimensional routes use the same legal geometry as captures. */
export function checks(s: State, player: Player): Threat[] {
  let cache = checkCache.get(s)
  if (!cache) { cache = new Map(); checkCache.set(s, cache) }
  const cached = cache.get(player)
  if (cached) return cached
  const kings = s.universes.flatMap(u => u.boards.flatMap(b => squares(s).flatMap(square => {
    const at = {...square, u: u.id, t: b.t}, piece = pieceAt(s, at)
    return piece?.player === player && piece.kind === 'K' ? [at] : []
  })))
  const result: Threat[] = []
  for (const u of s.universes) for (const square of squares(s)) {
    const attacker = {...square, u: u.id, t: frontier(u).t}, piece = pieceAt(s, attacker)
    if (!piece || piece.player === player) continue
    for (const king of kings) for (const move of legalMoves(s, attacker, king)) result.push({king, attacker, move})
  }
  cache.set(player, result)
  return result
}
export function playableBoards(s: State, player: Player, orders: readonly Order[]): Coord[] {
  return s.universes.flatMap(u => {
    const from = {u: u.id, t: frontier(u).t, x: 0, y: 0}
    if (!sourceBudget(s, from, orders)) return []
    for (const square of squares(s)) {
      const c = {...from, ...square}
      if (pieceAt(s, c)?.player === player && legalMoves(s, c).length) return [c]
    }
    return []
  })
}
const plans = new WeakMap<State, Map<string, ReturnType<typeof analyze>>>()
function analyze(s: State, player: Player, orders: readonly Order[]) {
  const threats = checks(s, player)
  const projected = orders.length ? resolveRound(s, orders, {partial: true}).state : s
  return {threats, remaining: checks(projected, player), playable: playableBoards(s, player, orders)}
}
export function awareness(s: State, player: Player, orders: readonly Order[]) {
  let cache = plans.get(s)
  if (!cache) { cache = new Map(); plans.set(s, cache) }
  const key = player + orders.map(orderKey).join('|')
  let result = cache.get(key)
  if (!result) { result = analyze(s, player, orders); cache.set(key, result) }
  return result
}
export const threatSquares = (threats: readonly Threat[]) => new Set(threats.flatMap(t => [coordKey(t.king), coordKey(t.attacker)]))
export function nextPlayable(scene: {focusBoard(u: number, t: number): void}, boards: readonly Coord[], used?: Coord) {
  const next = boards.find(c => !used || boardKey(c) !== boardKey(used))
  if (next) scene.focusBoard(next.u, next.t)
}
