// Run with Node 24 after world:build. All users and sessions live in memory.
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {setTimeout as sleep} from 'node:timers/promises'
import {WebSocket} from 'ws'
import {ChessStore} from '../../server/storage.ts'
import {tokenHash} from '../../server/security.ts'
import {createApplication} from '../../server/application.ts'
import {applyFrame,CITY_PROTOCOL} from '../../shared/world/protocol.ts'
import release from '../../.meridian/manifest.json' with {type:'json'}

function percentile(values,p){
  assert.ok(values.length,'observed samples')
  return +values.toSorted((a,b)=>a-b)[Math.ceil(values.length*p)-1].toFixed(1)
}
for(const count of [2,10,50]){
  const store=new ChessStore('.',{memory:true}),app=createApplication(store),server=app.createServer()
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const url='ws://127.0.0.1:'+server.address().port+'/api/world/live?map='+release.version+'&v='+CITY_PROTOCOL
  const sends=new Map(),latencies=[],ticks=[],peers=[]
  let bytes=0,measuring=false
  try{
    for(let i=0;i<count;i++){
      const name='Walker'+i,token=randomBytes(32).toString('hex')
      store.transaction(tx=>{
        tx.users.add(name,{name,hash:'',salt:'',wallet:{coins:100,starterGranted:true,inventory:[],loadout:{pieces:{},icon:'default'}}})
        tx.putSession(tokenHash(token),{user:name,expires:Date.now()+60000})
      })
      const ws=new WebSocket(url+'&client=bench-client-'+i,{headers:{cookie:'multiverse_session='+token}})
      const peer={ws};peers.push(peer)
      await new Promise((resolve,reject)=>{
        ws.on('error',reject)
        ws.on('message',raw=>{
          const m=JSON.parse(raw)
          if(m.type!=='frame')return
          peer.view=applyFrame(peer.view,m.frame)
          if(measuring){
            bytes+=raw.length;ticks.push(m.frame.tickMs)
            if(i===1){
              const yaw=peer.view.players.find(p=>p.name==='Walker0')?.yaw
              const key=Math.round(yaw*100),at=sends.get(key)
              if(at!==undefined){latencies.push(performance.now()-at);sends.delete(key)}
            }
          }
          resolve()
        })
      })
    }
    const start=performance.now();measuring=true
    for(let sequence=1;sequence<=16;sequence++){
      sends.set(sequence,performance.now())
      for(const {ws,view} of peers){
        ws.send(JSON.stringify({type:'move',seq:sequence,input:{world:view.id,zone:view.you.zone,x:view.you.x+.03,z:view.you.z,yaw:sequence/100}}))
      }
      await sleep(400)
    }
    measuring=false
    const seconds=(performance.now()-start)/1000
    console.log(JSON.stringify({peers:count,movementsObserved:latencies.length,sent:16,observerMsP50:percentile(latencies,.5),observerMsP95:percentile(latencies,.95),
      sampledSimulationMsP95:percentile(ticks,.95),bytesPerPeerSecond:Math.round(bytes/count/seconds)}))
  }finally{
    for(const p of peers)p.ws.terminate()
    app.drain();await new Promise(resolve=>server.close(resolve));store.close()
  }
}
