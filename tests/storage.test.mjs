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
