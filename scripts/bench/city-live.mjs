import {SnapshotWriter} from '../../shared/world/protocol.ts'
import {benchmark} from './city.mjs'
const writers=new Map()
await benchmark((view,name,frame,count)=>{
  const key=count+'/'+name
  if(!writers.has(key))writers.set(key,new SnapshotWriter())
  return JSON.stringify({type:'frame',frame:writers.get(key).frame(view,frame)})
},true)
