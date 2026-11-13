# Development home, accounts and ratings

The development frontend and Node API must be deployed together. Main and its production deployment are unchanged. Build with `npm run build`, then restart the Node process with the same `DATA_DIR`; back up `multiplayer.json` before upgrading. Existing users receive defaults lazily without losing passwords or sessions. Existing games remain casual and keep their movement rules.

## Flow

Guests still land on the four-player local board. Authenticated users land on Home; Online/Local, player count and movement determine the Find/Play and Continue actions. Create has its own details screen. Find uses a two-column invite/open-games layout, filtered by the selected options with Show all available. Private invite codes lead to the password form. The AI button stays disabled.

Every page shares the logo and account menu. Settings stores a chess-piece profile icon, default player count, default movement and game-notification preference. Local games remain browser saves. The game canvas and match controls keep their existing behavior.

## Elo policy

- Four independent pools: Classic duels, Classic multiplayer (3–4), Live duels, Live multiplayer (3–4).
- Each pool starts at 1200. The first ten completed rated games are labeled provisional; K remains 32 for all accounts.
- Only explicitly rated, public online games count. Private, casual, legacy, local and future AI games do not affect Elo.
- Ratings are recorded when all seats fill. At completion, each pair of players is compared using the usual logistic expectation (400-point scale). Finishing later earns a win against an earlier elimination; elimination in the same resolution is a draw. Surviving winners finish above eliminated players.
- Pair changes use `32 / (players - 1)`, so multiplayer has the same maximum per-game weight as a duel. Balanced integer rounding keeps each game's total change at zero.
- A game settles once, after at most one faction survives. If all factions are eliminated together they tie. Finishing order is based on faction elimination, including capture of a historical king copy. Checkmate is not inferred.
- Concurrent games use their own frozen starting ratings and add their changes to the account's current rating. The result, rating changes and once-only marker persist with the game.

The leaderboard shows actual rated players, separately for the selected pool. New accounts and empty pools show honest empty states. This is a basic Elo system; it does not implement collusion detection or claim to prevent alternate-account abuse.

## Notifications

The server stores the latest 100 in-app notices per account: joins, submitted plans, resolved rounds, turns, results and rating changes. Pending Live-plan notices never reveal the orders. Clicking a notice marks it read and opens its game; mark-all-read is available on Home and the full feed. Disabling move notices suppresses joins, moves and turns while retaining results and rating changes.

Pages poll while visible every 15 seconds. These are in-app notifications only. Account data, unread state, preferences and ratings survive server restarts in the existing database. Authentication is required for account APIs, and notices can only be read or updated by their owner.

## Validation

`npm test` covers Elo normalization, placement ties, separate pools, once-only settlement, preferences, feed bounds, authentication, ownership and restart persistence. `npm run test:browser` covers the dashboard/follow-up flows, mobile widths, settings, account menus, real multiplayer turns, the unchanged local board and binary logo delivery through the static Worker.
