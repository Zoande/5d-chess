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
import {ITEMS,MARKET_DESCRIPTION_LIMIT} from '../src/collection.ts'

test('authenticated top-100 and full rankings preserve global ranks; seller notes validate and persist atomically',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'chess-market-ranking-')),store=new ChessStore(dir),app=createApplication(store),server=createServer(app.handle)
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`
 t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections()});store.close();await rm(dir,{recursive:true,force:true})})
 const item=ITEMS.find(i=>i.type==='icon'&&!i.monthly),uid='a'.repeat(24),token='market-ranking-fixture'
 store.transaction(u=>{for(let i=0;i<105;i++){const name='Player'+String(i).padStart(3,'0');u.users.add(name,ensureAccount({name,salt:'fixture',hash:'fixture',rating:{value:1400-i,games:i},wallet:{coins:10000,starterGranted:true,inventory:i===104?[{uid,itemId:item.id,acquired:1}]:[],loadout:{icon:'default',pieces:{}}}}))}u.putSession(createHash('sha256').update(token).digest('hex'),{user:'Player104',expires:Date.now()+60000})})
 const call=async(path,body,authenticated=true)=>{const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{...(authenticated?{cookie:'multiverse_session='+token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
 assert.equal((await call('/leaderboard/full',undefined,false)).status,401)
 const top=(await call('/leaderboard')).data,full=(await call('/leaderboard/full')).data
 assert.equal(top.players.length,100);assert.equal(full.players.length,105);assert.deepEqual(top.players,full.players.slice(0,100));assert.equal(top.me.rank,105);assert.equal(full.players[104].name,'Player104')
 const before=store.snapshot();for(const description of ['x'.repeat(MARKET_DESCRIPTION_LIMIT+1),{},42,'bad\u0000note']){assert.equal((await call('/economy/list',{uid,price:100,description})).status,400);assert.deepEqual(store.snapshot(),before)}
 const note='<img src=x onerror=alert(1)>\nA rare find & a fair price.'
 assert.equal((await call('/economy/list',{uid,price:100,description:'  '+note+'  '})).status,200)
 const listing=(await call('/market')).data.listings[0];assert.equal(listing.description,note)
 const reopened=new ChessStore(dir);try{assert.equal(reopened.snapshot().listings[0].description,note)}finally{reopened.close()}
 assert.equal((await call('/economy/cancel',{id:listing.id})).status,200)
 assert.equal((await call('/economy/list',{uid,price:100})).status,200);assert.equal((await call('/market')).data.listings[0].description,undefined)
})
