import {FLOOR_LIST} from './exchange-floors.ts'
export {FLOOR_LIST} from './exchange-floors.ts'
import {shared} from './map-data.ts'
import {HOTEL_LIFT,guestFloor,resortPoints,resortWalkable,poolDepth,type GuestFloor,type ResortView} from './resort.ts'
import {civicRoom,civicActions,civicHeight,groundVenue,openDoorway,nextCivicFloor,levelOf,rise,originOf,footprint,insideDoor,type Gallery} from './civic-venues.ts'
import {origins,venueWalk,type ArcadeView,type Venue} from './arcade.ts'
import {counterSeats,storefrontPoints} from './storefronts.ts'
import {DIRECTORY,PUBLIC_SEATS,urbanObstacle} from './urban-layout.ts'
import {vehicleContains,type TrafficView,type Vehicle} from './traffic.ts'
import type {ResidentView} from './city-residents.ts'
import {residentialAt,residentialHeight,residentialStep,type HomeZone,type HomePose,type ResidentialView} from './residential.ts'
import {EXCHANGE_STOREY,propertyPoints,type HousingView} from './housing.ts'
import {BAR,BAR_COUNTER,BAR_STOOLS,type BarService} from './bar-menu.ts'
import {RESTAURANT,RESTAURANT_NAME,restaurantObstacle,type RestaurantView,type WorkKind,type KfcRole,type KitchenHand,type KitchenMotion,type OrderItems} from './restaurant-model.ts'
import {basinBed,tunnelBed,inPool,poolLevel,OASIS_MOUTH,CAVE_MOUTH,CAVE_X,OASIS_X,treeObstacle,townFixture,passableLand,terrainHeight} from './terrain.ts'
import {STOCK_SYMBOLS} from '../stock-catalog.ts'
import {TABLES,LOUNGES,type HallPlayer,type HallTable,type HallView,type Position} from '../roulette-hall-model.ts'
export const WORLD_CAPACITY=50
export const WORLD_SPEED=4.7
export const SPRINT_SPEED=WORLD_SPEED*1.45
export const CITY=shared.spawn
export const stockFloor=(symbol:string)=>symbol==='CAS'||symbol==='BNK'||symbol==='LOT'||symbol==='PRI'||STOCK_SYMBOLS.has(symbol)
export type PublicZone=GuestFloor|Gallery|Venue|'city'|'hotel'|'casino'|'bank'|'exchange'|'kfc'|'cave'|'oasis'|`floor:${string}`|HomeZone
export type WorldZone=PublicZone|'private'
export const DESTINATIONS={city:'city',casino:'hotel','casino-floor':'casino',bank:'bank',stocks:'exchange',kfc:'kfc',gunshop:'gunshop',prison:'station'} as const
export type Destination=keyof typeof DESTINATIONS
export const CITY_PORTALS=[
  {to:'hotel',x:shared.rooms.hotel.x,z:shared.rooms.hotel.z+shared.rooms.hotel.front,label:'Royal Hotel & Casino'},
  {to:'bank',x:shared.rooms.bank.x,z:shared.rooms.bank.z+shared.rooms.bank.front,label:'Fifth Dimension Bank'},
  {to:'exchange',x:shared.rooms.exchange.x,z:shared.rooms.exchange.z+shared.rooms.exchange.front,label:'Exchange Tower'},
  {to:'kfc',x:RESTAURANT.x,z:RESTAURANT.z+RESTAURANT.front,label:RESTAURANT_NAME},
  {to:'cave',x:CAVE_X,z:CAVE_MOUTH,label:''},
  {to:'oasis',x:OASIS_X,z:OASIS_MOUTH,label:''},
] as const
export const PUBLIC_DICE={name:'Ivory Dice',x:6.1,z:3.0,color:'#e5bd86'} as const
export const WORLD_TABLES=[...TABLES,PUBLIC_DICE]
export const DICE_TABLE_INDEX=TABLES.length
export const ZONE_ARRIVAL:Record<Exclude<WorldZone,GuestFloor|Gallery|HomeZone|`floor:${string}`>,Position>={
  station:insideDoor('station'),gunshop:insideDoor('gunshop'),city:CITY,...shared.arrivals,
}
export const FLOOR_ARRIVAL={x:0,z:6,yaw:0}
export const FLOOR_HEIGHT=EXCHANGE_STOREY
export const CREDIT_ADVISOR={x:-6.86,z:3.56}
export const FINANCIAL_ADVISOR={x:-5.47,z:2.42}
export const BOARD_TABLE={x:0,z:3.39}
export const BOARD_SEATS:Position[]=[
  ...[-1,1].flatMap(side=>[-2.66,-1.33,0,1.33,2.66].map(x=>({x,z:BOARD_TABLE.z+side*1.43,yaw:side===1?0:Math.PI}))),
  ...[-1,1].map(side=>({x:side*3.95,z:BOARD_TABLE.z,yaw:side*Math.PI/2})),
]
export const boardFloor=(zone:WorldZone)=>zone==='floor:CAS'||zone==='floor:BNK'
export function boardPoints(zone:WorldZone,taken:readonly number[]=[]):WorldAction[]{
  if(!boardFloor(zone))return []
  const full=taken.length===BOARD_SEATS.length
  return BOARD_SEATS.flatMap((seat,i)=>full||!taken.includes(i)?[{id:full?'board':'board:'+i,label:full?'Open shareholder voting':'Sit at the board table',...site(zone,seat.x,seat.z),range:1.13}]:[])
}
export const LIFT={x:0,z:-5.48}
export const PLAN=shared.rooms
type Building=keyof typeof PLAN
const building=(zone:WorldZone)=>guestFloor(zone)?'hotel':zone.startsWith('floor:')?'exchange':Object.hasOwn(PLAN,zone)?zone as Building:undefined
const reverse=(zone:WorldZone)=>zone==='cave'||zone==='oasis'?-1:1
export function roomOrigin(zone:WorldZone){return civicRoom(zone)?originOf(zone):PLAN[building(zone)!]??CITY_ORIGIN}
const CITY_ORIGIN={x:0,z:0}
export const floorNumber=(zone:WorldZone)=>zone.startsWith('floor:')?FLOOR_LIST.findIndex(f=>f.symbol===zone.slice(6))+1:0
export const floorHeight=(zone:WorldZone)=>levelOf(zone)?levelOf(zone)*rise:guestFloor(zone)?(zone==='hotel:2'?6:11):floorNumber(zone)*FLOOR_HEIGHT
export function site(zone:WorldZone,x:number,z:number){
  const origin=roomOrigin(zone),sign=reverse(zone)
  return {x:origin.x+sign*x,z:origin.z+sign*z}
}
export function localSite(zone:WorldZone,x:number,z:number){
  const origin=roomOrigin(zone),sign=reverse(zone)
  return {x:sign*(x-origin.x),z:sign*(z-origin.z)}
}
export function spawn(zone:WorldZone,point=levelOf(zone)?{x:0,z:0,yaw:0}:guestFloor(zone)?{...HOTEL_LIFT,yaw:0}:zone.startsWith('floor:')?FLOOR_ARRIVAL:ZONE_ARRIVAL[zone as keyof typeof ZONE_ARRIVAL]):Position{
  return {...site(zone,point.x,point.z),yaw:point.yaw+(reverse(zone)<0?Math.PI:0)}
}
export type LiftRide={to:WorldZone;started:number;ends:number}
export type WorldPlayer=HallPlayer&{zone:WorldZone;equipped?:import('./arcade.ts').WeaponId;lift?:LiftRide;dining?:number;eatingUntil?:number;carrying?:boolean;workingUntil?:number;workKind?:WorkKind;kfcRole?:KfcRole;kitchenHand?:KitchenHand;kitchenMotion?:KitchenMotion;carriedItems?:OrderItems;shower?:{room:number;until:number};barSeat?:number;boardSeat?:number;homePose?:HomePose}
export function riderHeight(player:WorldPlayer,now:number){
  const from=residentialHeight(player.zone,player.x,player.z)??floorHeight(player.zone),ride=player.lift
  if(!ride)return walkingHeight(player.zone,player.x,player.z)

  const progress=Math.max(0,Math.min(1,(now-ride.started)/(ride.ends-ride.started)))
  return from+((residentialHeight(ride.to,player.x,player.z)??floorHeight(ride.to))-from)*progress*progress*(3-2*progress)
}
export function walkingHeight(zone:WorldZone,x:number,z:number){
  if(civicRoom(zone))return civicHeight(zone,x,z)
  if(zone==='hotel:3'){const p=localSite(zone,x,z);return floorHeight(zone)-poolDepth(p.x,p.z)}
  const home=residentialHeight(zone,x,z)
  if(home!==undefined)return home
  if(zone==='cave'||zone==='oasis'){
    const local=localSite(zone,x,z)
    if(zone==='oasis')return inPool(local.x,local.z)?Math.max(basinBed(local.z),poolLevel-1.28):basinBed(local.z)
    return tunnelBed(local.z)
  }
  return zone==='city'?terrainHeight(x,z):floorHeight(zone)
}
export type WorldUse=`front:${string}`|`directory:${string}`|`resort:${string}`|'cash'|'counter'|'booking'|'desk'|`drawer:${string}`|'loans'|'payments'|'reserve'|'elevator'|'reception'|'banker'|'trader'|'credit'|'bar'|'board'|'advisor'|`property:${string}`|`kfc:${string}`|`lift:${string}`|`fridge:${string}`|'food'
export type WorldAction={id:string;label:string;x:number;z:number;range?:number}
export type WorldChat={id:number;name:string;text:string;at:number}
export interface WorldView{
  arcade?:ArcadeView;resort?:ResortView;housing?:HousingView;traffic?:TrafficView;residents?:ResidentView[];residential?:ResidentialView;food?:import('./food.ts').FoodView;chat?:WorldChat[];bar?:BarService;boardTaken?:number[]
  id:string;now:number;you:WorldPlayer;players:WorldPlayer[];coins:number;caveOpen:boolean;hall?:HallView;tableMotion?:Pick<HallTable,'spin'|'recent'>[];interaction?:WorldUse;restaurant?:RestaurantView
}
function localInteractions(zone:WorldZone,keys:readonly string[]):WorldAction[]{
  if(zone==='hotel'||guestFloor(zone))return resortPoints(zone,keys)
  if(civicRoom(zone))return civicActions(zone)
  if(zone==='city')return [...storefrontPoints,...counterSeats,...propertyPoints().filter(p=>!p.id.startsWith('property:desk-')),...PUBLIC_SEATS,...DIRECTORY]
  const home=residentialAt(zone)
  if(home?.building.block!==undefined&&home.level===0&&!home.stairs)return propertyPoints().filter(p=>p.id==='property:desk-'+home.building.block)
  if(zone==='casino')return [
    {id:'bar',label:'Talk to the bartender',...BAR,range:1.62},
    ...BAR_STOOLS.map((seat,i)=>({id:'bar-seat:'+i,label:'Sit at the bar',...seat,range:.75})),
    ...WORLD_TABLES.map((t,i)=>({id:'seat:'+i,label:t.name,x:t.x,z:t.z+1.68,range:2.15})),
    ...LOUNGES.map((seat,i)=>({id:'couch:'+i,label:'Sit on couch',x:seat.x,z:seat.z,range:1.75})),
  ]
  if(zone==='bank')return [{id:'cash',label:'Withdraw or deposit cash',x:0,z:.75},{id:'credit',label:'Speak to the credit advisor',...CREDIT_ADVISOR},{id:'loans',label:'Speak to the lender',x:-2.9,z:.73},{id:'payments',label:'Speak to the cashier',x:2.9,z:.73},{id:'reserve',label:'Speak to the reserve clerk',x:7.4,z:.6}]
  if(zone==='exchange'||zone.startsWith('floor:'))return [{id:'elevator',label:'Use elevator',...LIFT,range:1.25},...(zone==='exchange'?[{id:'reception',label:'Talk to reception',x:.63,z:-.77},{id:'advisor',label:'Review your portfolio',...FINANCIAL_ADVISOR}]:[{id:'trader',label:'Speak to the trader',x:-2.7,z:-.4},{id:'trader',label:'Speak to the trader',x:2.7,z:-.4}])]
  return []
}
export const interactions=(zone:WorldZone,keys:readonly string[]=[])=>localInteractions(zone,keys).map(action=>({...action,...site(zone,action.x,action.z)}))
export const near=(p:Position,x:number,z:number,max=1.65)=>Math.hypot(p.x-x,p.z-z)<=max
const box=(x:number,z:number,a:number,b:number,w:number,d:number)=>Math.abs(x-a)<w&&Math.abs(z-b)<d
export const buildings=['hotel','casino','bank','exchange','kfc'] as const
// The public room shells use the same openings for walking and sight.
export function publicWall(room:typeof buildings[number],x:number,z:number,pad:number,upper=false){
  const {width,back,front}=PLAN[room],side=Math.abs(x)
  const opening=room==='bank'?1.13:room==='exchange'?1.02:room==='kfc'?1.28:1.25
  if(side>=width+pad||z<=back-pad||z>=front+pad)return false
  if(side>width-pad)return true
  if(Math.abs(z-front)<pad)return upper||side>=opening
  return Math.abs(z-back)<pad&&(upper||room!=='hotel'||side>=1.25)
}
export function groundZone(x:number,z:number):PublicZone{
  const civic=groundVenue(x,z)
  if(civic)return civic
  for(const zone of buildings){
    const room=PLAN[zone],p=localSite(zone,x,z)
    if(Math.abs(p.x)<room.width&&p.z>=room.back&&p.z<room.front)return zone
  }
  for(const zone of ['cave','oasis'] as const){
    const p=localSite(zone,x,z)
    if(Math.abs(p.x)<(zone==='oasis'?2.12:1.75)&&p.z>=-7.8&&p.z<7.7)return zone
  }
  return 'city'
}
function roomObstacles(zone:WorldZone,x:number,z:number){
  if(zone==='casino')return WORLD_TABLES.some(t=>box(x,z,t.x,t.z,2.35,1.28))||box(x,z,BAR_COUNTER.x,BAR_COUNTER.z,3.72,.48)
  if(zone==='kfc')return restaurantObstacle(x,z)
  if(zone==='hotel')return box(x,z,-6.25,-6.26,2.33,.67)||box(x,z,5.8,-6.2,1.56,.62)
  if(zone==='bank')return z<-.41||box(x,z,CREDIT_ADVISOR.x,CREDIT_ADVISOR.z-1.25,1.12,.47)
  if(zone==='exchange'||zone.startsWith('floor:')){
    const side=Math.abs(x)
    if(side>1.28&&side<1.8&&z<-4.19&&z>-7.5)return true
    if(zone==='exchange')return box(x,z,.63,-1.97,2.18,.62)||box(x,z,FINANCIAL_ADVISOR.x,FINANCIAL_ADVISOR.z-1.08,1.32,.54)
    if(boardFloor(zone)&&box(x,z,0,BOARD_TABLE.z,3.34,1.02))return true
    return [-2.7,2.7].some(desk=>box(x,z,desk,-1.77,1.29,.51))
  }
  return false
}
export function walkable(zone:WorldZone,x:number,z:number,caveOpen:boolean){
  if(civicRoom(zone))return venueWalk(zone,x,z)
  if(zone==='private')return false
  if(zone.startsWith('floor:')){
    const p=localSite(zone,x,z),shaft=Math.abs(p.x)<1.42
    return Math.abs(p.x)<7.72&&p.z<7.29&&p.z>(shaft?-6.21:-5.98)&&!roomObstacles(zone,p.x,p.z)
  }
  if(openDoorway(x,z))return true
  if(Object.entries(footprint).some(([key,b])=>{const o=origins[key as Venue];return box(x,z,o.x,o.z,b.w/2+.15,b.d/2+.15)}))return false
  if(urbanObstacle(x,z)||!passableLand(x,z)||Math.hypot(x-shared.fountain.x,z-shared.fountain.z)<shared.fountain.radius||treeObstacle(x,z)||townFixture(x,z))return false
  for(const room of buildings){
    const {width,back,front}=PLAN[room],p=localSite(room,x,z),side=Math.abs(p.x)
    if(publicWall(room,p.x,p.z,.28))return false
    if(side<width&&p.z>=back&&p.z<front){
      if(room==='exchange'&&p.z<-5.93&&(side>=1.42||p.z<-6.21))return false
      if(roomObstacles(room,p.x,p.z))return false
    }
  }
  for(const cave of ['cave','oasis'] as const){
    const p=localSite(cave,x,z),side=Math.abs(p.x)
    if(side<4.65&&p.z<7.70&&p.z>-8.55&&(side>=(cave==='oasis'?2.12:1.75)||p.z<-7.7||cave==='cave'&&!caveOpen))return false
  }
  return true
}
export const outdoorWalkable=(x:number,z:number)=>walkable('city',x,z,true)
export function worldMove(zone:WorldZone,from:Position,x:number,z:number,limit:number,caveOpen=true,keys:readonly string[]=[],residential?:ResidentialView,now=Date.now(),vehicles:readonly Vehicle[]=[]):Position&{zone:WorldZone}{
  const d=Math.hypot(x-from.x,z-from.z)
  if(!Number.isFinite(d)||d===0||limit<=0)return {x:from.x,z:from.z,yaw:from.yaw,zone}
  const scale=Math.min(1,limit/d),steps=Math.max(1,Math.ceil(d*scale/.13))
  const dx=(x-from.x)*scale/steps,dz=(z-from.z)*scale/steps
  let ax=from.x,az=from.z,current=zone
  function step(x:number,z:number){
    if(civicRoom(current)||current==='city'){
      const ground=groundVenue(x,z)
      if(civicRoom(current)||ground){
        const next=civicRoom(current)?nextCivicFloor(current,x,az,z):ground!
        if(civicRoom(current)&&!levelOf(current)&&!ground){
          if(!openDoorway(x,z))return false
          current='city';return true
        }
        if(!venueWalk(next,x,z)||Math.abs(civicHeight(next,x,z)-walkingHeight(current,ax,az))>.34)return false
        current=next;return true
      }
    }
    if(guestFloor(current)){const p=localSite(current,x,z);return resortWalkable(current,p.x,p.z,keys)}
    if(current==='city'&&vehicles.some(v=>vehicleContains({x,z},v)&&
      (!vehicleContains({x:ax,z:az},v)||Math.hypot(x-v.x,z-v.z)<=Math.hypot(ax-v.x,az-v.z))))return false
    if(current==='city'||residentialAt(current)){
      const next=residentialStep(current,x,z,keys,residential,now) as WorldZone|false
      if(!next)return false
      if(residentialAt(next)){current=next;return true}
      if(residentialAt(current))current='city'
    }
    return walkable(current,x,z,caveOpen)
  }
  for(let i=0;i<steps;i++){
    if(dx&&step(ax+dx,az))ax+=dx
    if(dz&&step(ax,az+dz))az+=dz
  }
  const layered=current==='private'||guestFloor(current)||civicRoom(current)||current.startsWith('floor:')||residentialAt(current)
  return {x:ax,z:az,yaw:from.yaw,zone:layered?current:groundZone(ax,az)}
}
