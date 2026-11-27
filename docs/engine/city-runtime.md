# How the multiplayer city runs

Meridian runs in the existing Node process. Each occupied district holds up to 50 players and has one clock, population, traffic simulation, restaurant, set of lifts and police pursuits. SQLite stores accounts, inventory, bookings and financial transactions. Walking positions, input sequences and the recent city chat live in memory.

| When working on… | Start here |
| --- | --- |
| District creation, venue transitions and applying gameplay commands | `server/world.ts`, `server/world/shard.ts` |
| Clock and catch-up behavior | `server/world/clock.ts` |
| Movement, street navigation and nearby residents | `server/world/movement.ts`, `navigation.ts`, `interest.ts` in the same directory |
| Resident schedules, pursuit and capture | `server/city-life.ts`, `server/world/patrol-motion.ts`, `server/city-arcade.ts` |
| Shared collision, heights, sight lines and map geometry | `src/world/model.ts`, `src/world/sight.ts`, `world/meridian/` |
| Socket sessions, viewer state and delta encoding | `server/world/live.ts`, `shared/world/protocol.ts` |
| Prediction, reconnect, animation and diagnostics | `src/world/network/city-connection.ts`, `src/world/player-motion.ts`, `src/world/stage.ts`, `src/world/diagnostics.ts` |

## From input to another player's screen

1. A browser moves its own character immediately using the shared map and collision code. It sends changed position, heading, selected slot and kitchen hand input. The server consumes the latest movement on its next tick. An interaction also carries the final input so walking up to a counter and using it stays ordered.
2. The district advances in 50 ms steps. A late callback catches up at most four steps. Deadlines use wall time. Residents plan routes less frequently, share street navigation with officers, and reuse a spatial index across observers. Officers use physical movement and line of sight at public entrances and on the station stairs.
3. The server builds a view for each observer, including nearby players, residents, relevant venue state, and any custody aliases. The first frame contains that view in full. Later frames carry changed fields, removals and the most recent processed input sequence. An array whose length changes is replaced. The client applies changes without mutating earlier interpolation samples.
4. Other people and officers render from a short history of server positions. An interrupted stream holds its last pose until more samples arrive. Local movement reconciles against the position associated with the acknowledged input.
5. Foreground observers receive about five snapshots per second, staggered across the tick cycle. Hidden tabs receive updates less often. The server defers delivery to a backed-up socket, checks liveness, and drops a persistently unresponsive peer. A disconnected player has a 27-second district grace period.

## Reconnect and persistence

The same-origin WebSocket at `/api/world/live` uses the site's session cookie. Its handshake includes the protocol and map versions. Each tab identifies its stream, and the server returns an epoch. Commands run one at a time per tab. Within that epoch, resending the same command ID returns its previous receipt. Reconnecting always starts with a full view. If the server restarted or the receipt expired after two minutes disconnected, the client asks the player to review the current state before issuing the action again.

Custody, inventory and spending checks run in the existing gameplay services. Wanted time is checkpointed at one-second intervals during movement and flushed on commands, logout and orderly shutdown. A hard process exit can lose the last uncheckpointed interval. Ordinary world entry uses the socket. The HTTP world command API is available for existing callers and calls the same simulation and services.

## Adding a mechanic

Keep physical rules both peers need in the shared world model. Apply a command or time-based rule in its owning server service. Commit persistent side effects in its existing database transaction, then project the resulting state to eligible observers. The browser sends intent and animates the returned state. A mechanic that only needs a new field on a venue view can use the existing snapshot codec. Exercise the normal entry point with a second observer when someone else should see the effect.

## Running and diagnosing the city

Run `npm run build && npm run server` with Node 24. Open `/chess/world.html?debug=1` while signed in to see the rendered-frame interval p95, draw calls, actor count, simulation and projection durations, acknowledged input latency and local position corrections. The latency includes waiting for the next published view. Browser network tools show the handshake, initial frame and deltas under **WS**.

The Pi tunnel routes `/api/*` to this same server. Proxies serving this deployment must forward the WebSocket upgrade on that route. Deploy matching frontend and backend builds. The health and update-screen endpoints retain their existing behavior. The benchmark commands and measurement conditions are in [performance.md](performance.md).
