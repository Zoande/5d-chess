import {build as bundle} from 'esbuild'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {cp, mkdir, rm, readFile, writeFile, readdir} from 'node:fs/promises'

// Browsers load map sections on world entry. Node embeds the same compiled bytes
// at build time so the Pi can still start without a Cloudflare connection.
const mapPlugin={name:'meridian-map',setup(build){
  build.onLoad({filter:/[/\\]world[/\\]map-(data|visual)\.ts$/},({path})=>{
    const key=path.endsWith('map-data.ts')?'shared':'visual'
    return {contents:`import {loadSection} from './load-map.ts'; export const ${key}=await loadSection('${key}');`,resolveDir:resolve('src/world')}
  })
}}
const build=options=>bundle({...options,plugins:options.platform==='node'?[]:[mapPlugin]})
await rm('dist', {recursive: true, force: true})
await mkdir('dist/chess', {recursive: true})
await cp('public', 'dist/chess', {recursive: true})
await cp('index.html', 'dist/chess/index.html')
await cp('login.html', 'dist/chess/login.html')
await cp('lobby.html', 'dist/chess/lobby.html')
await cp('world.html','dist/chess/world.html')
await cp('stocks.html','dist/chess/stocks.html')
await cp('bank.html','dist/chess/bank.html')
await cp('profile.html','dist/chess/profile.html')
await cp('puzzles.html','dist/chess/puzzles.html')
await cp('leaderboard.html','dist/chess/leaderboard.html')
await cp('online.html', 'dist/chess/online.html')
await cp('collection.html', 'dist/chess/collection.html')
for(const game of ['roulette','dice'])await cp(`${game}.html`,`dist/chess/${game}.html`)
await build({entryPoints:['src/puzzles.ts'],bundle:true,minify:true,format:'esm',target:['es2022'],outfile:'dist/chess/puzzles.js',legalComments:'none'})
await build({entryPoints: ['src/main.ts'], bundle: true, minify: true, format: 'esm',
  target: ['es2022'], outfile: 'dist/chess/game.js', legalComments: 'none'})
await build({entryPoints: ['src/portal.ts'], bundle: true, minify: true, format: 'esm',
  target: ['es2022'], outfile: 'dist/chess/portal.js', legalComments: 'none'})
await build({entryPoints: ['src/online.ts'], bundle: true, minify: true, format: 'esm',
  target: ['es2022'], outfile: 'dist/chess/online.js', legalComments: 'none'})
await build({entryPoints: ['src/store.ts'], bundle:true, minify:true, format:'esm',target:['es2022'],outfile:'dist/chess/collection.js',legalComments:'none'})
await build({entryPoints:{world:'src/world/entry.ts',bank:'src/bank-client.ts',casino:'src/casino/main.ts','roulette-hall':'src/casino/hall-client.ts'},bundle:true,minify:true,format:'esm',target:['es2022'],splitting:true,outdir:'dist/chess',entryNames:'[name]',chunkNames:'chunks/[name]-[hash]',legalComments:'none'})
await build({entryPoints:['src/stocks.ts'],bundle:true,minify:true,format:'esm',target:['es2022'],outfile:'dist/chess/stocks.js',legalComments:'none'})
await build({entryPoints:['src/profile.ts'],bundle:true,minify:true,format:'esm',target:['es2022'],outfile:'dist/chess/profile.js',legalComments:'none'})
await build({entryPoints:['src/leaderboard.ts'],bundle:true,minify:true,format:'esm',target:['es2022'],outfile:'dist/chess/leaderboard.js',legalComments:'none'})
await build({entryPoints: ['server/index.ts'], bundle: true, platform: 'node', format: 'esm',
  banner:{js:"import {createRequire as createNodeRequire} from 'node:module';const require=createNodeRequire(import.meta.url);"},target: ['node24'], outfile: 'dist/server.mjs', legalComments: 'none'})
await build({entryPoints:['server/ai-worker.ts'],bundle:true,platform:'node',format:'esm',target:['node24'],outfile:'dist/ai-worker.mjs',legalComments:'none'})
await build({entryPoints: ['server/storage-admin.ts'], bundle: true, platform: 'node', format: 'esm',
  target: ['node24'], outfile: 'dist/storage-admin.mjs', legalComments: 'none'})

