# Multiplayer setup on a Raspberry Pi

The online edition uses one Node.js process for authentication, static files, and up to 50 active games. Games and accounts are saved in a JSON file under `DATA_DIR`; keep that directory on persistent storage and back it up. Passwords use salted scrypt hashes, and session cookies are HTTP-only. A game starts when all four seats are filled. Each surviving player can lock one private plan per round; the server resolves the round after everyone locks. There is no turn timer or automatic pass.

Use Node.js 24 or later. From this repository checkout on the `multiplayer` branch:

```sh
npm ci --include=dev
npm run build
DATA_DIR=/path/to/persistent/chess-data HOST=127.0.0.1 PORT=4174 npm run server
```

Open `http://127.0.0.1:4174/chess/` on the Pi to check local startup. For public access, point your HTTPS tunnel at `http://127.0.0.1:4174` and route **both** `/chess/*` and `/api/*` on the same hostname to that process. The site uses same-origin API requests and needs no separate frontend host. Ensure the tunnel forwards the original host and HTTPS scheme (`X-Forwarded-Proto: https`) so the session cookie is marked Secure. Keep the Node process bound to loopback. The existing Cloudflare Worker routes on `/chess` and `/chess/*` will take precedence until you change those routes for the multiplayer hostname.

The landing page remains the local game for visitors who are logged out. Logged-in visitors go to the lobby; Local play opens the same local game. Public rooms appear in the Join game list, while password rooms require their four-letter code and password. Continue game lists every room the account joined, including completed games.

Set `DATA_DIR` to a directory writable by the service account and include its `multiplayer.json` file in backups. A restart loads accounts, sessions, rooms, and game progress. The server is designed for one Node process; do not run multiple processes against the same data file. For a service manager, run `npm run server` from the repository directory with `DATA_DIR`, `HOST`, and `PORT` set in its environment. Rebuild after updating the branch, then restart that process.

`npm run deploy` is the original static Cloudflare Worker command. It does not deploy the Node multiplayer server.
