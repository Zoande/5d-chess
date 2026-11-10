# Four-Player Multiverse Chess rules

## Setup and victory

Red starts south, Blue west, Yellow north, and Green east. Each army faces the center and has a home rank of rook, knight, bishop, queen, king, bishop, knight, rook from its own left to right. Eight pawns stand one rank ahead. The 14×14 cross has four missing 3×3 corners and 160 playable squares. Everyone starts in universe U0 at T0.

Any captured king eliminates that king’s faction throughout the multiverse after the batch finishes. A faction’s other valid orders still resolve in that batch. Its pieces are then removed from every new board and ignored by the rules on older boards. Older snapshots retain their recorded positions. The last surviving faction wins. If none survive, the game is a draw. Check and checkmate play no role.

## Coordinates and legal routes

A square has two spatial coordinates, a board time T, and a universe U. Board times are local timeline coordinates. They can lag the global round. Only a frontier board, the latest snapshot of its universe, can supply an order. Destinations may be historical or frontier boards. The ancestor’s snapshots retain their own U coordinates. A new universe’s first snapshot is at its divergence time plus one.

One ordinary universe step crosses one parent–child tree edge in either direction. A Temporal Rift is a bidirectional shortcut that a queen, bishop, or knight may use, with at most one per move. A Rift created this round enters the route graph at the next round. Calculate universe distance from the shortest route with the piece’s edge restrictions. The player may choose any clear route tied for that distance. A blocked shortest route cannot be replaced by a longer route.

Sliding pieces step in each changed dimension together. Every intermediate square must exist on its corresponding board, be playable, and be empty in the frozen snapshot. Knights jump and need only valid endpoints. Existing inactive boards can be crossed or targeted. Screen positions never determine legality.

| Piece | Movement |
| --- | --- |
| Rook | Any positive distance along exactly one axis. |
| Bishop | Equal positive distances along exactly two axes. |
| Queen | Equal positive distances along one to four axes. |
| Knight | Two units along one axis and one along another. |
| King | At most one unit along each axis, with at least one axis used. |
| Pawn | One forward spatial step or one step down to a child universe. Two along the same forward axis while unmoved, through a clear intermediate square. |

A pawn’s two forward directions are its faction’s spatial heading and any edge from a parent to a child. A pawn push requires an empty snapshot destination. Pawns capture an enemy one spatial step forward and one sideways, or one child edge plus one time step in either direction with no spatial change. Promotion to queen is automatic on reaching the pawn’s eighth rank or beyond, measured from its own home rank.

## Special orders

**Castling.** An unmoved king on its starting square may move two spaces toward an unmoved, same-faction rook on its starting square, provided every intervening square is empty. The rook lands on the square the king crossed. This counts as one order and claims both destinations. Attacked squares do not prevent castling. A conflict at either destination cancels the whole castle.

**En passant.** A spatial two-step by a pawn records the crossed square for the next global round on that resulting board. An enemy pawn orthogonally adjacent to the double-step pawn can capture via its own spatial capture diagonal into the crossed square, if it is empty. A successful departure by the victim lets it escape. A pawn that promotes during a double-step grants no en passant right.

## Private planning

Red, Blue, Yellow, and Green enter orders in that order, skipping eliminated factions. The whole multiverse stays frozen until every survivor locks. Passing commits zero orders.

The Present is the earliest frontier time among active universes. If M active frontiers are at that time, each player gets up to min(M, 4) main orders from those boards and one optional order from a future or inactive frontier. A player may order only one move per source board. A move involving multiple boards still consumes one order. Copies in different snapshots are independent occupants. New boards and Rifts cannot be used during the batch that creates them.

## Resolving the batch

1. Validate piece ownership, movement, route, and budgets on the frozen state. Snapshot blockers still block a sliding path even if ordered to move.
2. All valid orders that claim the same square on the same resulting frontier fail. Both legs of a castle participate. Claims stand for this check even when another part of the order also fails. Each historical arrival has its own resulting board and never contests a different arrival.
3. An ordinary move may target a friendly-occupied square on a different frontier, and succeeds only if the occupant departs. Fail unresolved dependencies until no more moves fail. Closed swaps and cycles can succeed. Pawns require the correct snapshot occupancy for their chosen push or capture, and castling requires empty squares between king and rook.
4. Remove all successful departures. Then resolve captures from the remaining original occupants and install all successful arrivals. An enemy that left successfully escapes. A pawn capture order still completes if its intended victim escapes. Historical arrivals capture from an independent copy of the original snapshot. Multiple simultaneous attack mechanisms can receive capture credit for the same remaining piece.
5. Advance every active Present frontier, even on a pass, plus every frontier touched by a successful move. Each affected frontier advances once. Historical arrivals fork instead of advancing the target universe’s original history.
6. Apply eliminations, branch activation, and the new Present.

A fork attaches to the destination universe at the time it diverged. If the piece left a different universe, add a Rift between that source universe and the new branch. Otherwise add only the parent–child edge. Branch numbers break same-round creation ties using a canonical order by faction and move coordinates. Numbering affects age ties and display, with no move-resolution priority.

## Activation and Present

U0 always stays active. For each surviving faction, capacity is one plus the floor of the sum of branches created by the other factions divided by three. The oldest of that faction’s branches are active up to capacity. Branches created by eliminated factions stay inactive permanently and still count in other factions’ capacity calculations. Inactive branches stay visible and may supply an optional order. They do not advance automatically or set the Present. A newly active branch may move the Present backward.
