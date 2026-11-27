import {ResidentIndex} from './world/interest.ts'
import {cityRoute} from './world/navigation.ts'
export {cityRoute} from './world/navigation.ts'
import {distance,LANDMARKS,type Point} from '../src/world/city-plan.ts'
import {findPath} from '../src/world/city-navigation.ts'
import {assignResidents,CITY_DAY_MS,routine,scheduledPlace,type Resident,type ResidentView} from '../src/world/city-residents.ts'
import {UNITS,type Deeds} from '../src/world/housing.ts'
import {riderHeight,worldMove,type WorldZone} from '../src/world/model.ts'
import {aboard,buildingById,contains,homeZone,openLift,residentialAt,residentialPoints,residentialSite,residentialStep,type Building,type HomePoint,type ResidentialView} from '../src/world/residential.ts'
import {CityTraffic,vehicleContains,type Vehicle} from '../src/world/traffic.ts'
import {counterLayout,counterSeats} from '../src/world/storefronts.ts'
import {PUBLIC_SEATS} from '../src/world/urban-layout.ts'
import {callResidentialLift,occupy,operateDoor,residentialRide,settleResidentialLifts,stand,type Occupant} from './residential-actions.ts'

type Goal=Point&{key:string;yaw?:number;point?:HomePoint;outside?:boolean;kind?:'call'|'board'|'stairs'|'door'|'exit';level?:number}
type Citizen=Occupant&{
  resident:Resident;keys:string[];activity:string;destination:string;goal?:Goal;route:Point[];retry:number;blocked:number;rest?:boolean
  routeAt:number;closed?:HomePoint;stair?:{building:string;floor:number;up:boolean;way:number};lastLift?:number;liftWait?:number
}
const workRooms=new Map<string,{x:number;z:number;facing:number;bench:typeof counterSeats[number]|undefined}>(LANDMARKS.filter(b=>b.id!=='police').map(b=>[b.id,{
  x:b.x,z:b.z+b.facing*(counterLayout(b).counterZ+1.07),facing:b.facing,
  bench:counterSeats.find(p=>p.pose.id==='window-seat-'+b.id),
}]))
const unitById=new Map(UNITS.map(u=>[u.id,u]))
const STEP=240
const maxReach=.38
function front(b:Building,delta:number){return residentialSite(b,0,b.rect.f+delta)}
function insideUnit(actor:Citizen){
  const a=residentialAt(actor.zone)
  if(!a||a.stairs)return
  const {building:b,f}=a
  return f.units.find(u=>u.id===actor.resident.home&&contains(u.rect,(actor.x-b.x)*b.facing,(actor.z-b.z)*b.facing,-.14))
}
function pointFor(actor:Citizen,state:ResidentialView,id:string){
  return residentialPoints(actor.zone,actor,actor.keys,state).find(p=>p.id===id)
}
function liftApproach(b:Building){
  return residentialSite(b,b.lift!.x,1.46)
}
function hallPoint(b:Building){return residentialSite(b,0,0.48)}

