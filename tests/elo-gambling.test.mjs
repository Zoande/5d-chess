import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ChessStore} from '../server/storage.ts'
import {ensureAccount} from '../server/accounts.ts'
import {eloApi,makeValuation,eloUnitPrice,eloReward} from '../server/elo-gambling.ts'
import {nextReset,dayKey} from '../src/collection.ts'
import {cycleEloStake} from '../src/casino-model.ts'
const start=Date.parse('2026-11-14T20:00:00Z')
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'chess-elo-'));let store=new ChessStore(dir);t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true})});store.transaction(u=>{for(const [name,elo,coins]of [['Alice',1800,0],['CasinoOwner',1200,50]])u.users.add(name,ensureAccount({name,salt:'fixture',hash:'fixture',rating:{value:elo,games:20},wallet:{coins,starterGranted:true,inventory:[],loadout:{icon:'default',pieces:{}}}}))});return {get store(){return store},reopen(){store.close();store=new ChessStore(dir)},call(path='',data,now=start,draw){return store.transaction(u=>eloApi(u,store,u.users.get('Alice'),'/api/casino/elo'+path,data===undefined?'GET':'POST',data??{},now,draw)).value}}}
function enter(f,now=start){const offer=f.call('/trigger',{reason:'chance'},now);assert.equal(offer.accepted,true);return f.call('/decision',{day:offer.day,offerId:offer.offerId,accept:true},now)}
const bet=(v,sequence=1,overrides={})=>({requestId:'elo-fixture-round-'+sequence,sequence,game:'dice',currency:'elo',choice:1,stake:50,quoteDay:v.day,eloRating:v.elo,...overrides})

test('daily curve is smooth and monotonic, prices each lost-range point, and keeps tails valuable',()=>{
 const v=makeValuation([900,1100,1200,1200,1300,1500,1800],start)
 let before=0;for(let e=0;e<=5000;e+=10){const price=eloUnitPrice(e,v);assert.ok(price>=before);assert.ok(price<=1000);before=price}
 const low=eloReward(700,100,v),mid=eloReward(1200,100,v),high=eloReward(1800,100,v);assert.ok(low<5);assert.ok(mid>300&&mid<1000);assert.ok(high>mid*6)
 const sum=Array.from({length:50},(_,i)=>eloUnitPrice(1800-i,v)).reduce((a,b)=>a+b,0);assert.equal(eloReward(1800,50,v),Math.round(sum*10000)/10000)
 assert.equal(cycleEloStake(100,50),50);assert.equal(cycleEloStake(50,50),100);assert.equal(cycleEloStake(100,1),1)
})

test('consent and daily refusal are server gates; wins keep Elo and pay the full quote with no treasury tax',async t=>{
 const f=await fixture(t),initial=f.call();assert.equal(initial.allowed,true)
 assert.throws(()=>f.call('/bet',bet(initial)),/closed/)
 assert.equal(f.call('/trigger',{reason:'broke'}).accepted,false)
 const v=enter(f),quoted=v.quotes[50],r=f.call('/bet',bet(v),start,1)
 assert.equal(r.round.won,true);assert.equal(r.round.tax,0);assert.equal(r.round.credited,quoted);assert.equal(r.coins,quoted);assert.equal(r.profile.rating.value,1800);assert.equal(r.eloGambling.lifetimeLost,0)
 const owner=f.store.snapshot().users.find(a=>a.name==='CasinoOwner');assert.equal(owner.wallet.coins,50);assert.equal(owner.notifications.length,0)
 const after=f.store.snapshot();assert.deepEqual(f.call('/bet',bet(v),start+1,6).round,r.round);assert.deepEqual(f.store.snapshot(),after)
 assert.throws(()=>f.call('/bet',bet(v,1,{stake:51})),/different bet/)
 const decline=f.call('/decision',{day:v.day,offerId:v.offerId,accept:false});assert.equal(decline.allowed,false);assert.equal(f.call('/trigger',{reason:'marathon'}).accepted,false)
})

