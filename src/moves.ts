import {
  type Board, type Candidate, type Coord, type Order, type Piece, type State, type Square,
  FORWARD, SQUARES, coordKey, frontier, getBoard, getUniverse, home, inside, offset, pieceAt, sameBoard
} from './model.ts'

interface Route { nodes: number[]; rift: boolean }
const riftPieces = new Set(['Q', 'B', 'N'])

/** Enumerate all topologically shortest routes. A Rift can be traversed in either direction. */
export function shortestRoutes(s: State, start: number, canRift: boolean): Map<number, Route[]> {
  const edges = new Map(s.universes.map(u => [u.id, [] as {to: number; rift: boolean}[]]))
  const link = (a: number, b: number, rift: boolean) => {
    edges.get(a)?.push({to: b, rift})
    edges.get(b)?.push({to: a, rift})
  }
  for (const u of s.universes) if (u.parent !== null) link(u.id, u.parent, false)
  if (canRift) for (const r of s.rifts) if (r.usableFrom <= s.round) link(r.a, r.b, true)

  const routes = new Map<number, Route[]>()
  const best = new Map<string, number>([[`${start}:false`, 1]])
  const queue: Route[] = [{nodes: [start], rift: false}]
  for (let i = 0; i < queue.length; i++) {
    const route = queue[i]
    const end = route.nodes.at(-1)!
    const existing = routes.get(end)
    if (!existing) routes.set(end, [route])
    else if (existing[0].nodes.length === route.nodes.length) existing.push(route)

    for (const edge of edges.get(end) ?? []) {
      if ((edge.rift && route.rift) || route.nodes.includes(edge.to)) continue
      const rift = route.rift || edge.rift
      const key = `${edge.to}:${rift}`
      const length = route.nodes.length + 1
      if ((best.get(key) ?? Infinity) < length) continue
      best.set(key, length)
      queue.push({nodes: [...route.nodes, edge.to], rift})
    }
  }
  return routes
}

function candidate(s: State, from: Coord, to: Coord, piece: Piece, route: Route, path: Coord[]): Candidate | undefined {
  const u = getUniverse(s, to.u)!
  const branch = frontier(u).t !== to.t
  const target = pieceAt(s, to)
  const needsVacancy = target?.player === piece.player
  if (needsVacancy && (branch || sameBoard(from, to))) return
  return {player: piece.player, piece, from, to, route: route.nodes, path, rift: route.rift,
    branch, needsVacancy, capture: !!target && !needsVacancy}
}

function pawn(
  s: State, from: Coord, to: Coord, piece: Piece, route: Route, dest: Board
): Candidate | undefined {
  const f = FORWARD[piece.player]
  const x = to.x - from.x, y = to.y - from.y, t = to.t - from.t
  const u = route.nodes.length - 1
  const forward = x * f.x + y * f.y
  const sideways = Math.abs(x * f.y - y * f.x)
  const target = pieceAt(s, to)
  const max = piece.moved ? 1 : 2
  const down = route.nodes.slice(1).every((id, i) => getUniverse(s, id)?.parent === route.nodes[i])
  const path = [from]
  let ep: Coord | undefined

  if (!t && !u && !sideways && forward >= 1 && forward <= max && !target) {
    if (forward === 2) {
      const middle = {...from, ...offset(from, f)}
      if (!inside(middle) || pieceAt(s, middle)) return
      path.push(middle)
    }
  } else if (!t && !x && !y && down && u >= 1 && u <= max && !target) {
    if (u === 2) {
      const middle = {...from, u: route.nodes[1]}
      if (!getBoard(s, middle) || pieceAt(s, middle)) return
      path.push(middle)
    }
  } else if (!t && !u && forward === 1 && sideways === 1) {
    if (target?.player === piece.player) return
    if (!target) {
      const mark = dest.enPassant.find(e => e.round === s.round && e.crossed.x === to.x && e.crossed.y === to.y &&
        Math.abs(e.square.x - from.x) + Math.abs(e.square.y - from.y) === 1 &&
        pieceAt(s, {...from, ...e.square})?.kind === 'P' &&
        pieceAt(s, {...from, ...e.square})?.player !== piece.player)
      if (!mark) return
      ep = {...from, ...mark.square}
    }
  } else if (!(u === 1 && down && !x && !y && Math.abs(t) === 1 && target && target.player !== piece.player)) {
    return
  }
  const move = candidate(s, from, to, piece, route, [...path, to])
  if (move && ep) {
    move.enPassant = ep
    move.capture = true
  }
  return move
}

