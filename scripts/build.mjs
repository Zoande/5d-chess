import {build} from 'esbuild'
import {cp, mkdir, rm, readFile, writeFile} from 'node:fs/promises'

await rm('dist', {recursive: true, force: true})
await mkdir('dist/chess', {recursive: true})
await cp('public', 'dist/chess', {recursive: true})
await cp('index.html', 'dist/chess/index.html')
await cp('login.html', 'dist/chess/login.html')
await cp('lobby.html', 'dist/chess/lobby.html')
await cp('online.html', 'dist/chess/online.html')
await build({entryPoints: ['src/main.ts'], bundle: true, minify: true, format: 'esm',
  target: ['es2022'], outfile: 'dist/chess/game.js', legalComments: 'none'})
await build({entryPoints: ['src/portal.ts'], bundle: true, minify: true, format: 'esm',
  target: ['es2022'], outfile: 'dist/chess/portal.js', legalComments: 'none'})
await build({entryPoints: ['src/online.ts'], bundle: true, minify: true, format: 'esm',
  target: ['es2022'], outfile: 'dist/chess/online.js', legalComments: 'none'})
await build({entryPoints: ['server/index.ts'], bundle: true, platform: 'node', format: 'esm',
  target: ['node24'], outfile: 'dist/server.mjs', legalComments: 'none'})

// Bundle the same public files as a module for path-scoped Cloudflare Worker deployment.
const types = {'index.html': 'text/html; charset=utf-8', 'login.html': 'text/html; charset=utf-8',
  'lobby.html': 'text/html; charset=utf-8', 'online.html': 'text/html; charset=utf-8',
  'game.js': 'text/javascript; charset=utf-8', 'portal.js': 'text/javascript; charset=utf-8',
  'online.js': 'text/javascript; charset=utf-8', 'styles.css': 'text/css; charset=utf-8',
  'portal.css': 'text/css; charset=utf-8', 'shell.css': 'text/css; charset=utf-8', 'logo.png': 'image/png', 'emblem.svg': 'image/svg+xml'}
const assets = Object.fromEntries(await Promise.all(Object.entries(types).map(async ([name, type]) =>
  [name, {type, binary: name.endsWith('.png'), body: name.endsWith('.png') ? (await readFile(`dist/chess/${name}`)).toString('base64') : await readFile(`dist/chess/${name}`, 'utf8')}])))
await mkdir('.cloudflare', {recursive: true})
await writeFile('.cloudflare/worker.mjs', `const assets = ${JSON.stringify(assets)};
${await readFile('scripts/edge.mjs', 'utf8')}`)
