import {type Candidate, type Coord, type State, type Universe, SIZE, boardBounds, boardKey, frontier} from './model.ts'

export interface Point {x: number; y: number}
export interface BoardNode extends Point {u: Universe; t: number; size: number; front: boolean}
export const BOARD = 448, TIME = 616, ROW = 568
export function layoutOf(s: State) {
  const kids = Map.groupBy(s.universes, u => u.parent)
  const rows = new Map<number, number>()
  const stack = [...(kids.get(null) ?? [])].reverse()
  while (stack.length) {
    const u = stack.pop()!
    rows.set(u.id, rows.size)
    for (const child of [...(kids.get(u.id) ?? [])].reverse()) stack.push(child)
  }
  const nodes = new Map<string, BoardNode>()
  let maxTime = 0
  for (const u of s.universes) {
    const end = frontier(u).t
    maxTime = Math.max(maxTime, end)
    for (const b of u.boards) nodes.set(boardKey({u: u.id, t: b.t}),
      {u, t: b.t, x: b.t * TIME, y: rows.get(u.id)! * ROW, size: b.t === end ? BOARD : BOARD * .85, front: b.t === end})
  }
  return {rows, nodes, width: maxTime * TIME, height: (rows.size - 1) * ROW}
}
export type Layout = ReturnType<typeof layoutOf>
export function dimensions(s: State, size = BOARD) {
  const bounds = boardBounds(s), tile = size / SIZE
  return {...bounds, tile, width: (bounds.maxX - bounds.minX + 1) * tile, height: (bounds.maxY - bounds.minY + 1) * tile}
}
export function squarePoint(s: State, c: Coord, layout = layoutOf(s)): Point {
  const d = dimensions(s, layout.nodes.get(boardKey(c))?.size ?? BOARD)
  return {x: c.t * TIME + (c.x - d.minX + .5) * d.tile - d.width / 2,
    y: (layout.rows.get(c.u) ?? 0) * ROW + (c.y - d.minY + .5) * d.tile - d.height / 2}
}
/** The renderer and simulation consume this exact polyline in world pixels. */
export function moveGeometry(s: State, move: Candidate) {
  const layout = layoutOf(s)
  const points = move.path.map(c => squarePoint(s, c, layout))
  return points.map((point, i) => ({point, distance: i ? Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y) : 0,
    dimensional: !!i && (move.path[i].u !== move.path[i - 1].u || move.path[i].t !== move.path[i - 1].t)}))
}
