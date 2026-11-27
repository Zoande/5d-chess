import {at,civicRoom,design,entrances,levelOf,stair,threshold} from '../../src/world/civic-venues.ts'
import {CITY,CITY_PORTALS,PLAN,groundZone,localSite,site,walkable,worldMove,type WorldZone} from '../../src/world/model.ts'
import {findPath} from '../../src/world/city-navigation.ts'
import {cityRoute} from './navigation.ts'
import {guestFloor,resortWalkable} from '../../src/world/resort.ts'
import {residentialAt,residentialSite,residentialStep,type ResidentialView} from '../../src/world/residential.ts'
import type {Vehicle} from '../../src/world/traffic.ts'

type Point={x:number;z:number}
type Actor=Point&{zone:string}
type State={keys:string[];caveOpen?:boolean;residential?:ResidentialView;vehicles?:readonly Vehicle[]}
type Route={from:string;to:string;points:Point[];replan:number}
const routes=new WeakMap<Actor,Route>()
const distance=(a:Point,b:Point)=>Math.hypot(b.x-a.x,b.z-a.z)
function thresholdPath(zone:string,enter:boolean){
  if(civicRoom(zone)){
    const room=design(zone),inside=threshold(room,-.7)
    return enter?[entrances[room],inside]:[inside,entrances[room]]
  }
  const home=residentialAt(zone)
  if(home){
    const b=home.building
    const outside=residentialSite(b,0,b.rect.f+.8),inside=residentialSite(b,0,b.rect.f-.8)
    return enter?[outside,inside]:[inside,outside]
  }
  if(zone==='casino'){
    const outside=site('casino',0,PLAN.casino.front+.8),inside=site('casino',0,PLAN.casino.front-.8)
    return enter?[outside,inside]:[inside,outside]
  }
  const ground=guestFloor(zone)?'hotel':zone.startsWith('floor:')?'exchange':zone
  const door=CITY_PORTALS.find(p=>p.to===ground)
  if(door){
    const sign=zone==='cave'||zone==='oasis'?-1:1
    const a={x:door.x,z:door.z+.75*sign},b={x:door.x,z:door.z-.75*sign}
    return enter?[a,b]:[b,a]
  }
}
function transition(from:Actor,to:Actor):Point[]{
  if(from.zone===to.zone)return []
  if(civicRoom(from.zone)&&design(from.zone)==='station'&&(levelOf(from.zone)>0||levelOf(to.zone)>0)){
    const up=levelOf(to.zone)>levelOf(from.zone),a=up?stair.up:stair.down,b=up?stair.down:stair.up
    return [at('station',a,stair.start-.38),at('station',a,2.9),at('station',b,2.9),at('station',b,stair.start-.38)]
  }
  if(to.zone==='casino'&&from.zone==='city')return thresholdPath('hotel',true)!
  if(to.zone==='casino'&&from.zone==='hotel')return thresholdPath('casino',true)!
  if(from.zone!=='city')return thresholdPath(from.zone,false)??[]
  return thresholdPath(to.zone,true)??[]
}
export function patrolSpawn(target:Actor,index:number):Actor{
  // Dispatch civic patrols on the street. They approach the public entrance on foot.
  if(civicRoom(target.zone)){
    const room=design(target.zone),outside=threshold(room,5+index)
    if(groundZone(outside.x,outside.z)==='city'&&walkable('city',outside.x,outside.z,true))return {...outside,zone:'city'}
    return {...entrances[room],zone:'city'}
  }
  const z=target.zone as WorldZone
  if(residentialAt(z)||guestFloor(z)||z.startsWith('floor:')){
    const entrance=thresholdPath(z,true)?.[0]
    if(entrance)return patrolSpawn({...entrance,zone:'city'},index)
  }
  // Spawn in traversable space. Never start an officer inside a wall.
  for(const radius of [10+index,8,6,4,2]){
    for(let j=0;j<12;j++){
      const angle=.38+j*Math.PI/6,x=target.x+radius*Math.cos(angle),y=target.z+radius*Math.sin(angle)
      if(groundZone(x,y)===z&&walkable(z,x,y,true))return {x,z:y,zone:z}
    }
  }
  return {x:CITY.x,z:CITY.z,zone:'city'}
}
export function walkPatrol(actor:Actor,target:Actor,stride:number,state:State,now:number){
  if(stride<=0)return
  let route=routes.get(actor)
  while(route?.points.length&&distance(actor,route.points[0])<.14)route.points.shift()
  // A descending officer crosses the floor boundary before reaching the landing.
  // Finish the current flight before computing the next leg.
  if(!route||route.to!==target.zone||!route.points.length&&route.from!==actor.zone){
    route={from:actor.zone,to:target.zone,points:transition(actor,target),replan:0}
    routes.set(actor,route)
  }
  const goal=route.points[0]??target,zone=actor.zone as WorldZone
  const moved=worldMove(zone,{...actor,yaw:0},goal.x,goal.z,stride,state.caveOpen,state.keys,state.residential,now,state.vehicles)
  const advance=distance(actor,moved)
  actor.x=moved.x;actor.z=moved.z;actor.zone=moved.zone
  if(advance>=Math.min(.04,stride*.6)||distance(actor,goal)<.15||now<route.replan)return
  route.replan=now+1200
  const passable=(p:Point)=>{
    if(distance(p,actor)>=18)return false
    if(residentialAt(zone))return residentialStep(zone,p.x,p.z,state.keys,state.residential,now)===zone
    if(guestFloor(zone)){const local=localSite(zone,p.x,p.z);return resortWalkable(zone,local.x,local.z,state.keys)}
    return walkable(zone,p.x,p.z,!!state.caveOpen)
  }
  const path=zone==='city'&&groundZone(goal.x,goal.z)==='city'?cityRoute(actor,goal,state.vehicles):
    findPath(actor,goal,.42,passable,undefined,1400)
  if(path.length){if(distance(actor,path[0])<.24)path.shift();route.points=[...path,...route.points.slice(1)]}
}
