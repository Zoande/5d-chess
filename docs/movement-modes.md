# Development movement rules

`main` keeps the established simultaneous resolver and only receives the board UI milestone. The rules below are implemented on `development`. Deploy the development frontend and Node game server together to use them online; pushing development does not replace the production Pi server.

## Creating and restoring games

New local games and new games created by the development lobby choose **Live** (default) or **Classic**, with 2, 3, or 4 players. Anonymous players can use Match → New match; logged-in players also have the lobby's local-game selector. Mode is immutable for an existing game.

Classic generates a shuffled order once at creation, stores it in the initial state and saves, and repeats it while skipping eliminated factions. Reloading never reshuffles it. Local mode-specific autosaves are separate. Saves and API rooms without a movement field retain the original resolver, including the original pass and collision rules. This is intentional compatibility with production clients and existing journals. The lobby always sends an explicit mode for a new development game.

## Classic

One faction submits at a time. The island shows whose device/seat is planning; the faction list and online seats show the fixed order. Each board snapshot stores its own turn owner, indicated by the board outline.

A player can source a move only from a frontier whose owner is that player, during their global turn. Playing a board advances that board's owner to the next surviving faction in the stored order. Unplayed boards keep their owner. An arrival into a different frontier may advance its position but does not consume or change its owner's turn. A newly forked board belongs to the player after the faction that made the fork.

The player submits one order from **every playable owned board at the Present**, plus at most one optional order from a future or inactive frontier they own. If none of their Present boards has a legal geometric move, that requirement is exempt; a pass can then move the global turn onward. This is not checkmate/stalemate detection. No board is advanced just because a different board was played.

## Present

The Present is the **minimum time coordinate of all active frontiers**. It is derived from state, rather than a separately adjustable cursor that could skip unfinished boards.

- Creating an active branch in the past can move the Present backward immediately.
- The Present advances only after every active frontier at that time advances (or becomes inactive).
- All playable Present boards are compulsory for their eligible faction. Future/inactive sources remain optional and limited to one per plan.
- Live advances an immobile Present board automatically when no surviving faction has any legal geometric move there, so an empty/frozen board cannot trap the Present forever.
- A Classic board waiting for a different owner remains at its time and keeps the Present there until that owner plays it. Global turns continue in the stored order.

Moving the Present backward means making a historical move that creates an active earlier frontier. There is no control that rewinds an existing immutable snapshot or arbitrarily skips an earlier active frontier.

## Live physical movement

Everyone plans against the same snapshot and locks their required Present orders. The server simulates the complete batch and records its travel traces. The client plays those exact world-coordinate traces before enabling the next plan. No new orders are inserted mid-flight.

| Piece | Spatial speed, tiles/tick | Dimensional speed, tiles/tick |
| --- | ---: | ---: |
| Rook | 3 | 4 |
| Pawn | 3 | 4 |
| Bishop | 1.5 | 2 |
| Queen | 1.5 | 2 |
| King | Instant | Instant |
| Knight | Instant | Instant |

A tile is 32 world pixels. `src/geometry.ts` is shared by renderer and server: board dimensions, history scaling, timeline columns, tree rows, and path polylines have one definition. A dimensional segment is a segment that changes time or universe. Duration is its displayed Euclidean distance divided by the applicable speed. Each trace records the piece, speeds, total distance, timed world points, destination, and any collision time. The client may shorten very long playback for usability while preserving every relative event time.

Spatial movement occurs on the new frontier board, so ordinary moves do not incorrectly pay a full timeline-column travel cost just because the round advanced. Historical destinations are allocated before geometry is measured; shared branches and tree reflow therefore use the exact layout shown during playback.

### Collisions

Units have a swept collision diameter of 17 world pixels (smaller than a square). The resolver solves continuous contact between trajectory segments, including contacts between tick boundaries. Adjacent stationary pieces do not touch.

- A knight or king is at its destination at tick zero. It can therefore intercept a slower slider that crosses its square later.
- Any physical collision removes both pieces, including friendly pieces. Avoid crossing friendly routes. The two legs of one castle are exempt from colliding with each other.
- A piece that has arrived stays physical at its destination for the rest of the batch. Two early arrivals can annihilate each other and leave the square free for a later third arrival.
- Exactly simultaneous multi-piece contacts remove all units participating in that contact. Results do not depend on request ordering.
- Captured kings eliminate their faction at batch completion. Check remains advisory; it never forbids a move or performs checkmate detection.
- Corporeal stationary blockers are the affected frontier/branch positions; immutable nonparticipating history is not edited by a flight passing its visual projection. Moving units can collide between boards.
- En passant still captures the original stationary pawn if it has not left; it does not capture a different arrival. Pawns promote on surviving arrival.

This is a deterministic logical-tick simulation, not a wall-clock server timer. Rooms persist final positions and travel events atomically; reconnecting clients can replay the same result.

## Shared timelines

In Live, all orders in a batch targeting the same historical board `(universe, time)` create one shared branch, even when their destinations are different squares. The original future is preserved.

The branch records every contributing faction in `owners`. It consumes one timeline allocation for each owner. Activation is the union of owners' allocations: the branch remains active while any surviving owner has it in their allocation, and becomes inactive only when none does. Eliminating one owner does not deactivate a shared branch still supported by another.

Arrival order and collisions are resolved on that single branch. The tests include three factions jumping from different boards to the same empty square: two collide and the later third survives.

## Board awareness

The shared UI includes a movable minimap with a camera rectangle, click/keyboard camera navigation, subtle playable-board pulses, and automatic focus on the next unused legal source. Check detection uses the existing spatial and dimensional move geometry, including threats to historical kings. A plan is previewed for blocks, captures and king moves before the submit warning. Opponents' hidden orders cannot be predicted, so warnings are advisory rather than guarantees of safety.

## Validation

`npm test` covers legacy rules, compulsory Present moves, fixed turns and per-board owners, save replay, physical interceptions between ticks, shared ownership, the three-arrival collision case, all player counts, API validation, and persistence across server restart. `npm run test:browser` covers local creation, Live multiplayer rounds, Classic online turns, the old journal flow, minimap movement, check warning review, mobile layouts and branch/replay/save transfer.
