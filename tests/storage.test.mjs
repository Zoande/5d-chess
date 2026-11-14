import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, readFile, writeFile, readdir, stat, mkdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {DatabaseSync} from 'node:sqlite'
import {ChessStore} from '../server/storage.ts'
import {initialState} from '../src/model.ts'
import {profile} from '../server/accounts.ts'
import {grantSet,listSet,buyListing} from '../server/economy.ts'
import {setById,planSet} from '../src/collection.ts'

const account=(name,coins=3480)=>({name,salt:'fixture-salt',hash:'fixture-password-hash',rating:{value:1200,games:0},wallet:{starterGranted:true,coins,inventory:[],loadout:{icon:'default',pieces:{}}}})
const room=(code)=>({code,title:code,owner:'Alice',seats:{red:'Alice',yellow:'Bob'},state:initialState(2,'classic',['red','yellow']),journal:[],results:[],locked:{},created:100,rated:true})
function fixture(){return {users:[account('Alice'),account('Bob',4120)],logins:{['a'.repeat(64)]:{user:'Alice',expires:Date.now()+86400000}},rooms:[room('ABCD'),room('EFGH')],listings:[],adminCoinGrants:[{id:'existing-3000-bonus',amountPerAccount:3000,accountCount:2}]}}
async function directory(t){const dir=await mkdtemp(join(tmpdir(),'chess-sqlite-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir}
async function seeded(t){const dir=await directory(t),data=fixture();await writeFile(join(dir,'multiplayer.json'),JSON.stringify(data));return {dir,data}}
async function child(code,dir){return new Promise((resolveChild,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',code,dir],{stdio:['ignore','pipe','pipe']});let errors='';p.stderr.on('data',chunk=>errors+=chunk);p.once('error',reject);p.once('exit',(code,signal)=>resolveChild({code,signal,errors}))})}
const moduleUrl=new URL('../server/storage.ts',import.meta.url).href

test('legacy migration round-trips all records and bonus metadata, backs up source, and never imports twice',async t=>{
 const {dir,data}=await seeded(t),legacy=await readFile(join(dir,'multiplayer.json'))
 let store=new ChessStore(dir)
 try{
  assert.deepEqual(store.snapshot(),data)
  assert.deepEqual(store.check(),{schema:1,accounts:2,sessions:1,rooms:2,listings:0})
  assert.equal(store.transaction(unit=>profile(unit.users.get('Alice')).coins),3480)
  const backups=await readdir(join(dir,'backups'));assert.equal(backups.length,1)
  assert.deepEqual(await readFile(join(dir,'backups',backups[0])),legacy)
  assert.equal((await stat(join(dir,'backups',backups[0]))).mode&0o077,0)
  assert.equal((await stat(join(dir,'chess.sqlite'))).mode&0o077,0)
 }finally{store.close()}
 assert.deepEqual(await readFile(join(dir,'multiplayer.json')),legacy)
 data.users[0].wallet.coins=0;await writeFile(join(dir,'multiplayer.json'),JSON.stringify(data))
 store=new ChessStore(dir)
 try{assert.equal(store.transaction(unit=>profile(unit.users.get('Alice')).coins),3480);assert.equal(store.snapshot().adminCoinGrants.length,1)}finally{store.close()}
})

test('failed commands and failed commits roll back wallets, sessions and games without leaking cached objects',async t=>{
 const {dir}=await seeded(t),store=new ChessStore(dir)
 try{
  const before=store.snapshot()
  assert.throws(()=>store.transaction(unit=>{
   unit.users.get('Alice').wallet.coins-=100;unit.users.get('Bob').wallet.coins+=100
   unit.rooms.get('ABCD').state.round++
   unit.putSession('failed-session',{user:'Alice',expires:9999999999999})
   throw Error('Rejected operation')
  }),/Rejected operation/)
  assert.deepEqual(store.snapshot(),before)
  assert.throws(()=>store.transaction(unit=>{unit.users.get('Alice').wallet.coins=0;unit.users.add('alice',account('alice'))}),/UNIQUE/)
  assert.deepEqual(store.snapshot(),before)
  assert.equal(store.transaction(unit=>unit.users.get('Alice').wallet.coins),3480)
  assert.throws(()=>store.putSession('outside',{user:'Alice',expires:100}),/require a transaction/)
 }finally{store.close()}
})

test('wallet activity does not rewrite games, and lobby summaries change only with their game',async t=>{
 const {dir}=await seeded(t),store=new ChessStore(dir),reader=new DatabaseSync(join(dir,'chess.sqlite'),{readOnly:true})
 try{
  const versions=()=>reader.prepare('SELECT code,revision FROM rooms ORDER BY code').all().map(row=>({...row}))
  const before=versions()
  store.transaction(unit=>{unit.users.get('Alice').wallet.coins+=10})
  assert.deepEqual(versions(),before)
  assert.equal(store.memberRooms('Alice').find(r=>r.code==='ABCD').myTurn,true)
  store.transaction(unit=>{const game=unit.rooms.get('ABCD');game.state.turn='yellow';game.state.round++})
  assert.deepEqual(versions(),[{code:'ABCD',revision:2},{code:'EFGH',revision:1}])
  assert.equal(store.memberRooms('Alice').find(r=>r.code==='ABCD').myTurn,false)
  assert.equal(store.memberRooms('Bob').find(r=>r.code==='ABCD').myTurn,true)
  assert.equal(store.availableRooms().length,0)
 }finally{reader.close();store.close()}
})

test('transaction boundaries reject async work and expose newly created identities consistently',async t=>{
 const dir=await directory(t),store=new ChessStore(dir)
 try{
  let ran=false
  assert.throws(()=>store.transaction(async()=>{ran=true}),/must be synchronous/)
  assert.equal(ran,false)
  assert.throws(()=>store.transaction(unit=>{unit.users.add('Lost',account('Lost'));return Promise.resolve()}),/must be synchronous/)
  assert.equal(store.accountName('Lost'),undefined)
  store.transaction(unit=>{unit.users.add('Alice',account('Alice'));assert.equal(unit.findAccount('ALICE'),unit.users.get('Alice'))})
  assert.equal(store.check().accounts,1)
 }finally{store.close()}
})

test('separate processes serialize competing wallet changes instead of overwriting stale snapshots',async t=>{
 const {dir}=await seeded(t);new ChessStore(dir).close()
 const code=`import {ChessStore} from ${JSON.stringify(moduleUrl)};const store=new ChessStore(process.argv[1]);try{for(let i=0;i<12;i++)store.transaction(unit=>{unit.users.get('Alice').wallet.coins++})}finally{store.close()}`
 const results=await Promise.all([child(code,dir),child(code,dir),child(code,dir)])
 for(const r of results)assert.equal(r.code,0,r.errors)
 const store=new ChessStore(dir)
 try{assert.equal(store.snapshot().users[0].wallet.coins,3480+36)}finally{store.close()}
})

test('a killed writer preserves committed rewards and discards its unfinished transaction',async t=>{
 const {dir}=await seeded(t);new ChessStore(dir).close()
 const result=await child(`import {ChessStore} from ${JSON.stringify(moduleUrl)};const store=new ChessStore(process.argv[1]);store.transaction(unit=>{unit.users.get('Alice').wallet.coins+=25});store.transaction(unit=>{unit.putSession('unfinished',{user:'Alice',expires:9999999999999});process.kill(process.pid,'SIGKILL')})`,dir)
 assert.equal(result.signal,'SIGKILL')
 const store=new ChessStore(dir)
 try{assert.equal(store.snapshot().users[0].wallet.coins,3505);assert.equal(store.session('unfinished'),undefined);assert.equal(store.check().accounts,2)}finally{store.close()}
})

test('online SQLite backup is private, complete and independently recoverable',async t=>{
 const {dir}=await seeded(t),store=new ChessStore(dir),recovery=join(dir,'recovery')
 try{
  store.transaction(unit=>{unit.users.get('Alice').wallet.coins+=17})
  const expected=store.snapshot(),destination=join(recovery,'chess.sqlite')
  await store.backup(destination)
  assert.equal((await stat(destination)).mode&0o077,0)
  await assert.rejects(store.backup(destination),/already exists/)
  store.transaction(unit=>{unit.users.get('Alice').wallet.coins=1})
  const restored=new ChessStore(recovery,{readOnly:true})
  try{assert.deepEqual(restored.snapshot(),expected);assert.equal(restored.check().rooms,2)}finally{restored.close()}
 }finally{store.close()}
})

test('corrupt legacy files, invalid references and future schemas fail closed instead of starting empty',async t=>{
 const dir=await directory(t),path=join(dir,'multiplayer.json')
 await writeFile(path,'{corrupt')
 assert.throws(()=>new ChessStore(dir),/not valid JSON/)
 const data=fixture();data.logins.bad={user:'Missing',expires:100};await writeFile(path,JSON.stringify(data))
 assert.throws(()=>new ChessStore(dir),/FOREIGN KEY/)
 await writeFile(path,JSON.stringify(fixture()))
 const good=new ChessStore(dir);assert.equal(good.check().accounts,2);good.close()
 const sql=new DatabaseSync(join(dir,'chess.sqlite'));sql.exec('PRAGMA user_version=99');sql.close()
 assert.throws(()=>new ChessStore(dir),/Unsupported chess storage schema 99/)
 const untouched=new DatabaseSync(join(dir,'chess.sqlite'),{readOnly:true});assert.equal(untouched.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,2);untouched.close()
})

test('operator commands migrate once, verify backups and export privately without overwriting files',async t=>{
 const {dir,data}=await seeded(t)
 const run=(args)=>new Promise((resolveRun,reject)=>{
  const p=spawn(process.execPath,['dist/storage-admin.mjs',...args],{env:{...process.env,DATA_DIR:dir},stdio:['ignore','pipe','pipe']})
  let output='',errors='';p.stdout.on('data',c=>output+=c);p.stderr.on('data',c=>errors+=c)
  p.once('error',reject);p.once('exit',code=>resolveRun({code,output,errors}))
 })
 let r=await run(['migrate']);assert.equal(r.code,0,r.errors);assert.equal(JSON.parse(r.output).accounts,2)
 r=await run(['migrate']);assert.equal(r.code,0,r.errors)
 const exported=join(dir,'private','compatibility.json'),backup=join(dir,'private','backup.sqlite')
 r=await run(['export',exported]);assert.equal(r.code,0,r.errors)
 assert.deepEqual(JSON.parse(await readFile(exported,'utf8')),data)
 assert.equal((await stat(exported)).mode&0o077,0)
 assert.notEqual((await run(['export',exported])).code,0)
 r=await run(['backup',backup]);assert.equal(r.code,0,r.errors)
 const copy=new DatabaseSync(backup,{readOnly:true});assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');copy.close()
 assert.notEqual((await run(['backup',backup])).code,0)
 r=await run(['check']);assert.equal(r.code,0,r.errors);assert.equal(JSON.parse(r.output).rooms,2)
})


test('whole-Set sales roll back all members on failure and persist once across restart',async t=>{
 const {dir}=await seeded(t),set=setById('set-skin-etc');let store=new ChessStore(dir)
 let id
 try{
  store.transaction(unit=>{const seller=unit.users.get('Alice');grantSet(seller,set);id=listSet(seller,unit.listings(),set.id,1000,'Complete court','durable-set-fixture').id})
  const before=store.snapshot()
  assert.throws(()=>store.transaction(unit=>{buyListing(unit.users.get('Bob'),[unit.users.get('Alice'),unit.users.get('Bob')],unit.listings(),id);throw Error('Interrupted sale')}),/Interrupted sale/)
  assert.deepEqual(store.snapshot(),before)
  store.transaction(unit=>buyListing(unit.users.get('Bob'),[unit.users.get('Alice'),unit.users.get('Bob')],unit.listings(),id))
 }finally{store.close()}
 store=new ChessStore(dir)
 try{
  const snapshot=store.snapshot(),seller=snapshot.users.find(u=>u.name==='Alice'),buyer=snapshot.users.find(u=>u.name==='Bob')
  assert.equal(seller.wallet.coins,4480);assert.equal(buyer.wallet.coins,3120);assert.equal(seller.wallet.inventory.length,0);assert.equal(buyer.wallet.inventory.length,12);assert.equal(planSet(buyer.wallet.inventory,set).complete,true);assert.equal(snapshot.listings.length,0)
  assert.throws(()=>store.transaction(unit=>buyListing(unit.users.get('Bob'),[unit.users.get('Alice'),unit.users.get('Bob')],unit.listings(),id)),/sold|available/)
  assert.deepEqual(store.snapshot(),snapshot)
 }finally{store.close()}
})