test('losses, five-round limit and lifetime counters commit once; midnight resets eligibility without erasing history',async t=>{
 const f=await fixture(t);let v=enter(f),last
 for(let i=1;i<=5;i++){const b=bet(v,i);last=f.call('/bet',b,start,6);assert.equal(last.round.eloLost,50);assert.equal(last.round.coinReward,v.quotes[50]);assert.equal(last.round.credited,0);v=last.eloGambling}
 assert.equal(v.elo,1550);assert.equal(v.used,5);assert.equal(v.allowed,false);assert.equal(v.stage,'normal');assert.equal(v.lifetimeLost,250);assert.equal(v.totalLost,250)
 assert.throws(()=>f.call('/bet',bet(v,6)),/closed/)
 f.reopen();assert.equal(f.call().lifetimeLost,250)
 const next=nextReset(start)+1,newDay=f.call('',undefined,next);assert.equal(newDay.allowed,true);assert.equal(newDay.used,0);assert.equal(newDay.stage,'normal');assert.equal(newDay.lifetimeLost,250);assert.equal(newDay.day,dayKey(next));assert.notEqual(newDay.day,v.day)
 assert.throws(()=>f.call('/decision',{day:v.day,offerId:v.offerId,accept:false},next),/new day/)
 assert.equal(nextReset(Date.parse('2026-03-28T23:00:00Z'))-Date.parse('2026-03-28T23:00:00Z'),23*3600000)
 assert.equal(nextReset(Date.parse('2026-10-24T22:00:00Z'))-Date.parse('2026-10-24T22:00:00Z'),25*3600000)
})

test('stale rating/valuation, over-stakes and aborted SQL commits cannot change Elo, coins or counters',async t=>{
 const f=await fixture(t),v=enter(f),before=f.store.snapshot()
 for(const patch of [{stake:101},{stake:0},{stake:1.5},{choice:7},{eloRating:1801},{quoteDay:'2000-01-01'}]){assert.throws(()=>f.call('/bet',bet(v,1,patch)));assert.deepEqual(f.store.snapshot(),before)}
 assert.throws(()=>f.store.transaction(u=>{eloApi(u,f.store,u.users.get('Alice'),'/api/casino/elo/bet','POST',bet(v),start,6);throw Error('abort')}),/abort/);assert.deepEqual(f.store.snapshot(),before)
 f.store.transaction(u=>u.users.get('Alice').rating.value=5.5);const small=f.call();assert.equal(small.quotes.length,6);assert.throws(()=>f.call('/bet',bet(small,1,{stake:6})),/more Elo/);const lost=f.call('/bet',bet(small,1,{stake:5}),start,6);assert.equal(lost.profile.rating.value,.5);assert.equal(lost.eloGambling.allowed,true);assert.equal(lost.eloGambling.stage,'normal')
})

test('client encounter checks the actual minimum, 100 uninterrupted throws and exactly 0.001% per draw',async()=>{
 const {encounterTrigger}=await import('../src/casino/encounter.ts')
 const loss={game:'dice',won:false},win={game:'dice',won:true}
 assert.equal(encounterTrigger(loss,.9999,1,.9),'broke');assert.equal(encounterTrigger(win,0,1,.9),undefined)
 assert.equal(encounterTrigger(loss,1,99,.9),undefined);assert.equal(encounterTrigger(loss,1,100,.9),'marathon')
 assert.equal(encounterTrigger(win,500,1,.000009999),'chance');assert.equal(encounterTrigger(win,500,1,.00001),undefined)
 assert.equal(encounterTrigger({...loss,currency:'elo'},0,100,0),undefined)
})


test('existing accounts above the reduced five-wager limit close on access',async t=>{
 const f=await fixture(t);enter(f);f.store.transaction(u=>{const s=u.users.get('Alice').eloGambling;s.used=8;s.allowed=true;s.stage='active'})
 const v=f.call();assert.equal(v.used,8);assert.equal(v.allowed,false);assert.equal(v.stage,'normal');assert.throws(()=>f.call('/bet',bet(v,9)),/closed|sequence/)
})