// Bundle the same public files as a module for path-scoped Cloudflare Worker deployment.
const types = {'world.html':'text/html; charset=utf-8','world.js':'text/javascript; charset=utf-8','world.css':'text/css; charset=utf-8','bank.html':'text/html; charset=utf-8','bank.js':'text/javascript; charset=utf-8','bank.css':'text/css; charset=utf-8','stocks.html':'text/html; charset=utf-8','stocks.js':'text/javascript; charset=utf-8','stocks.css':'text/css; charset=utf-8','match.css':'text/css; charset=utf-8','puzzles.html':'text/html; charset=utf-8','puzzles.css':'text/css; charset=utf-8','puzzles.js':'text/javascript; charset=utf-8','profile.html':'text/html; charset=utf-8','profile.js':'text/javascript; charset=utf-8','profile.css':'text/css; charset=utf-8','leaderboard.html':'text/html; charset=utf-8','leaderboard.js':'text/javascript; charset=utf-8','roulette.css':'text/css; charset=utf-8','roulette-hall.css':'text/css; charset=utf-8','roulette-hall.js':'text/javascript; charset=utf-8','roulette.html':'text/html; charset=utf-8','dice.html':'text/html; charset=utf-8','casino.js':'text/javascript; charset=utf-8','casino.css':'text/css; charset=utf-8','index.html': 'text/html; charset=utf-8', 'login.html': 'text/html; charset=utf-8',
  'lobby.html': 'text/html; charset=utf-8', 'online.html': 'text/html; charset=utf-8',
  'collection.html':'text/html; charset=utf-8','collection.js':'text/javascript; charset=utf-8','collection.css':'text/css; charset=utf-8',
  'game.js': 'text/javascript; charset=utf-8', 'portal.js': 'text/javascript; charset=utf-8',
  'online.js': 'text/javascript; charset=utf-8', 'styles.css': 'text/css; charset=utf-8',
  'portal.css': 'text/css; charset=utf-8', 'shell.css': 'text/css; charset=utf-8', 'logo.png': 'image/png', 'emblem.svg': 'image/svg+xml'}
// Practice uses the real guest AI and board with an independent local save.
const root='dist/chess/',practice=(await readFile(root+'index.html','utf8'))
  .replace('5D Chess · Local play','Offline practice with Pip · 5D Chess')
  .replace('/chess/logo.png','/chess/emblem.svg')
await writeFile(root+'practice.html',practice)
for(const [page,type] of Object.entries(types)){
  if(!type.startsWith('text/html'))continue
  const html=await readFile(root+page,'utf8')
  const gated=html.replace(/<script type="module" src="([^"]+)"><\/script>/,'<script type="module" src="/chess/availability.js" data-entry="$1"></script>')
  if(gated===html)throw Error('Missing app entry in '+page)
  await writeFile(root+page,gated)
}
const kit=['update.html','update.js','update.css','availability.js','practice.html','game.js','emblem.svg','styles.css','shell.css','match.css']
const worker=await readFile('scripts/update-worker.js','utf8')
const hash=createHash('sha256').update(worker)
for(const file of kit)hash.update(file).update(await readFile(root+file))
await writeFile(root+'update-worker.js',`const CACHE_NAME='5d-update-${hash.digest('hex')}';\nconst FILES=${JSON.stringify(kit.map(f=>'/chess/'+f))};\n${worker}`)
for(const name of [...kit,'update-worker.js']){
  types[name]??=name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'
}
for(const chunk of await readdir('dist/chess/chunks'))types['chunks/'+chunk]='text/javascript; charset=utf-8'
await cp('node_modules/three/LICENSE','dist/chess/third-party-notices.txt');types['third-party-notices.txt']='text/plain; charset=utf-8'
for(const name of await readdir('dist/chess/overrun'))types['overrun/'+name]=name.endsWith('.glb')?'model/gltf-binary':'image/webp'
const binaryAsset=name=>/\.(png|glb|webp)$/.test(name)
const assets = Object.fromEntries(await Promise.all(Object.entries(types).map(async ([name, type]) =>
  [name, {type, binary: binaryAsset(name), body: binaryAsset(name) ? (await readFile(`dist/chess/${name}`)).toString('base64') : await readFile(`dist/chess/${name}`, 'utf8')}])))
await mkdir('.cloudflare', {recursive: true})
await writeFile('.cloudflare/worker.mjs', `const assets = ${JSON.stringify(assets)};
${await readFile('scripts/edge.mjs', 'utf8')}`)

const mapDir='chess/maps/meridian',manifest=JSON.parse(await readFile('.meridian/manifest.json','utf8'))
await rm('.cloudflare/static',{recursive:true,force:true})
for(const root of ['dist','.cloudflare/static']){
  const dest=root+'/'+mapDir
  await mkdir(dest,{recursive:true})
  await cp('.meridian/manifest.json',dest+'/manifest.json')
  for(const [key,section] of Object.entries(manifest.sections))await cp('.meridian/'+key+'.json',dest+'/'+section.file)
}
const cacheRules=Object.values(manifest.sections).map(s=>'/'+mapDir+'/'+s.file+'\n  Cache-Control: public, max-age=31536000, immutable')
await writeFile('.cloudflare/static/_headers',['/'+mapDir+'/manifest.json\n  Cache-Control: no-cache',...cacheRules].join('\n')+'\n')
