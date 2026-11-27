import {EventEmitter,once} from 'node:events'
import {applyFrame} from '../shared/world/protocol.ts'

const observations=new WeakMap()
export function observeWire(page){
  if(observations.has(page))return observations.get(page)
  const events=new EventEmitter()
  page.on('websocket',socket=>{
    if(!socket.url().includes('/api/world/live?'))return
    const pending=new Map()
    let view
    socket.on('framesent',({payload})=>{
      const m=JSON.parse(String(payload))
      if(m.type==='command'){pending.set(m.id,m);events.emit('send',m)}
    })
    socket.on('framereceived',({payload})=>{
      const m=JSON.parse(String(payload))
      if(m.type==='frame'){view=applyFrame(view,m.frame);events.emit('frame',view)}
      if(m.type==='ack'){events.emit('ack',{request:pending.get(m.id),view,...m});pending.delete(m.id)}
    })
  })
  observations.set(page,events);return events
}
export async function commandResult(page,action){
  const events=observeWire(page),signal=AbortSignal.timeout(12000)
  for(;;){
    const [result]=await once(events,'ack',{signal})
    if(result.request?.action===action)return result
  }
}
