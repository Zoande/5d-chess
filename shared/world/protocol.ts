import type {WorldView} from '../../src/world/model.ts'

export const CITY_PROTOCOL=1
export type Input=Record<string,unknown>
// Patch arrays replace or delete values. Objects group edits under a shared parent.
type Patch=[]|[unknown]|{[key:string]:Patch}
export interface Frame {now:number;full?:WorldView;changes?:Patch;seq:number;input:number;tickMs:number;projectionMs?:number}
export type Message={type:'hello';epoch:string;protocol:number}|{type:'frame';frame:Frame}|{type:'ack';id:number;status:number;message?:string}
export type ClientMessage={type:'move';seq:number;input:Input}|{type:'command';id:number;epoch:string;action:string;data:Input;seq:number;input:Input}|{type:'sleep';hidden:boolean}

// Ordered WebSocket delivery makes each delta relative to the preceding sent frame.
function changes(before:any,after:any):Patch|undefined{
  if(before===after)return
  if(!before||!after||typeof before!=='object'||typeof after!=='object'||Array.isArray(before)!==Array.isArray(after)||
    Array.isArray(after)&&before.length!==after.length)return [after]
  let patch:{[key:string]:Patch}|undefined
  for(const key of Object.keys(before))if(!Object.hasOwn(after,key))(patch??=Object.create(null))[key]=[]
  for(const key of Object.keys(after)){
    const child=changes(before[key],after[key])
    if(child)(patch??=Object.create(null))[key]=child
  }
  return patch
}
function apply(previous:any,patch:Patch):any{
  if(Array.isArray(patch))return patch[0]
  const copy=Array.isArray(previous)?previous.slice():{...previous}
  for(const [key,child] of Object.entries(patch)){
    if(Array.isArray(child)&&!child.length)delete copy[key]
    else Object.defineProperty(copy,key,{value:apply(previous[key],child),enumerable:true,writable:true,configurable:true})
  }
  return copy
}
const milli=(n:number)=>Math.round(n*1000)/1000
function wirePose<T extends {x:number;z:number;yaw?:number}>(pose:T):T{
  return {...pose,x:milli(pose.x),z:milli(pose.z),...(pose.yaw===undefined?{}:{yaw:milli(pose.yaw)})}
}
function networkView(view:WorldView){
  // Rendered transforms use millimetres. Keep the local authoritative pose,
  // transaction values and gameplay deadlines at their original precision.
  const traffic=view.traffic&&{...view.traffic,vehicles:view.traffic.vehicles.map(v=>({...wirePose(v),speed:milli(v.speed)}))}
  const contacts=view.arcade?.contacts.map(c=>({...wirePose(c),distance:c.distance===undefined?undefined:milli(c.distance)}))
  return {...view,players:view.players.map(wirePose),residents:view.residents?.map(wirePose),traffic,arcade:view.arcade&&{...view.arcade,contacts}}
}
export class SnapshotWriter {
  private previous?:WorldView
  private seq=0
  frame(view:WorldView,input=0,tickMs=0):Frame{
    // Several gameplay services expose live objects. Retain an owned wire snapshot.
    const current=JSON.parse(JSON.stringify(networkView(view))) as WorldView
    const frame:Frame={now:view.now,input,tickMs,seq:++this.seq}
    if(!this.previous||this.previous.id!==current.id||Boolean(current.arcade?.custody)!==Boolean(this.previous.arcade?.custody))frame.full=current
    else{
      frame.changes=changes(this.previous,current)??{}
    }
    this.previous=current
    return frame
  }
}
export function applyFrame(previous:WorldView|undefined,frame:Frame):WorldView{
  if(frame.full)return frame.full
  if(!previous||!frame.changes)throw Error('Missing city snapshot')
  return apply(previous,frame.changes) as WorldView
}
