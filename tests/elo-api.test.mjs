import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {ChessStore} from '../server/storage.ts'
import {createApplication} from '../server/application.ts'
import {ensureAccount} from '../server/accounts.ts'

test('real Elo API serializes identical and competing requests without double loss or quota bypass',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'chess-elo-http-')),store=new ChessStore(dir),token='elo-api-fixture',app=createApplication(store),server=createServer(app.handle)
 store.transaction(u=>{for(const [name,rating,coins]of [['Alice',1234.5,0],['CasinoOwner',1200,23]])u.users.add(name,ensureAccount({name,salt:'fixture',hash:'fixture',rating:{value:rating,games:4},wallet:{coins,starterGranted:true,inventory:[],loadout:{icon:'default',pieces:{}}}}));u.putSession(createHash('sha256').update(token).digest('hex'),{user:'Alice',expires:Date.now()+600000})})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections()});store.close();await rm(dir,{recursive:true,force:true})});const base=`http://127.0.0.1:${server.address().port}`
 const call=async(path,data,auth=true)=>{const r=await fetch(base+'/api/casino'+path,{method:data===undefined?'GET':'POST',headers:{...(auth?{cookie:'multiverse_session='+token}:{}),...(data===undefined?{}:{'content-type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json()}}
 assert.equal((await call('/elo',undefined,false)).status,401)
 const offer=(await call('/elo/trigger',{reason:'chance'})).data;assert.equal(offer.accepted,true);const active=(await call('/elo/decision',{day:offer.day,offerId:offer.offerId,accept:true})).data
 assert.equal((await call('/bet',{game:'dice',choice:1,stake:25,sequence:1,requestId:'wrong-table-coins'})).status,409)
 const b={game:'dice',currency:'elo',choice:1,stake:50,sequence:1,requestId:'same-elo-http-request',quoteDay:active.day,eloRating:active.elo}
 const same=await Promise.all([call('/elo/bet',b),call('/elo/bet',b)]);assert.ok(same.every(r=>r.status===200));assert.deepEqual(same[0].data.round,same[1].data.round)
 const first=same[0].data.round;assert.equal(first.tax,0);assert.equal(first.credited,first.won?active.quotes[50]:0);assert.equal(same[0].data.eloGambling.used,1)
 const next=(await call('/elo')).data,b2={...b,sequence:2,stake:10,eloRating:next.elo,requestId:'competing-elo-http-a'}
 const competitors=await Promise.all([call('/elo/bet',b2),call('/elo/bet',{...b2,requestId:'competing-elo-http-b'})]);assert.deepEqual(competitors.map(r=>r.status).sort(),[200,409])
 const view=(await call('/elo')).data,casino=(await call('')).data,rounds=casino.recent.filter(r=>r.currency==='elo'),lost=rounds.reduce((n,r)=>n+(r.eloLost??0),0)
 assert.equal(view.used,2);assert.equal(view.elo,1234.5-lost);assert.equal(view.lifetimeLost,lost);assert.equal(view.totalLost,lost);assert.equal(casino.coins,Math.round(rounds.reduce((n,r)=>n+r.credited,0)*10000)/10000);assert.equal(store.snapshot().users.find(a=>a.name==='CasinoOwner').wallet.coins,23)
 assert.equal((await call('/elo/bet',{...b,requestId:'old-quote-new-request',sequence:3,eloRating:9999})).status,409);assert.equal((await call('/elo')).data.used,2)
})
