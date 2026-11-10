# Multiplayer setup on a Raspberry Pi

The online edition uses one Node.js process for authentication, static files, and up to 50 active games. Games and accounts are saved in a JSON file under `DATA_DIR`; keep that directory on persistent storage and back it up. Passwords use salted scrypt hashes, and session cookies are HTTP-only. A game starts when all four seats are filled. Each surviving player can lock one private plan per round; the server resolves the round after everyone locks. There is no turn timer or automatic pass.

Use Node.js 24 or later. From this repository checkout on the `main` branch:

```sh
npm ci --include=dev
npm run build
DATA_DIR=/path/to/persistent/chess-data HOST=127.0.0.1 PORT=4174 npm run server
```

The production deployment uses **https://chess.316123.nl/**, which redirects to `/chess/`. Cloudflare's static Worker serves all chess pages and assets. Only requests matching hostname `chess.316123.nl` and path `^/api/.*` enter the dedicated `5d-chess-pi` tunnel and reach `http://127.0.0.1:4174`; the tunnel catch-all returns 404. Pages and API share an origin, so no frontend API URL or CORS change is needed. Keep the original Host header and `X-Forwarded-Proto: https` for origin checks and Secure cookies. The previous apex-domain chess Worker routes are removed.

On the Pi, the checkout is `/home/pablo/5d-chess`, persistent data is `/home/pablo/chess-data`, and deployment configuration is `/home/pablo/chess-ops/ecosystem.config.cjs`. PM2 runs `5d-chess` as one Node fork and `5d-chess-tunnel` as a separate cloudflared fork, with automatic restarts. The existing `pm2-pablo` boot service restores the saved process list. Tunnel credentials are read from a private token file outside the repository. Change only these two named processes during maintenance; do not restart all PM2 services.

The landing page remains the local game for visitors who are logged out. Logged-in visitors go to the lobby; Local play opens the same local game. Public rooms appear in the Join game list, while password rooms require their four-letter code and password. Continue game lists every room the account joined, including completed games.

Set `DATA_DIR` to a directory writable by the service account and include its `multiplayer.json` file in backups. A restart loads accounts, sessions, rooms, and game progress. The server is designed for one Node process; do not run multiple processes against the same data file. For a service manager, run `npm run server` from the repository directory with `DATA_DIR`, `HOST`, and `PORT` set in its environment. Rebuild after updating the branch, then restart that process.

`npm run deploy` is the original static Cloudflare Worker command. It does not deploy the Node multiplayer server.