export class CityLife {
  private index?:ResidentIndex
  readonly traffic:CityTraffic
  readonly population:Citizen[]
  private now:number
  private routeBudget=0
  private stairsInUse=new Map<string,Citizen>()
  private cycle:number
  constructor(now:number,deeds:Deeds={},cycle=CITY_DAY_MS){
    this.cycle=cycle
    this.now=now
    this.traffic=new CityTraffic(now)
    this.population=assignResidents(deeds,now).map(r=>{
      const unit=unitById.get(r.home)!,b=buildingById.get(unit.block===undefined?r.home:'block-'+unit.block)!
      const plans=b.levels[unit.floor].points.filter(p=>p.unit===unit.id&&p.pose)
      const stand=plans[(r.household*2+r.style)%plans.length]?.exit??{x:0,z:2.45}
      return {...r,...residentialSite(b,stand.x,stand.z),id:r.id,resident:r,zone:homeZone(b.id,unit.floor),yaw:0,avatar:'default',online:true,
        keys:[unit.id],activity:'At home',destination:'home',retry:now+r.style*105,routeAt:0,route:[],blocked:0}
    })
  }
  people(players:Iterable<Occupant>){return [...players,...this.population]}
  nearby(p:Point){
    this.index??=new ResidentIndex(this.population.map(n=>({
      id:n.resident.id,name:n.name,home:n.resident.address,occupation:n.resident.occupation,activity:n.activity,
      destination:n.destination==='home'?n.resident.address:scheduledPlace(n.destination)?.name??n.destination,style:n.resident.style,
      avatar:n.avatar,online:true,zone:n.zone,x:n.x,z:n.z,yaw:n.yaw,lift:n.lift,homePose:n.homePose,
    } satisfies ResidentView)))
    return this.index.nearby(p,53)
  }
  snapshot(p:Point,now:number){return {traffic:this.traffic.view(now),residents:this.nearby(p)}}
  skip(ms:number){this.now+=ms;this.traffic.skip(ms)}
  tick(now:number,state:ResidentialView,players:Iterable<Occupant>){
    const people=this.people(players)
    this.routeBudget=1
    const elapsed=Math.min(1200,Math.max(0,now-this.now))
    if(now-this.now>1500)this.now=now-elapsed
    const until=this.now+elapsed
    const street=people.filter(p=>p.zone==='city'&&!p.homePose)
    this.traffic.tick(now,street)
    const vehicles=this.traffic.vehicles
    while(this.now+STEP<=until){
      this.index=undefined
      this.now+=STEP
      settleResidentialLifts(state,people,this.now)
      // Rotate priority so the same resident does not always claim a busy route first.
      const first=Math.floor(this.now/STEP)%this.population.length
      for(let k=0;k<this.population.length;k++){
        const actor=this.population[(first+k)%this.population.length]
        this.advance(actor,state,people,vehicles,this.now)
      }
    }
  }
  private destination(actor:Citizen,state:ResidentialView,people:readonly Occupant[],now:number):Goal|undefined{
    const r=actor.resident,u=unitById.get(r.home)!,b=buildingById.get(u.block===undefined?r.home:'block-'+u.block)!
    const a=residentialAt(actor.zone),wanted=actor.destination==='home'
    const stairClaim=this.stairsInUse.get(b.id)===actor
    if(!a){
      if(wanted){
        const outside=front(b,.97),entry=b.block===undefined?b.id:b.id+'-street'
        if(distance(actor,outside)>.56&&actor.goal?.key!=='enter:'+b.id)return {...outside,key:'porch:'+r.home,outside:true}
        const p=pointFor(actor,state,'door:'+entry)
        if(p){
          operateDoor(actor,p,actor.keys,state,people,now,true)
          actor.closed=p
        }
        return {...front(b,-.64),key:'enter:'+b.id,kind:'door'}
      }
      const destination=scheduledPlace(actor.destination)
      if(!destination)return
      const room=workRooms.get(actor.destination)
      if(room){
        const bench=room.bench
        if(r.work!==actor.destination&&bench&&!people.some(n=>n.homePose?.id===bench.pose.id))
          return {...bench,key:bench.id,point:bench,outside:true}
        // Colleagues share a counter and leave the middle of the doorway clear.
        const dx=(r.style<18?-.43:.43)*room.facing
        return {x:room.x+dx,z:room.z,key:actor.destination,outside:true,yaw:room.facing>0?Math.PI:0}
      }
      const seats=PUBLIC_SEATS.filter(p=>distance(p,destination)<7&&!people.some(n=>n.homePose?.id===p.pose?.id))
      const seat=actor.resident.style%3!==0?seats[actor.resident.style%Math.max(seats.length,1)]:undefined
      return seat?{...seat,key:actor.destination+':'+seat.id,point:seat,outside:true}:{...destination,key:actor.destination,outside:true}
    }
    const {level,building}=a
    const destinationFloor=wanted?u.floor:0
    if(a.stairs||level!==destinationFloor){
      if(!a.stairs&&!stairClaim&&building.lift&&r.style%4===0&&!insideUnit(actor)&&(aboard(actor.zone,actor.x,actor.z)||actor.lastLift===undefined||now-actor.lastLift<10500)){
        actor.lastLift??=now
        const lift=state.lifts[building.id]??{level:0,opened:0}
        if(!aboard(actor.zone,actor.x,actor.z)){
          if(!openLift(lift,level,now)){
            const at=liftApproach(building)
            if(distance(actor,at)<.48)callResidentialLift(actor,state,people,now)
            return {...at,key:'call:'+building.id,kind:'call'}
          }
          const at=residentialSite(building,building.lift.x,3.04)
          return {...at,key:'board:'+building.id,kind:'board'}
        }
        residentialRide(actor,destinationFloor,state,people,now)
        return undefined
      }
      const stairs=building.stairs
      if(!stairs)return
      if(!stairClaim){
        const waiting=residentialSite(building,stairs.x+Math.min(2.65,stairs.width+.97),stairs.front-.83+(r.style%3)*.29)
        if(!a.stairs&&(this.stairsInUse.has(building.id)||distance(actor,waiting)>.44)){
          return {...waiting,key:'stair-queue:'+level}
        }
        this.stairsInUse.set(building.id,actor)
      }
      let plan=actor.stair
      if(!plan||plan.building!==building.id||!a.stairs&&plan.floor!==level){
        plan={building:building.id,floor:level,up:level<destinationFloor,way:0};actor.stair=plan
      }
      const side=plan.up?-1:1,lane=stairs.x+side*stairs.width/2,other=stairs.x-side*stairs.width/2,dz=stairs.back-stairs.front
      const near=stairs.front-Math.sign(dz)*.44,landing=stairs.front+dz*.90
      const route=[residentialSite(building,lane,near),residentialSite(building,lane,landing),residentialSite(building,other,landing),residentialSite(building,other,near)]
      const end=route[plan.way]
      if(end&&distance(actor,end)<.17)plan.way++
      const goal=route[plan.way]
      return goal?{...goal,key:'stairs:'+plan.floor+':'+plan.way,kind:plan.way?'stairs':undefined}:undefined
    }
    if(stairClaim)this.stairsInUse.delete(b.id)
    actor.lastLift=undefined;actor.stair=undefined
    if(building.lift&&aboard(actor.zone,actor.x,actor.z)){
      return {...liftApproach(building),key:'leave-elevator:'+level,kind:'board'}
    }
    if(wanted){
      if(u.block!==undefined&&!insideUnit(actor)){
        const d=a.f.doors.find(d=>d.id===u.id)!
        const at=residentialSite(b,d.x,d.z+.61)
        if(distance(actor,at)>.53&&actor.goal?.key!=='into:'+u.id)return {...at,key:'apartment-door:'+u.id}
        const p=pointFor(actor,state,'door:'+d.id)
        if(p){operateDoor(actor,p,actor.keys,state,people,now,true);actor.closed=p}
        return {...residentialSite(b,d.x,d.z-.71),key:'into:'+u.id,kind:'door'}
      }
      const fixtures=residentialPoints(actor.zone,actor,actor.keys,state).filter(p=>p.unit===r.home&&p.pose)
      const available=fixtures.filter(p=>!people.some(n=>n!==actor&&n.zone===actor.zone&&n.homePose?.id===p.pose?.id))
      const selected=available.find(p=>p.pose?.id===actor.goal?.point?.pose?.id)??available.find(p=>p.pose?.kind===(actor.rest?'rest':'sit'))??available[0]
      if(selected)return {...selected,key:'home:'+selected.id,point:selected}
      return
    }
    if(level>0)return {...hallPoint(building),key:'hall:'+level}
    const id=building.block===undefined?building.id:building.id+'-street',at=front(building,-.54)
    if(distance(actor,at)>.49&&actor.goal?.key!=='leave:'+id)return {...at,key:'to-door:'+id}
    const p=pointFor(actor,state,'door:'+id)
    if(p){operateDoor(actor,p,actor.keys,state,people,now,true);actor.closed=p}
    return {...front(building,.93),key:'leave:'+id,kind:'exit'}
  }
  private advance(actor:Citizen,state:ResidentialView,people:readonly Occupant[],vehicles:readonly Vehicle[],now:number){
    if(actor.lift)return
    const plan=routine(actor.resident,now,this.cycle)
    if(plan.id!==actor.destination||plan.rest!==actor.rest){
      actor.destination=plan.id;actor.rest=plan.rest
      actor.goal=undefined;actor.route=[];actor.retry=now+actor.resident.style*38;actor.lastLift=undefined
      stand(actor)
    }
    if(actor.closed&&distance(actor,actor.closed)>1.05&&distance(actor,actor.closed)<2.25){
      const p=actor.closed
      if(!operateDoor(actor,p,actor.keys,state,people,now,false))actor.closed=undefined
    }
    if(actor.homePose){actor.activity=actor.homePose.kind==='rest'?'Resting':actor.destination==='home'?'At home':'Sitting';return}
    if(now<actor.retry)return
    const goal=this.destination(actor,state,people,now)
    if(!goal)return
    if(actor.goal?.key!==goal.key){actor.goal=goal;actor.route=[];actor.blocked=0;actor.routeAt=0}
    const gap=distance(actor,goal)
    if(gap<(goal.point?.pose?.kind==='rest'?.43:goal.point?.pose?.kind==='sit'?.52:goal.kind==='stairs'?.085:.16)){
      actor.activity=plan.activity
      if(goal.yaw!==undefined)actor.yaw=goal.yaw
      if(goal.point)occupy(actor,goal.point,people)
      return
    }
    if(!actor.route.length&&now>=actor.routeAt&&this.routeBudget>0){
      this.routeBudget--
      const current=residentialAt(actor.zone)
      if(goal.kind&&goal.kind!=='call'||current?.stairs)actor.route=[goal]
      else if(goal.outside)actor.route=cityRoute(actor,goal,actor.blocked>10?vehicles:[])
      else if(current){
        const {b,level}= {b:current.building,level:current.level}
        const doors=Object.fromEntries(current.f.doors.filter(d=>!d.unit||actor.keys.includes(d.unit)).map(d=>[d.id,now-900]))
        const open={...state,doors:{...state.doors,...doors}}
        const zone=actor.zone
        actor.route=findPath(actor,goal,.17,p=>contains(b.rect,(p.x-b.x)*b.facing,(p.z-b.z)*b.facing,.10)&&residentialStep(zone,p.x,p.z,actor.keys,open,now)===zone,undefined,14500)
      }
      actor.routeAt=now+(actor.route.length?240:2100)+actor.resident.style*15
    }
    while(actor.route.length>1&&distance(actor,actor.route[0])<.17)actor.route.shift()
    const next=actor.route[0]
    if(!next)return
    const height=riderHeight(actor,now)
    const close=people.filter(p=>p!==actor&&!p.homePose&&distance(p,actor)<1.5&&Math.abs(riderHeight(p,now)-height)<.9)
    const stride=actor.resident.speed*STEP/1000
    const walk=(x:number,z:number)=>worldMove(actor.zone,actor,x,z,stride,true,actor.keys,state,now,vehicles)
    const onStair=this.stairsInUse.get(residentialAt(actor.zone)?.building.id??'')===actor
    const clearance=onStair?.26:.39
    const clear=(p:Point)=>distance(actor,p)>.014&&!close.some(n=>distance(n,p)<clearance&&distance(n,p)<distance(n,actor)-.012)
    let pos=walk(next.x,next.z)
    if(!clear(pos)&&actor.blocked>=2&&goal.kind!=='stairs'&&!actor.zone.startsWith('stairs:')){
      const length=distance(actor,next)||1,dx=(next.x-actor.x)/length,dz=(next.z-actor.z)/length
      const side=actor.resident.style%2?1:-1
      for(const sign of [side,-side]){
        const avoid=walk(actor.x+dx*.18+dz*sign*.39,actor.z+dz*.18-dx*sign*.39)
        if(clear(avoid)){pos=avoid;break}
      }
    }
    if(clear(pos)){
      const old=actor.zone,yaw=Math.atan2(actor.x-pos.x,actor.z-pos.z)
      actor.zone=pos.zone
      actor.x=pos.x;actor.z=pos.z;actor.yaw=yaw
      if(old!==actor.zone&&!actor.zone.startsWith('stairs:'))actor.route=[]
      if(distance(actor,next)<.14)actor.route.shift()
      actor.blocked=0
      actor.activity=actor.destination==='home'?'Walking home':'Walking · '+plan.activity
    }else{
      const door=residentialPoints(actor.zone,actor,actor.keys,state).find(p=>p.door&&distance(actor,p)<1.19&&
        (state.doors[p.door.id]??0)<=0&&distance(next,p)<distance(next,actor)+.4)
      if(door&&!operateDoor(actor,door,actor.keys,state,people,now,true))actor.closed=door
      actor.activity=vehicles.some(v=>distance(v,actor)<4.6&&vehicleContains(next,v,1))?'Waiting for traffic':'Waiting'
      if(++actor.blocked>6){
        actor.route=[]
        actor.retry=now+270+(actor.resident.style%8)*130
      }
      if(actor.blocked>45){actor.goal=undefined;actor.route=[];actor.retry=now+1500;actor.blocked=0}
    }
  }
}
