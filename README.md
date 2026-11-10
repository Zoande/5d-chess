# Four-Player Multiverse Chess

The `multiplayer` branch also contains a Node.js server for online accounts and four-player games. See [Multiplayer setup](docs/multiplayer.md). The existing local game remains available without an account.

[Play at 316123.nl/chess/](https://316123.nl/chess/)

Four human factions share a cross-shaped board and plan private orders on one device. Once everyone locks in, all orders resolve together. Pieces can move through time, fork historical positions, and use Temporal Rifts. Capture any copy of a faction’s king to eliminate that faction.

## Run locally

Use Node.js 24 or later and a current browser.

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:4173/chess/](http://127.0.0.1:4173/chess/). Red starts immediately. The game menu provides New match and JSON import and export. The app stores its autosave on the current browser and origin. A save contains the complete game journal and any private orders entered so far.

- Click a piece and then a highlighted destination. Use Cycle route if several legal paths reach the same square.
- Drag the scene to pan. Scroll or pinch to zoom. The camera bar can fit all timelines, focus a selection or inspected board, or return to the current player’s activity.
- With the canvas focused, use arrow keys to move across squares, Shift + arrows to change board nodes, Enter to select, and WASD to pan. F fits the multiverse, Z focuses the selection, and 0 resets to a Present frontier.
- The round history steps through committed snapshots in the same canvas. Play round reruns the reveal animation.

See [RULES.md](RULES.md) for complete movement and conflict rules.

## Checks

```sh
npm test
npm run build
npx playwright install --only-shell chromium
npm run test:browser
```

Set `CHROMIUM_EXECUTABLE` to use an existing Chromium for the browser tests. The unit tests cover the resolver, movement, branching, activation, and save journal. The browser suite drives all four seats through a branch and a Rift, and exercises replay, autosave, and save transfer.

## Deploy under /chess/

`npm run build` produces the site at `dist/chess/` and a small static-only Cloudflare Worker at `.cloudflare/worker.mjs`. Every page asset uses the `/chess/` base path. The site has no external runtime dependencies.

**Existing static host.** Copy the generated `dist/chess/` folder into the existing website’s deployment output and publish that output as usual. Keep the existing host’s directory index handling enabled for `/chess/`.

**Automatic deploys from `main`.** The Cloudflare Worker is configured by [wrangler.jsonc](wrangler.jsonc), including both routes under `/chess/`. `npm run deploy` builds the site and publishes the Worker with Wrangler. Cloudflare Workers Builds is connected to this repository's `main` branch. Each push to `main` builds the app and deploys it to the existing Worker. Its deploy command uses the pinned Wrangler version in `package-lock.json`.

To update the Worker manually from a development machine, authenticate Wrangler with a Cloudflare account that has Workers Scripts Edit on the account and Workers Routes Edit on the zone, then run:

```sh
npm ci
npm run deploy
```

`https://316123.nl/chess/*` serves the game and its assets. The exact `https://316123.nl/chess` route redirects the bare path. Cloudflare's exact route applies to the bare URL without a query. Use `/chess/` in links. To remove the deployment from the domain, remove these two scoped routes in the Cloudflare dashboard.

[Cloudflare Worker route documentation](https://developers.cloudflare.com/workers/configuration/routing/routes/) · [Cloudflare Worker upload API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/)

## Code map

| File | Role |
| --- | --- |
| `src/model.ts` | Immutable board and timeline data, geometry, activation, Present |
| `src/moves.ts` | Universe route search, movement, occupancy, castling, en passant |
| `src/resolve.ts` | Order validation, claims and departures, capture, branch and Rift creation |
| `src/scene.ts` | Canvas layout, camera, hit testing, paths, simultaneous reveal |
| `src/main.ts` | Pass-and-play flow, planning controls, round history |
| `src/session.ts` | Deterministic save journal and replay reconstruction |

[5dcol](https://github.com/ForkKILLET/5dcol) informed the board-history model, geometric target generation, camera and preview workflow. This implementation uses its own engine and artwork.
