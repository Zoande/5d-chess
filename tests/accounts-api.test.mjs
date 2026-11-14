import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:net'
import {initialState,index} from '../src/model.ts'

test('ratings, notifications and settings are private, durable and settled atomically',async t=>{
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r))
 const data=await mkdtemp(join(tmpdir(),'chess-accounts-')),base=`http://127.0.0.1:${port}`
 let child
 const start=async()=>{child=spawn(process.execPath,['dist/server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:data},stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(base+'/api/me')).ok)return}catch{}await new Promise(r=>setTimeout(r,30))}throw new Error('No server')}
 const stop=async()=>{child.kill();await new Promise(r=>child.once('exit',r))}
 t.after(async()=>{if(child?.exitCode===null)await stop();await rm(data,{recursive:true,force:true})})
 const call=async(path,body,cookie)=>{const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 await start()
 assert.equal((await call('/notifications')).status,401)
 const alice=(await call('/signup',{username:'Alice',password:'p',confirm:'p'})).cookie
 const bob=(await call('/signup',{username:'Bob',password:'p',confirm:'p'})).cookie
 const me=await call('/me',undefined,alice);assert.equal(me.data.profile.rating.value,1200);assert.equal('hash' in me.data.profile,false)
 const prefs={movement:'classic',players:3,moveNotifications:true}
 assert.equal((await call('/settings',prefs,alice)).status,200)
 assert.equal((await call('/settings',{...prefs,players:7},alice)).status,400)
 const room=(await call('/games',{title:'Rated duel',playerCount:2,movement:'classic',rated:true},alice)).data
 await call(`/games/${room.code}/join`,{},bob)
 const notifications=(await call('/notifications',undefined,alice)).data
 assert.ok(notifications.items.some(n=>n.kind==='join'))
 await call('/notifications/read',{ids:[notifications.items[0].id]},bob)
 assert.equal((await call('/notifications',undefined,alice)).data.items[0].read,false)
 await call('/notifications/read',{all:true},alice)
 assert.equal((await call('/notifications',undefined,alice)).data.unread,0)
 const privateRoom=(await call('/games',{title:'Private',playerCount:2,movement:'live',rated:true,password:'secret'},alice)).data
 assert.equal(privateRoom.rated,true)
 // A legal near-finish position tests the actual orders endpoint and persisted settlement.
 await stop()
 const path=join(data,'multiplayer.json'),db=JSON.parse(await readFile(path,'utf8')),stored=db.rooms.find(r=>r.code===room.code)
 const state=initialState(2,'classic',['red','yellow']),cells=Array(196).fill(null)
 for(const [x,y,player,kind]of [[3,10,'red','K'],[7,5,'red','R'],[7,3,'yellow','K']])cells[index({x,y})]={player,kind,moved:true}
 stored.state={...state,universes:[{...state.universes[0],boards:[{...state.universes[0].boards[0],cells}]}]}
 await writeFile(path,JSON.stringify(db));await start()
 const order={player:'red',from:{x:7,y:5,u:0,t:0},to:{x:7,y:3,u:0,t:0},route:[0]}
 const responses=await Promise.all([call(`/games/${room.code}/orders`,{orders:[order]},alice),call(`/games/${room.code}/orders`,{orders:[order]},alice)])
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409])
 const winner=(await call('/me',undefined,alice)).data.profile,loser=(await call('/me',undefined,bob)).data.profile
 assert.equal(winner.rating.value,1216);assert.equal(loser.rating.value,1184)
 assert.equal(winner.rating.games,1);assert.equal('ratings' in winner,false);assert.equal(winner.coins,120);assert.equal(loser.coins,60)
 const board=(await call('/leaderboard?pool=classic-duel',undefined,alice)).data
 assert.equal(board.players[0].name,'Alice');assert.equal(board.players[1].name,'Bob')
 const feed=(await call('/notifications',undefined,alice)).data.items
 assert.equal(feed.filter(n=>n.kind==='rating').length,1)
 assert.ok(feed.some(n=>n.kind==='result'))
 await stop();await start()
 assert.deepEqual((await call('/me',undefined,alice)).data.profile,winner)
 assert.deepEqual((await call('/me',undefined,alice)).data.profile.settings,{...prefs,avatar:'default'})
 assert.equal((await call('/notifications',undefined,alice)).data.items.filter(n=>n.kind==='rating').length,1)
})
