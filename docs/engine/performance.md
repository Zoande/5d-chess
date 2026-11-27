# Meridian runtime measurements

## A moving crowd

Run `npm run world:build && node scripts/bench/city-live.mjs` with Node 24. The workload covers 12 simulated seconds at five updates per player per second. A crowd walks near the square, one player is wanted, and one visits KFC. Each timed batch includes simulation work and all observers' view generation and serialization. Bytes are application JSON before compression. Transactions count calls to the SQLite write-transaction wrapper, including inventory initialization.

The control used the same workload script with full views on upstream `c2c3532`. The refactor used streamed deltas. Both ran consecutively on the same development host.

| Players | Control median / p95 batch, ms | Refactor median / p95 batch, ms | Control → refactor bytes/player/s | Control → refactor transactions |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 3.48 / 55.50 | 5.30 / 9.50 | 52,277 → 5,071 | 62 → 21 |
| 10 | 5.24 / 51.85 | 7.48 / 12.82 | 59,672 → 6,251 | 70 → 29 |
| 50 | 25.63 / 86.75 | 22.75 / 37.93 | 114,392 → 13,019 | 110 → 69 |

At 50 players, the crowd used 89% fewer bytes and the p95 batch took 56% less time. Median time increased for the two smaller batches. The live server spreads publication across four tick slots.

## Rendering

`CITY_BENCH=1 node --test tests/city-render.spec.mjs` turns through eight camera headings after shader preparation. On the same city map, Chromium with SwiftShader at 640×448 recorded 206–2,498 draw calls before the rendering changes and 189–1,859 afterward. The busiest heading used 26% fewer draws. Startup to first playable frame measured 5.45 s and 5.02 s respectively in these runs. Neither run compiled another shader while turning. GPU hardware, browser scheduling and viewport size affect these measurements.

## Socket delivery

`node scripts/bench/city-sockets.mjs` opens real authenticated loopback sockets, moves every peer and measures when a second peer sees the first walker change heading. There are 16 movements per crowd size. This measures arrival of authoritative state before display interpolation. Production tunnel and phone hardware measurements require those environments.

| Peers | Movements received | Observer p50 / p95, ms | Bytes/peer/s |
| ---: | ---: | ---: | ---: |
| 2 | 16/16 | 197.8 / 238.8 | 4,431 |
| 10 | 16/16 | 191.1 / 200.7 | 5,278 |
| 50 | 16/16 | 99.1 / 103.1 | 8,617 |

The four publication slots and the 400 ms input interval affect which phase the observer samples. Compare latency across repeated runs with different input phases.
