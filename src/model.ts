export const PLAYERS = ['red', 'blue', 'yellow', 'green'] as const
export const KINDS = ['K', 'Q', 'R', 'B', 'N', 'P'] as const
export type Player = typeof PLAYERS[number]
export type PlayerCount = 2 | 3 | 4
export const modePlayers = (count: PlayerCount): readonly Player[] => count === 2 ? ['red', 'yellow'] :
  count === 3 ? ['red', 'blue', 'yellow'] : PLAYERS
export type Kind = typeof KINDS[number]

export interface Square { x: number; y: number }
export interface Coord extends Square { u: number; t: number }
export interface Piece { readonly player: Player; readonly kind: Kind; readonly moved: boolean }
export interface EnPassant { readonly square: Square; readonly crossed: Square; readonly round: number }
export interface Board {
  readonly t: number
  readonly cells: readonly (Piece | null)[]
  readonly enPassant: readonly EnPassant[]
}
export interface Universe {
  readonly id: number
  readonly parent: number | null
  readonly divergence: number
  readonly creator: Player | null
  readonly created: number
  readonly active: boolean
  readonly boards: readonly Board[]
}
export interface Rift { readonly a: number; readonly b: number; readonly usableFrom: number }
export interface State {
  readonly playerCount?: PlayerCount
  readonly round: number
  readonly universes: readonly Universe[]
  readonly rifts: readonly Rift[]
  readonly eliminated: readonly Player[]
}
export interface Order { player: Player; from: Coord; to: Coord; route: readonly number[] }
export interface Candidate extends Order {
  piece: Piece
  capture: boolean
  needsVacancy: boolean
  branch: boolean
  rift: boolean
  path: readonly Coord[]
  castle?: { from: Coord; to: Coord; piece: Piece }
  enPassant?: Coord
}
export interface Capture { at: Coord; piece: Piece }
export interface Outcome {
  move: Candidate
  status: 'applied' | 'contested' | 'blocked'
  branch?: number
  captures: Capture[]
}
export interface Resolution {
  state: State
  outcomes: Outcome[]
  rejected: { order: Order; reason: string }[]
  eliminated: Player[]
}

export const SIZE = 14
export const inside = ({x, y}: Square) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < SIZE && y >= 0 && y < SIZE &&
  ((x >= 3 && x <= 10) || (y >= 3 && y <= 10))
export const index = ({x, y}: Square) => y * SIZE + x
export const SQUARES: readonly Square[] = Array.from({length: SIZE ** 2}, (_, i) =>
  ({x: i % SIZE, y: Math.floor(i / SIZE)})).filter(inside)
export const playerCount = (s: State): PlayerCount => s.playerCount ?? 4
export const players = (s: State) => modePlayers(playerCount(s))
export const insideState = (s: State, square: Square) => inside(square) &&
  (playerCount(s) === 4 || (playerCount(s) === 3 ? square.x <= 10 :
    square.x >= 3 && square.x <= 10 && square.y >= 3 && square.y <= 10))
export const squares = (s: State): readonly Square[] => SQUARES.filter(square => insideState(s, square))
export const boardBounds = (s: State) => playerCount(s) === 2 ? {minX: 3, maxX: 10, minY: 3, maxY: 10} :
  playerCount(s) === 3 ? {minX: 0, maxX: 10, minY: 0, maxY: 13} :
    {minX: 0, maxX: 13, minY: 0, maxY: 13}
export const boardKey = ({u, t}: Pick<Coord, 'u' | 't'>) => `${u}:${t}`
export const coordKey = (c: Coord) => `${boardKey(c)}:${index(c)}`
export const sameBoard = (a: Coord, b: Coord) => a.u === b.u && a.t === b.t
export const frontier = (u: Universe) => u.boards[u.boards.length - 1]
export const getUniverse = (s: State, id: number) => s.universes[id]?.id === id
  ? s.universes[id] : s.universes.find(u => u.id === id)
export function getBoard(s: State, {u, t}: Pick<Coord, 'u' | 't'>): Board | undefined {
  const universe = getUniverse(s, u)
  return universe?.boards[t - universe.boards[0].t]
}
export function pieceAt(s: State, c: Coord): Piece | null {
  if (!insideState(s, c)) return null
  const p = getBoard(s, c)?.cells[index(c)]
  return p && !s.eliminated.includes(p.player) ? p : null
}

export const FORWARD: Record<Player, Square> = {
  red: {x: 0, y: -1}, blue: {x: 1, y: 0}, yellow: {x: 0, y: 1}, green: {x: -1, y: 0}
}
export const home = (p: Player, file: number): Square => {
  switch (p) {
    case 'red': return {x: 3 + file, y: 13}
    case 'blue': return {x: 0, y: 10 - file}
    case 'yellow': return {x: 10 - file, y: 0}
    case 'green': return {x: 13, y: 3 + file}
  }
}
export const homeFor = (s: State, p: Player, file: number): Square => playerCount(s) === 2
  ? {x: 3 + file, y: p === 'red' ? 10 : 3} : home(p, file)
export const offset = (a: Square, v: Square, n = 1): Square => ({x: a.x + v.x * n, y: a.y + v.y * n})
export const promotes = (p: Player, c: Square, s?: State) => {
  const start = s ? homeFor(s, p, 0) : home(p, 0)
  const f = FORWARD[p]
  return (c.x - start.x) * f.x + (c.y - start.y) * f.y >= 7
}
export const squareName = ({x, y}: Square) => `${String.fromCharCode(97 + x)}${14 - y}`
export const coordName = (c: Coord) => `U${c.u}·T${c.t} ${squareName(c)}`

export function initialState(count: PlayerCount = 4): State {
  const cells: (Piece | null)[] = Array(SIZE ** 2).fill(null)
  const back: Kind[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  const basis = {playerCount: count} as State
  for (const player of modePlayers(count)) {
    for (let f = 0; f < back.length; f++) {
      const base = homeFor(basis, player, f)
      cells[index(base)] = {player, kind: back[f], moved: false}
      cells[index(offset(base, FORWARD[player]))] = {player, kind: 'P', moved: false}
    }
  }
  return {playerCount: count, round: 1, universes: [{id: 0, parent: null, divergence: 0, creator: null,
    created: 0, active: true, boards: [{t: 0, cells, enPassant: []}]}], rifts: [], eliminated: []}
}

export function present(s: State): number {
  return s.universes.reduce((t, u) => u.active ? Math.min(t, frontier(u).t) : t, Infinity)
}
export const isMain = (u: Universe, t: number) => u.active && frontier(u).t === t
export function moveBudget(s: State) {
  const t = present(s)
  return {main: Math.min(playerCount(s), s.universes.filter(u => isMain(u, t)).length), optional: 1}
}
export const survivors = (s: State) => players(s).filter(p => !s.eliminated.includes(p))
export function activation(universes: readonly Universe[], eliminated: readonly Player[], count: PlayerCount = 4): Universe[] {
  const ordered = [...universes].sort((a, b) => a.created - b.created || a.id - b.id)
  const active = new Set<number>([0])
  for (const player of modePlayers(count)) {
    if (eliminated.includes(player)) continue
    const own = ordered.filter(u => u.creator === player)
    const capacity = 1 + Math.floor((ordered.length - 1 - own.length) / (count - 1))
    for (const u of own.slice(0, capacity)) active.add(u.id)
  }
  return universes.map(u => u.active === active.has(u.id) ? u : {...u, active: active.has(u.id)})
}
