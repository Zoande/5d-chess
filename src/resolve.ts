import {requiredBoards} from './rules.ts'
import {resolveLive} from './continuous.ts'
import {
  type Board, type Candidate, type Capture, type Coord, type EnPassant, type Order, type Outcome,
  type Piece, type Player, type Resolution, type State, type Universe,
  activation, boardTurn, nextPlayer, boardKey, coordKey, frontier, getBoard, getUniverse, index, isMain,
  moveBudget, pieceAt, playerCount, players, present, promotes, sameBoard, survivors
} from './model.ts'
import {legalMoves, orderKey, routeKey} from './moves.ts'

export function sourceBudget(s: State, from: Coord, orders: readonly Order[]): 'main' | 'optional' | null {
  const u = getUniverse(s, from.u)
  if (!u || frontier(u).t !== from.t || orders.some(o => sameBoard(o.from, from))) return null
  if (s.movement === 'classic' && boardTurn(s, u) !== s.turn) return null
  const t = present(s)
  const main = orders.filter(o => isMain(getUniverse(s, o.from.u)!, t)).length
  if (isMain(u, t)) return main < moveBudget(s).main ? 'main' : null
  return orders.length - main < 1 ? 'optional' : null
}

function validate(s: State, orders: readonly Order[]) {
  const rejected: Resolution['rejected'] = []
  const valid: Candidate[] = []
  const sorted = [...orders].sort((a, b) => {
    const x = orderKey(a), y = orderKey(b)
    return x < y ? -1 : x > y ? 1 : 0
  })
  if (survivors(s).length <= 1) return {valid, rejected: sorted.map(order => ({order, reason: 'Game over'}))}
  const geometric: Candidate[] = []
  for (const order of sorted) {
    const source = getUniverse(s, order.from.u)
    if (s.movement === 'classic' && (order.player !== s.turn || !source || boardTurn(s, source) !== order.player)) {
      rejected.push({order, reason: 'This faction does not own the board turn'}); continue
    }
    const piece = pieceAt(s, order.from)
    const move = piece?.player === order.player && legalMoves(s, order.from, order.to)
    const match = move && move.find(m => routeKey(m.route) === routeKey(order.route))
    if (match) geometric.push(match)
    else rejected.push({order, reason: 'Illegal move on the frozen snapshot'})
  }

  const t = present(s)
  const limits = moveBudget(s)
  for (const player of players(s)) {
    const own = geometric.filter(o => o.player === player)
    const counts = new Map<string, number>()
    for (const o of own) counts.set(boardKey(o.from), (counts.get(boardKey(o.from)) ?? 0) + 1)
    const distinct = own.filter(order => {
      if (counts.get(boardKey(order.from)) === 1) return true
      rejected.push({order, reason: 'Multiple orders from the same source board'})
      return false
    })
    const groups = Object.groupBy(distinct, o => isMain(getUniverse(s, o.from.u)!, t) ? 'main' : 'optional')
    for (const key of ['main', 'optional'] as const) {
      const group = groups[key] ?? []
      if (group.length <= limits[key]) valid.push(...group)
      else for (const order of group) rejected.push({order, reason: `Too many ${key} orders`})
    }
  }
  return {valid, rejected}
}

interface Leg { from: Coord; to: Coord; piece: Piece }
const legs = (m: Candidate): readonly Leg[] => m.castle ? [m, m.castle] : [m]

/** Intersect destination claims, then propagate failed departures to a fixed point. */
function determine(s: State, candidates: Candidate[]): Outcome[] {
  const outcomes: Outcome[] = candidates.map(move => ({move, status: 'applied', captures: []}))
  const claims = new Map<string, Outcome[]>()
  const departures = new Map<string, Outcome>()
  for (const out of outcomes) {
    for (const leg of legs(out.move)) {
      departures.set(coordKey(leg.from), out)
      if (out.move.branch) continue
      const key = coordKey(leg.to)
      const group = claims.get(key)
      if (group) group.push(out)
      else claims.set(key, [out])
    }
  }
  for (const group of claims.values()) {
    if (group.length > 1) for (const out of group) out.status = 'contested'
  }

  // The greatest surviving set permits closed swaps and cycles. An enemy that
  // fails to leave is a capture, while a friendly piece is an unresolved block.
  let changed = true
  while (changed) {
    changed = false
    for (const out of outcomes) {
      if (out.status !== 'applied' || out.move.branch) continue
      if (legs(out.move).some(leg => {
        const key = coordKey(leg.to)
        return pieceAt(s, leg.to)?.player === leg.piece.player && departures.get(key)?.status !== 'applied'
      })) {
        out.status = 'blocked'
        changed = true
      }
    }
  }
  return outcomes
}

interface Draft {
  t: number
  cells: (Piece | null)[]
  enPassant: EnPassant[]
  turn?: Player
}

