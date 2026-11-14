import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {casinoBet,rouletteResult,casinoView} from '../server/casino.ts'
import {grossMultiplier,winProbability,CASINO_OWNER} from '../src/casino-model.ts'
import {ChessStore} from '../server/storage.ts'
import {casinoApi} from '../server/casino-api.ts'
import {ensureAccount} from '../server/accounts.ts'

const account=(name,coins=3480)=>ensureAccount({name,salt:'fixture',hash:'fixture',wallet:{coins,starterGranted:true,inventory:[],loadout:{icon:'default',pieces:{}}}})
const bet=(overrides={})=>({game:'dice',choice:1,stake:100,sequence:1,requestId:'casino-fixture-0001',...overrides})

test('casino odds, roulette boundaries and net payouts match the disclosed schedule',()=>{
 for(const game of ['dice','roulette'])for(const choice of game==='dice'?[1,2,3,4,5,6]:[0,1,36,'white','black','odd','even','low','high'])assert.ok(Math.abs(grossMultiplier(game,choice)*winProbability(game,choice)-.98)<1e-12)
 assert.equal(rouletteResult(0),0);assert.equal(rouletteResult(35999),0)
 for(let n=1;n<=36;n++){assert.equal(rouletteResult(36000+(n-1)*49000),n);assert.equal(rouletteResult(36000+n*49000-1),n)}
 const alice=account('Alice'),owner=account(CASINO_OWNER,0),accounts=[alice,owner]
 owner.settings.moveNotifications=false
 const r=casinoBet(alice,accounts,bet(),1000,1)
 assert.equal(r.round.gross,588);assert.equal(r.round.tax,4.88);assert.equal(alice.wallet.coins,3963.12);assert.equal(owner.wallet.coins,4.88);assert.equal(owner.notifications.length,1);assert.equal(owner.notifications[0].kind,'casino');assert.equal(owner.notifications[0].game,'dice');assert.match(owner.notifications[0].title,/Alice won 488 coins/);assert.match(owner.notifications[0].detail,/received 4.88 coins/)
 assert.deepEqual(casinoBet(alice,accounts,bet(),2000,6).round,r.round)
 assert.equal(alice.wallet.coins,3963.12)
 assert.throws(()=>casinoBet(alice,accounts,bet({stake:101}),2000,1),/different bet/)
 assert.throws(()=>casinoBet(alice,accounts,bet({requestId:'new-fixture-0002'}),2000,1),/sequence changed/)
 const losing=casinoBet(alice,accounts,bet({sequence:2,requestId:'casino-fixture-0002'}),3000,6)
 assert.equal(losing.round.tax,0);assert.equal(losing.round.gross,0);assert.equal(alice.wallet.coins,3863.12);assert.equal(owner.wallet.coins,4.88);assert.equal(owner.notifications.length,1)
})

test('invalid and unsupported wagers cannot debit coins or create a receipt',()=>{
 for(const input of [bet({stake:0}),bet({stake:1.5}),bet({stake:100001}),bet({choice:7}),bet({sequence:0}),bet({requestId:'bad'}),bet({game:'unknown'})]){
  const a=account('Alice');assert.throws(()=>casinoBet(a,[a],input,0,1));assert.equal(a.wallet.coins,3480);assert.equal(a.casino?.sequence??0,0)
 }
 const poor=account('Poor',1);assert.throws(()=>casinoBet(poor,[poor],bet(),0,1),/Not enough/);assert.equal(poor.wallet.coins,1)
})

test('SQLite commits treasury tax, user payout and receipt together and survives reopen',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'chess-casino-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 let store=new ChessStore(directory)
 store.transaction(unit=>unit.users.add('Alice',account('Alice')))
 let winning
 store.transaction(unit=>{
  const alice=unit.users.get('Alice'),accounts=[alice]
  winning=casinoBet(alice,accounts,bet(),1000,1)
  for(const a of accounts)if(!unit.findAccount(a.name))unit.users.add(a.name,a)
 })
 const after=store.snapshot();assert.equal(after.users.find(a=>a.name===CASINO_OWNER).wallet.coins,4.88)
 assert.throws(()=>store.transaction(unit=>{
  const alice=unit.users.get('Alice'),owner=unit.findAccount(CASINO_OWNER)
  casinoBet(alice,[alice,owner],bet({sequence:2,requestId:'casino-fixture-0002'}),2000,1)
  throw Error('injected commit abort')
 }),/commit abort/)
 assert.deepEqual(store.snapshot(),after)
 store.close();store=new ChessStore(directory)
 try{
  const repeated=store.transaction(unit=>casinoApi(unit,unit.users.get('Alice'),'/api/casino/bet','POST',bet()))
  assert.deepEqual(repeated.value.round,winning.round);assert.deepEqual(store.snapshot(),after)
  assert.equal(store.transaction(unit=>casinoView(unit.users.get('Alice'))).nextSequence,2)
 }finally{store.close()}
})
