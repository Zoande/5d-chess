import test from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import WebSocket from 'ws'
import {createApplication} from '../server/application.ts'
import {book} from '../server/custody.ts'
import {ChessStore} from '../server/storage.ts'
import {SnapshotWriter,applyFrame} from '../shared/world/protocol.ts'
import release from '../.meridian/manifest.json' with {type:'json'}

test('deltas preserve prior snapshots, removed properties and array changes',()=>{
  const writer=new SnapshotWriter()
  const first={id:'a',now:1,players:[{name:'p',x:3,z:0}],residential:{doors:{a:2}},interaction:'lender'}
  const v=applyFrame(undefined,writer.frame(first))
  first.players[0].x++;delete first.interaction;first.now=2
  const next=applyFrame(v,writer.frame(first));assert.deepEqual(next,first)
  assert.equal(v.players[0].x,3);assert.equal(v.interaction,'lender')
  assert.equal(v.residential,next.residential)
})
test('only remote poses lose sub-millimetre precision on the wire',()=>{
  const pose={x:1.123456,z:-8.345678,yaw:.07345},coins=17.123456
  const view={id:'city',now:1000,you:pose,players:[pose],coins}
  const result=new SnapshotWriter().frame(view).full
  assert.deepEqual(result.you,pose)
  assert.deepEqual(result.players[0],{x:1.123,z:-8.346,yaw:.073})
  assert.equal(result.coins,coins)
})

test('live movement reaches a second observer, commands survive lost acks, resume starts from a fresh snapshot',{timeout:15000},async t=>{
  const db=new ChessStore('.',{memory:true}),app=createApplication(db),server=app.createServer()
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const base='http://127.0.0.1:'+server.address().port
  t.after(async()=>{app.drain();server.closeAllConnections();await new Promise(r=>server.close(r));db.close()})
  async function cookie(username){
    const r=await fetch(base+'/api/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password:'fixture',confirm:'fixture'})})
    assert.equal(r.status,201);return r.headers.get('set-cookie').split(';')[0]
  }
  async function join(cookie,client){
    const url=base.replace('http','ws')+'/api/world/live?client='+client+'&v=1&map='+release.version
    const ws=new WebSocket(url,{headers:{cookie}}),frames=[],started=performance.now()
    let current,epoch
    ws.on('message',raw=>{
      const m=JSON.parse(raw)
      if(m.type==='hello')epoch=m.epoch
      if(m.type==='frame')current=applyFrame(current,m.frame)
      frames.push(m)
    })
    async function until(pred){
      while(!pred()){if(performance.now()-started>10000)throw Error('Missing city frame');await new Promise(r=>setTimeout(r,10))}
    }
    await until(()=>current)
    return {ws,epoch,frames,until,get view(){return current},send:m=>ws.send(JSON.stringify(m))}
  }
  const aCookie=await cookie('First walker'),bCookie=await cookie('Second walker')
  const client='first-browser-stream',a=await join(aCookie,client),b=await join(bCookie,'second-browser-stream')
  const cmd={type:'command',id:1,epoch:a.epoch,action:'chat',seq:1,input:{},data:{text:'Here by the door'}}
  a.send(cmd);await b.until(()=>b.view.chat.some(c=>c.text===cmd.data.text))
  a.ws.terminate();await once(a.ws,'close')
  const again=await join(aCookie,client)
  again.send(cmd);await again.until(()=>again.frames.some(m=>m.type==='ack'&&m.id===1))
  assert.equal(again.frames.find(m=>m.type==='ack').status,200)
  assert.equal(again.view.chat.filter(c=>c.text===cmd.data.text).length,1)
  const p=again.view.you
  again.send({type:'move',seq:2,input:{world:again.view.id,x:p.x+.4,z:p.z,yaw:1}})
  await b.until(()=>b.view.players.some(other=>other.name===p.name&&other.x>p.x+.1))
  const other=await join(aCookie,'new-browser-stream')
  other.send(cmd)
  await other.until(()=>other.frames.some(m=>m.type==='ack'&&m.status===409))
  b.send({type:'sleep',hidden:true})
  db.transaction(tx=>book(tx,'First walker',3,Date.now()))
  await again.until(()=>again.frames.some(m=>m.type==='frame'&&m.frame.full?.arcade?.custody))
  b.send({type:'sleep',hidden:false})
  await b.until(()=>b.view.chat.some(line=>line.name==='Inmate 01'))
  assert.ok(!JSON.stringify(b.view).includes('First walker'))
  assert.deepEqual(again.view.players,[])
  again.send({...cmd,id:2,seq:3})
  await again.until(()=>again.frames.some(m=>m.type==='ack'&&m.id===2&&m.status===423))
  const closed=once(again.ws,'close')
  const logout=await fetch(base+'/api/logout',{method:'POST',headers:{cookie:aCookie,'content-type':'application/json'},body:'{}'})
  assert.ok(logout.ok)
  assert.equal((await closed)[0],4401)
})
