import {type Coord, type Order, type Player, type State, boardKey, boardTurn, frontier, isMain, pieceAt, present, squares} from './model.ts'
import {legalMoves} from './moves.ts'
/** No checkmate/stalemate calculation: a source with no legal geometric move is exempt. */
export function requiredBoards(s: State, player: Player, orders: readonly Order[] = []): Coord[] {
  if (!s.movement || s.eliminated.includes(player) || (s.movement === 'classic' && s.turn !== player)) return []
  const used = new Set(orders.filter(o => o.player === player).map(o => boardKey(o.from)))
  return s.universes.flatMap(u => {
    if (!isMain(u, present(s)) || used.has(boardKey({u: u.id, t: frontier(u).t})) ||
      (s.movement === 'classic' && boardTurn(s, u) !== player)) return []
    for (const square of squares(s)) {
      const c = {...square, u: u.id, t: frontier(u).t}
      if (pieceAt(s, c)?.player === player && legalMoves(s, c).length) return [c]
    }
    return []
  })
}
