import {shared} from './map-data.ts'
import {circle,CROSSINGS,distance,FLEET,PARKING,parkedCars,point,STREETS,type Point,type VehicleKind} from './city-plan.ts'

export type Axis='x'|'z'
export type Junction=Point&{id:string;roads:Set<string>;signal:boolean;round?:number}
export type Lane={id:string;street:string;from:string;to:string;limit:number;axis:Axis;points:Point[];length:number;next:string[]}
export type Vehicle=Point&{id:string;kind:VehicleKind;yaw:number;speed:number;turn:number;brake:boolean;paint?:number;parking?:string}
export type TrafficView={vehicles:Vehicle[];signals:Record<string,'x'|'z'|'all-red'>}
export const JUNCTIONS:Junction[]=shared.junctions.map(j=>({...j,roads:new Set(j.roads)}))
const intersections=new Map(JUNCTIONS.map(j=>[j.id,j]))
export const SIGNAL_HEADS=shared.signalHeads
export const LANES=new Map(shared.lanes.map(l=>[l.id,l]))
export function signalPhase(time:number,id:string):TrafficView['signals'][string]{
  const p=((time+id.length*327)%14400+14400)%14400
  return p<6250?'x':p<7200?'all-red':p<13450?'z':'all-red'
}
const length=(path:Point[])=>path.slice(1).reduce((l,p,i)=>l+distance(p,path[i]),0)
export function alongPath(path:readonly Point[],travel:number){
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],d=distance(a,b)
    if(d&&travel<=d||i===path.length-1){
      const t=d?Math.min(1,Math.max(0,travel/d)):0
      return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(b.x-a.x,b.z-a.z)}
    }
    travel-=d
  }
  return {...path[0],yaw:0}
}
const gateDistance=(lane:Lane)=>lane.street==='ring'?1.2:Math.min(3.65,lane.length*.75)
export const STOP_LINES=[...LANES.values()].filter(lane=>intersections.get(lane.to)?.signal).map(lane=>({
  ...alongPath(lane.points,Math.min(lane.length,lane.length-gateDistance(lane)+1.72)),
  width:STREETS.find(s=>s.id===lane.street)!.width/2-.24,
}))
function tangent(p:Point,q:Point,span:number){
  const d=distance(p,q)
  return point(p.x+(q.x-p.x)*span/d,p.z+(q.z-p.z)*span/d)
}
function bezier(a:Point,b:Point,c:Point,d:Point){
  return Array.from({length:13},(_,i)=>{
    const t=i/12,u=1-t
    return point(u**3*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t**3*d.x,u**3*a.z+3*u*u*t*b.z+3*u*t*t*c.z+t**3*d.z)
  })
}
const turns=new Map<string,Point[]>()
export function turnPath(from:Lane,to:Lane){
  const id=from.id+'>'+to.id,cached=turns.get(id)
  if(cached)return cached
  const a=from.points.at(-1)!,d=to.points[0]
  const span=from.from===to.to?Math.min(1.25,distance(a,d)*.65):Math.min(2.95,distance(a,d)*.70)
  const path=distance(a,d)<.04?[a,d]:bezier(a,tangent(a,from.points.at(-2)!,-span),tangent(d,to.points[1],-span),d)
  turns.set(id,path)
  return path
}
export function vehicleContains(p:Point,v:Vehicle,pad=.22){
  const s=Math.sin(v.yaw),c=Math.cos(v.yaw),x=p.x-v.x,z=p.z-v.z,d=FLEET[v.kind]
  return Math.abs(x*c-z*s)<d.w/2+pad&&Math.abs(x*s+z*c)<d.length/2+pad
}
function overlaps(a:Vehicle,b:Vehicle,pad=.08){
  if(distance(a,b)>6.2)return false
  const box=FLEET[a.kind],other=FLEET[b.kind],angle=a.yaw-b.yaw,cs=Math.abs(Math.cos(angle)),sn=Math.abs(Math.sin(angle))
  const tr=(x:number,z:number,yaw:number)=>x*Math.cos(yaw)-z*Math.sin(yaw)
  const x=a.x-b.x,z=a.z-b.z
  return Math.abs(tr(x,z,a.yaw))<box.w/2+(other.w*cs+other.length*sn)/2+pad&&
    Math.abs(tr(x,z,a.yaw+Math.PI/2))<box.length/2+(other.length*cs+other.w*sn)/2+pad&&
    Math.abs(tr(x,z,b.yaw))<other.w/2+(box.w*cs+box.length*sn)/2+pad&&
    Math.abs(tr(x,z,b.yaw+Math.PI/2))<other.length/2+(box.length*cs+box.w*sn)/2+pad
}
type Trip={v:Vehicle;lane:Lane;next?:Lane;distance:number;link?:Point[];park?:string;parkTime?:number;departure?:boolean;visits:number;blocked:number}
const kinds:VehicleKind[]=['hatch','sedan','wagon','suv','van','truck','taxi']
const paints=[0x6c9c92,0x8595af,0xb5564a,0xe3ca93,0xcbd4ca,0x354d5c,0xb57e53]
const spawns=['boulevard','garden','west','east','court','civic','market','eastbank','westbank','glass','linden']
function hash(text:string){
  let h=2166136261
  for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619)
  return h>>>0
}
export class CityTraffic {
  private trips:Trip[]=[]
  private spaces=new Map<string,string>()
  private junctions=new Map<string,string>()
  private now:number
  constructor(now:number){
    this.now=now
    for(let i=0;i<18;i++){
      const id='traffic-'+i,street=spawns[i%spawns.length]
      const candidates=[...LANES.values()].filter(l=>l.street===street&&l.length>5)
      const kind=kinds[i%kinds.length]
      for(const [j,lane] of candidates.entries()){
        const at=(i%2?.62:.34)*lane.length,v:Vehicle={id,kind,paint:paints[(i+j)%paints.length],...alongPath(lane.points,at),speed:2,brake:false,turn:0}
        if(this.trips.some(t=>overlaps(t.v,v,1)))continue
        this.trips.push({v,lane,distance:at,visits:0,blocked:0});break
      }
    }
  }
  get vehicles(){return [...parkedCars,...this.trips.map(t=>t.v)]}
  view(now:number):TrafficView{
    return {vehicles:this.vehicles.map(v=>({...v})),signals:Object.fromEntries(JUNCTIONS.filter(j=>j.signal).map(j=>[j.id,signalPhase(now,j.id)]))}
  }
  skip(ms:number){this.now+=ms}
  tick(now:number,people:readonly Point[]){
    const end=Math.min(now,this.now+1500)
    while(this.now+75<=end){this.now+=75;this.step(this.now,people)}
    if(now-this.now>1400)this.now=now
  }
  private choose(t:Trip,skip?:string){
    const options=t.lane.next.filter(id=>id!==skip&&(!id.startsWith('station:')||t.lane.street==='station'||
      !this.trips.some(other=>other!==t&&(other.lane.street==='station'||other.next?.street==='station'))))
    if(!options.length)return
    const n=hash(t.v.id+':'+t.visits)
    return LANES.get(options[n%options.length])
  }
  private parking(t:Trip,time:number){
    if(this.junctions.get(t.lane.to)===t.v.id||t.link||t.park||t.departure||t.visits<2||t.visits%4!==0||t.distance<Math.min(4,t.lane.length*.2)||t.distance>t.lane.length-6)return
    const spot=PARKING.find(p=>!p.kind&&p.accessX!==undefined&&!this.spaces.has(p.id)&&p.street===t.lane.street&&
      Math.cos(p.yaw-t.v.yaw)>.4&&Math.abs(t.v.x-p.accessX)<.55&&this.parkingClear(p,t.v))
    if(!spot)return
    const end=point(spot.x,spot.z),a=point(t.v.x,t.v.z)
    const path=bezier(a,point(a.x+Math.sin(t.v.yaw)*2,a.z+Math.cos(t.v.yaw)*2),point(end.x-Math.sin(spot.yaw)*3,end.z-Math.cos(spot.yaw)*3),end)
    this.spaces.set(spot.id,t.v.id)
    t.park=spot.id;t.parkTime=time+23500+(hash(t.v.id)%23000);t.link=path;t.distance=0
  }
  private parkingClear(spot:typeof PARKING[number],v:Vehicle){
    return !parkedCars.some(other=>overlaps({...v,x:spot.x,z:spot.z,yaw:spot.yaw},other,.38))
  }
  private exitPark(t:Trip){
    const spot=PARKING.find(p=>p.id===t.park)!
    let best=0,d=Infinity
    for(let i=0;i<t.lane.length-1;i+=.5){
      const p=alongPath(t.lane.points,i),score=distance(p,spot)
      if(score<d){best=i;d=score}
    }
    const target=alongPath(t.lane.points,Math.min(t.lane.length-1,best+4))
    t.link=bezier(spot,point(spot.x+Math.sin(spot.yaw)*2,spot.z+Math.cos(spot.yaw)*2),point(target.x-Math.sin(target.yaw)*2,target.z-Math.cos(target.yaw)*2),target)
    t.distance=0;t.departure=true
  }
  private finish(t:Trip){
    if(t.link){
      t.link=undefined
      if(t.park){
        if(!t.departure){t.v.speed=0;t.v.parking=t.park;return}
        this.spaces.delete(t.park);delete t.v.parking;t.park=undefined;t.departure=false;t.visits++
        let nearest=0,best=Infinity
        for(let i=0;i<=t.lane.length;i+=.25){const d=distance(alongPath(t.lane.points,i),t.v);if(d<best){best=d;nearest=i}}
        t.distance=nearest;return
      }
      this.junctions.delete(t.lane.to)
      t.lane=t.next!;t.next=undefined;t.distance=0;t.visits++
    }else if(t.next){
      const path=turnPath(t.lane,t.next)
      if(length(path)<.05){this.junctions.delete(t.lane.to);t.lane=t.next;t.next=undefined;t.distance=0;t.visits++;return}
      this.junctions.set(t.lane.to,t.v.id);t.link=path;t.distance=0
    }
  }
  private step(now:number,people:readonly Point[]){
    const stationary=parkedCars
    for(const t of this.trips){
      const v=t.v
      if(v.parking&&!t.link){
        if(now<(t.parkTime??0))continue
        this.exitPark(t)
      }
      this.parking(t,now)
      const path=t.link??t.lane.points,end=t.link?length(path):t.lane.length
      const remain=end-t.distance
      t.next??=this.choose(t)
      const j=intersections.get(t.lane.to)!
      let limit=t.link?t.park?2.15:3.35:t.lane.limit
      let stop=Infinity
      const others=[...stationary,...this.trips.filter(other=>other!==t).map(other=>other.v)]
      if(!t.link&&remain<12){
        const holder=this.junctions.get(j.id)
        const gate=gateDistance(t.lane)
        const red=j.signal&&signalPhase(now,j.id)!==t.lane.axis
        if(holder!==v.id){
          const queued=this.trips.some(other=>other!==t&&other.lane===t.lane&&!other.link&&!other.v.parking&&other.distance>t.distance)
          const corridor=t.next&&[
            ...turnPath(t.lane,t.next),
            alongPath(t.next.points,Math.min(2.1,t.next.length)),
          ]
          const clear=corridor?.every((p,i)=>{
            const a=corridor[Math.max(0,i-1)],b=corridor[Math.min(corridor.length-1,i+1)]
            const vehicle={...v,...p,yaw:Math.atan2(b.x-a.x,b.z-a.z)}
            return !others.some(other=>overlaps(vehicle,other,.13))
          })
          if(!holder&&!red&&!queued&&remain<gate+.22&&clear)this.junctions.set(j.id,v.id)
          else stop=Math.max(0,remain-gate)
        }
        if(t.next&&t.next.street!==t.lane.street)limit=Math.min(limit,Math.sqrt(3.35**2+5.4*remain))
      }
      const look=Math.min(remain,Math.max(2,v.speed*v.speed/5.6+1.55))
      for(let q=.35;q<=look+.34;q+=.38){
        const probe={...v,...alongPath(path,Math.min(end,t.distance+q))}
        if(others.some(other=>overlaps(probe,other,.095))||people.some(p=>vehicleContains(p,probe,.55))){
          stop=Math.min(stop,Math.max(0,q-.52));break
        }
      }
      if(people.some(p=>vehicleContains(p,v,.3)))stop=0
      limit=Math.min(limit,Math.sqrt(5.5*stop))
      const previous=v.speed
      v.speed=Math.max(0,Math.min(v.speed+.19,Math.max(limit,v.speed-.37)))
      const step=Math.min(remain,v.speed*.075)
      const next={...v,...alongPath(path,t.distance+step)}
      if(step>0&&(others.some(other=>overlaps(next,other,.04))||people.some(p=>vehicleContains(p,next,.27))))v.speed=0
      else{
        t.distance+=step
        v.turn=Math.atan2(Math.sin(next.yaw-v.yaw),Math.cos(next.yaw-v.yaw))
        Object.assign(v,{x:next.x,z:next.z,yaw:next.yaw})
      }
      v.brake=v.speed<previous-.05||v.speed<.1
      t.blocked=v.speed<.1?t.blocked+1:0
      if(t.blocked%170===0&&t.blocked&&!t.link&&t.next&&this.junctions.get(j.id)!==v.id){
        t.next=this.choose(t,t.next.id)??t.next
      }
      if(end-t.distance<.015&&stop>0)this.finish(t)
    }
  }
}
export const pedestrianCrossings=CROSSINGS