function castle(s: State, from: Coord, to: Coord, piece: Piece, route: Route): Candidate | undefined {
  const start = home(piece.player, 4)
  if (piece.moved || start.x !== from.x || start.y !== from.y || !sameBoard(from, to)) return
  for (const side of [-1, 1]) {
    const end = home(piece.player, 4 + side * 2)
    if (end.x !== to.x || end.y !== to.y) continue
    const rookFile = side < 0 ? 0 : 7
    const rookFrom = {...from, ...home(piece.player, rookFile)}
    const rook = pieceAt(s, rookFrom)
    if (rook?.kind !== 'R' || rook.player !== piece.player || rook.moved) continue
    const between = []
    for (let f = 4 + side; f !== rookFile; f += side) between.push({...from, ...home(piece.player, f)})
    if (between.some(c => pieceAt(s, c))) continue
    return {...candidate(s, from, to, piece, route, [from, between[0], to])!,
      castle: {from: rookFrom, to: between[0], piece: rook}}
  }
}

function testRoute(s: State, from: Coord, to: Coord, piece: Piece, route: Route, board: Board) {
  if (piece.kind === 'P') return pawn(s, from, to, piece, route, board)
  const dx = to.x - from.x, dy = to.y - from.y, dt = to.t - from.t, du = route.nodes.length - 1
  const axes = [Math.abs(dx), Math.abs(dy), Math.abs(dt), du].filter(Boolean).sort((a, b) => a - b)
  if (!axes.length) return
  if (piece.kind === 'K') {
    if (axes.at(-1) === 1) return candidate(s, from, to, piece, route, [from, to])
    return castle(s, from, to, piece, route)
  }
  if (piece.kind === 'N') {
    if (axes.length === 2 && axes[0] === 1 && axes[1] === 2) {
      // Intermediate route nodes are display-only for a knight's jump.
      const path = route.nodes.length === 3
        ? [from, {...from, u: route.nodes[1]}, to] : [from, to]
      return candidate(s, from, to, piece, route, path)
    }
    return
  }
  if ((piece.kind === 'R' && axes.length !== 1) || (piece.kind === 'B' && axes.length !== 2) ||
    axes[0] !== axes.at(-1)) return
  const path = [from]
  for (let i = 1; i < axes[0]; i++) {
    const c = {x: from.x + Math.sign(dx) * i, y: from.y + Math.sign(dy) * i,
      t: from.t + Math.sign(dt) * i, u: du ? route.nodes[i] : from.u}
    if (!inside(c) || !getBoard(s, c) || pieceAt(s, c)) return
    path.push(c)
  }
  return candidate(s, from, to, piece, route, [...path, to])
}

export const routeKey = (r: readonly number[]) => r.join('/')
export const orderKey = (o: Order) => `${o.player}:${coordKey(o.from)}>${coordKey(o.to)}@${routeKey(o.route)}`

export function legalMoves(s: State, from: Coord, target?: Coord): Candidate[] {
  const u = getUniverse(s, from.u)
  const p = pieceAt(s, from)
  if (!u || !p || frontier(u).t !== from.t || (target && !inside(target))) return []
  const out: Candidate[] = []
  const routes = shortestRoutes(s, from.u, riftPieces.has(p.kind))
  for (const [id, paths] of routes) {
    if (target && id !== target.u) continue
    const universe = getUniverse(s, id)!
    const boards = target ? [getBoard(s, target)] : universe.boards
    for (const board of boards) {
      if (!board) continue
      for (const square of target ? [target as Square] : SQUARES) {
        const to = {x: square.x, y: square.y, u: id, t: board.t}
        if (coordKey(from) === coordKey(to)) continue
        for (const path of paths) {
          const move = testRoute(s, from, to, p, path, board)
          if (move) out.push(move)
        }
      }
    }
  }
  return out.sort((a, b) => orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0)
}