function resolveFrozen(s: State, valid: Candidate[], rejected: Resolution['rejected']): Resolution {
  if (survivors(s).length <= 1) return {state: s, outcomes: [], rejected, eliminated: []}
  const outcomes = determine(s, valid)
  const applied = outcomes.filter(o => o.status === 'applied')
  const drafts = new Map<number, Draft>()
  const branches: Universe[] = []
  const rifts = [...s.rifts]
  const round = s.round + 1
  const dead = new Set<Player>()

  function clone(board: Board): Draft {
    return {turn: board.turn, t: board.t + 1, cells: board.cells.map(p => p && !s.eliminated.includes(p.player) ? p : null),
      enPassant: []}
  }
  function advance(c: Pick<Coord, 'u' | 't'>): Draft {
    const existing = drafts.get(c.u)
    if (existing) return existing
    const draft = clone(getBoard(s, c)!)
    drafts.set(c.u, draft)
    return draft
  }
  function take(out: Outcome, at: Coord, target: Piece | null) {
    if (!target || target.player === out.move.player) return
    const capture: Capture = {at, piece: target}
    out.captures.push(capture)
    if (target.kind === 'K') dead.add(target.player)
  }
  const t = present(s)
  for (const u of s.universes) if (s.movement !== 'classic' && isMain(u, t)) advance({u: u.id, t})

  for (const out of applied) {
    for (const leg of legs(out.move)) {
      const draft = advance(leg.from)
      draft.cells[index(leg.from)] = null
      if (s.movement === 'classic') draft.turn = nextPlayer(s, out.move.player)
    }
  }

  // All captures inspect the post-departure, pre-arrival positions. En passant
  // must never capture a new arrival that enters its victim square.
  const arrivals: {draft: Draft; leg: Leg}[] = []
  const epClears: {draft: Draft; at: Coord}[] = []
  let nextId = Math.max(...s.universes.map(u => u.id)) + 1
  for (const out of applied) {
    const m = out.move
    let draft: Draft
    if (m.branch) {
      draft = clone(getBoard(s, m.to)!)
      if (s.movement === 'classic') draft.turn = nextPlayer(s, m.player)
      const id = nextId++
      branches.push({id, parent: m.to.u, divergence: m.to.t, creator: m.player, created: s.round,
        active: false, boards: [draft]})
      out.branch = id
      if (m.from.u !== m.to.u) rifts.push({a: m.from.u, b: id, usableFrom: round})
    } else {
      draft = advance(m.to)
    }
    for (const leg of legs(m)) {
      const at = {...leg.to, u: out.branch ?? leg.to.u, t: draft.t}
      take(out, at, draft.cells[index(leg.to)])
      arrivals.push({draft, leg})
    }
    if (m.enPassant) {
      const victim = draft.cells[index(m.enPassant)]
      take(out, {...m.enPassant, t: draft.t}, victim)
      epClears.push({draft, at: m.enPassant})
    }
  }
  for (const {draft, at} of epClears) draft.cells[index(at)] = null
  for (const {draft, leg} of arrivals) {
    const {from, to, piece} = leg
    const kind = piece.kind === 'P' && promotes(piece.player, to, s) ? 'Q' : piece.kind
    draft.cells[index(to)] = {...piece, moved: true, kind}
    if (kind === 'P' && sameBoard(from, to) && Math.abs(from.x - to.x) + Math.abs(from.y - to.y) === 2 &&
      (from.x === to.x || from.y === to.y)) {
      draft.enPassant.push({square: {x: to.x, y: to.y}, crossed: {x: (from.x + to.x) / 2, y: (from.y + to.y) / 2}, round})
    }
  }

  const eliminated = players(s).filter(p => dead.has(p))
  const allDead = players(s).filter(p => dead.has(p) || s.eliminated.includes(p))
  for (const draft of [...drafts.values(), ...branches.map(u => u.boards[0] as Draft)]) {
    for (let i = 0; i < draft.cells.length; i++) {
      const p = draft.cells[i]
      if (p && dead.has(p.player)) draft.cells[i] = null
    }
    draft.enPassant = draft.enPassant.filter(e => draft.cells[index(e.square)]?.kind === 'P')
  }
  const advanced = s.universes.map(u => {
    const board = drafts.get(u.id)
    return board ? {...u, boards: [...u.boards, board]} : u
  })
  return {state: {...s, ...(s.movement === 'classic' ? {turn: nextPlayer({...s, eliminated: allDead}, s.turn!)} : {}), playerCount: playerCount(s), round, universes: activation([...advanced, ...branches], allDead, playerCount(s)), rifts, eliminated: allDead},
    outcomes, rejected, eliminated}
}

export function resolveRound(s: State, orders: readonly Order[], options: {partial?: boolean} = {}): Resolution {
  const {valid, rejected} = validate(s, orders)
  if (survivors(s).length <= 1) return {state: s, outcomes: [], rejected, eliminated: []}
  if (s.movement && !options.partial) {
    for (const player of s.movement === 'classic' ? [s.turn!] : survivors(s)) {
      for (const from of requiredBoards(s, player, valid)) rejected.push({order: {player, from, to: from, route: [from.u]}, reason: 'A move is required on every playable Present board'})
    }
  }
  if (s.movement && rejected.length) return {state: s, outcomes: [], rejected, eliminated: []}
  return s.movement === 'live' ? resolveLive(s, valid, rejected) : resolveFrozen(s, valid, rejected)
}
