# Server architecture and operations

The chess server remains one Node.js 24 process at the existing `HOST`/`PORT`.
`DATA_DIR` is unchanged. The client, `/api` contract, session cookie, static
Cloudflare Worker, outgoing tunnels and game rules do not need changes.

## Storage choice

`DATA_DIR/chess.sqlite` replaces the shared in-memory `multiplayer.json` object.
SQLite uses WAL, foreign keys, a bounded writer wait and FULL synchronous commits.
It is built into Node 24, including on the Pi; no native npm addon is needed.

| Table | Contents |
| --- | --- |
| `accounts` | One account's credentials, settings, wallet, cosmetics, notifications and retry receipts per row |
| `sessions` | Hashed session tokens, account references and expiry |
| `rooms` | One complete game's state/history/pending orders per row, plus a small indexed lobby summary |
| `room_members` | Indexed membership and current-turn flags for each game |
| `listings` | Individual market listings |
| `metadata` | Preserved legacy operational data, including one-time coin-bonus markers |
| `migrations` | Storage schema/import receipt and source-backup checksum |

Rich game and account payloads remain JSON **inside separate database records**.
A shop visit never serializes another game's boards or history. Lobby queries use
summaries and membership indexes, so they do not load game histories either.
Unchanged records are not rewritten. Row revisions help inspect targeted updates.

Unlike a large independent campaign process, a chess match can finish while it
awards multiple accounts coins, ratings and notifications. One SQLite transaction
can commit those records together. Separate game files would need another commit
protocol to provide the same guarantee, so this keeps the deployment simpler than
the multi-version campaign orchestrator used by Stellarfronts.

## Modules and request lifecycle

- `index.ts`: process bootstrap and graceful SIGINT/SIGTERM drain.
- `application.ts`, `http.ts`, `static.ts`: request boundaries, validation and responses.
- `auth-api.ts`, `security.ts`: credentials, cookies, sessions and login throttling.
- `account-api.ts`: profiles, preferences, notifications and leaderboard.
- `economy-api.ts`, `economy.ts`: purchases, equipment and market operations.
- `game-api.ts`, `accounts.ts`: games, rules validation and settlement.
- `storage.ts`: repositories, transactions, migration, backup and integrity checks.

Request bodies are read before taking a SQL writer lock. Each operation then reads
fresh records into a private unit of work, validates and modifies them, writes only
changed rows, and commits before sending success. A rejected operation or failed
commit discards the whole unit, so partially changed wallets cannot leak into the
next request. Separate processes see the latest committed records rather than
maintaining competing global caches. Existing purchase receipt IDs still prevent
duplicate charges/rewards on ordinary retries.

On shutdown the server stops accepting new work, finishes in-flight responses and
closes SQLite. Allow at least 12 seconds in the process manager for the ten-second
HTTP drain deadline. Committed SQL transactions also survive an abrupt process
death; unfinished transactions are recovered by SQLite.

## One-time legacy migration

1. Stop the old chess server so it cannot keep writing JSON during the import.
2. Keep `DATA_DIR` and make an external backup of its `multiplayer.json`.
3. Build the new release and run `DATA_DIR=/path/to/data npm run data:migrate`.
4. Run `DATA_DIR=/path/to/data npm run data:check`, then start the new server.

Starting the new server also performs the same migration if needed. Migration
creates a private, fsynced, SHA-256-verified backup under `DATA_DIR/backups/`, imports
all accounts, sessions, games, listings and unknown top-level metadata inside one
transaction, compares the complete round-trip export, and only then marks schema
1 as committed. Corrupt JSON, invalid references, duplicate identities or an
unsupported storage schema fail startup; they do not silently create empty data.

Existing password hashes, cookie sessions, wallet balances, inventories, pending
orders, rated flags, game journals, market listings and previous bonus receipts are
preserved. Migration does not rerun the welcome reward or the 3,000-coin bonus.
The original JSON is retained and never updated or reimported once SQLite exists.
After migration, editing that old JSON cannot change live balances or games.

## Backups, inspection and rollback

```sh
DATA_DIR=/path/to/data npm run data:check
DATA_DIR=/path/to/data npm run data:backup -- /private/backups/chess-unique.sqlite
DATA_DIR=/path/to/data npm run data:export -- /private/exports/chess-unique.json
```

`check` validates SQLite integrity and foreign keys and prints schema/record counts.
`backup` uses SQLite's online backup API, then verifies the independent copy. It is
safe with a running server and includes committed WAL changes. Do not copy only
the live `.sqlite` file while ignoring its WAL. Backup/export paths must be new;
the commands refuse to overwrite existing files. Exports contain credentials and
sessions, are created private, and should never be printed or committed to Git.

To recover the new server, stop it, preserve its current database and sidecars,
restore a verified backup as `DATA_DIR/chess.sqlite` with private permissions,
remove the **stopped old database's** WAL/SHM sidecars, check and restart.

To downgrade to the old JSON server **after new writes**, stop the new server and
export its current database first. Use that compatibility export as the old
server's `multiplayer.json`. Restarting old code against the frozen pre-migration
JSON would lose later purchases and moves. A code rollback must preserve data
written after the migration.

`GET /api/health` provides a small unauthenticated readiness probe with the storage
schema; it does not expose accounts, credentials or game data.

## Regression checks

Run `npm test` and `npm run test:browser`. Storage tests exercise complete legacy
round trips and bonus preservation, transaction/commit failure rollback, targeted
record updates, multiple writer processes, committed/uncommitted crash recovery,
and independent backup restoration. API tests continue to cover private plans,
saved sessions, once-only ratings/rewards and competing market buyers. The browser
suite uses the unchanged client against this backend.
