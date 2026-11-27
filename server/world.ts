import {civicRoom,galleryZone} from '../src/world/civic-venues.ts'
import {storefront} from '../src/world/storefronts.ts'
import {resortService} from './resort.ts'
import {HOTEL_LIFT,bathSeats,gameStations,bedAt,guestFloor,roomAt,roomPoints,type ResortView} from '../src/world/resort.ts'
import {randomUUID} from 'node:crypto'
import {CityArcade} from './city-arcade.ts'
import {roster,bailListing,payBail,cellMove,custodyView} from './custody.ts'
import {SLOT_COUNT,isWeapon,MAX_HP} from '../src/world/arcade.ts'
import {cityStaff,serviceStaff} from '../src/world/service-staff.ts'
import {CityLife} from './city-life.ts'
import {callResidentialLift,occupy,operateDoor,residentialRide,settleResidentialLifts,stand} from './residential-actions.ts'
import {buildingById,homeZone,aboard,access,openLift,residentialAt,residentialPoints,residentialSite,unauthorizedHome,type HomePoint,type ResidentialView} from '../src/world/residential.ts'
import {residentialFood} from './residential-food.ts'
import {crownBlock,UNITS,type Deeds,type HousingView} from '../src/world/housing.ts'
import {BAR,BAR_STOOLS,DRINKS,type BarService} from '../src/world/bar-menu.ts'
import {requireSpending} from './credit.ts'
import {wallet} from './economy.ts'
import {operating,companies,saveCompanies,cashUnits} from './corporate.ts'
import {Restaurant} from './restaurant.ts'
import {RESTAURANT,restaurantPoints} from '../src/world/restaurant-model.ts'
import {dayKey} from '../src/collection.ts'
import {BOARD_SEATS,BOARD_TABLE,boardPoints,DESTINATIONS,FLOOR_ARRIVAL,LIFT,WORLD_CAPACITY,WORLD_SPEED,SPRINT_SPEED,floorHeight,interactions,localSite,near,riderHeight,site,spawn,stockFloor,worldMove,type Destination,type WorldPlayer,type WorldUse,type WorldView,type WorldZone,type WorldChat} from '../src/world/model.ts'
import type {Position,HallView} from '../src/roulette-hall-model.ts'
import type {ChessStore} from './storage.ts'
import type {RouletteHall} from './roulette-hall.ts'
import {fail} from './http.ts'

const TIMEOUT=27_000
type Member=WorldPlayer&{slot?:number;seen:number;moved:number;interaction?:WorldUse;liftArrived?:boolean;homeExit?:Position;cell?:number}
type World={id:string;shard:number;members:Map<string,Member>;restaurant:Restaurant;chat:WorldChat[];nextChat:number;lastChat:Map<string,number>;bar?:BarService;barReceipts:Map<string,string>;residential:ResidentialView;life:CityLife}
export interface CaveVisit {day:string;active:boolean}
const publicMember=({name,avatar,zone,x,z,yaw,chair,lounge,online,lift,dining,eatingUntil,carrying,workingUntil,workKind,kfcRole,kitchenHand,kitchenMotion,carriedItems,barSeat,boardSeat,homePose,shower,equipped}:Member,shared:boolean):WorldPlayer=>({name,avatar,zone,...(shared?{x,z}:localSite(zone,x,z)),yaw,chair,lounge,online,lift,dining,eatingUntil,carrying,workingUntil,workKind,kfcRole,kitchenHand,kitchenMotion,carriedItems,barSeat,boardSeat,homePose,shower,equipped})

export class CityWorlds {
  readonly arcade:CityArcade
  private worlds=new Map<string,World>()
  private occupants=new Map<string,World>()
  private store:ChessStore
  private roulette:RouletteHall
  constructor(store:ChessStore,roulette:RouletteHall){this.store=store;this.roulette=roulette;this.arcade=new CityArcade(store)}
  disconnect(name:string){
    this.arcade.offline(name)
    const world=this.occupants.get(name)
    if(!world)return
    world.restaurant.leave(name);this.roulette.detach(name,world.id)
    world.members.delete(name);this.occupants.delete(name)
  }
  private clean(now:number){
    for(const room of this.worlds.values()){
      for(const [name,member] of room.members){
        if(now-member.seen<TIMEOUT)continue
        if(member.zone==='casino')this.roulette.detach(name,room.id)
        room.restaurant.leave(name)
        room.lastChat.delete(name)
        room.members.delete(name);this.occupants.delete(name)
      }
      if(!room.members.size){this.arcade.retire(room.shard);this.worlds.delete(room.id)}
    }
  }
  private enter(name:string,avatar:string,zone:WorldZone,now:number){
    let world=[...this.worlds.values()].find(w=>w.members.size<WORLD_CAPACITY)
    if(!world){let shard=1;while([...this.worlds.values()].some(w=>w.shard===shard))shard++;world={id:'W-'+randomUUID().slice(0,8),shard,members:new Map(),restaurant:new Restaurant(this.store),chat:[],nextChat:0,lastChat:new Map(),barReceipts:new Map(),residential:{doors:{},lifts:{}},life:new CityLife(now,this.store.metadataValue('cityDeeds') as Deeds|undefined)};this.worlds.set(world.id,world)}
    const member:Member={name,avatar,zone,...FLOOR_ARRIVAL,seen:now,moved:now,online:true}
    this.arrive(world,member,zone,now)
    world.members.set(name,member);this.occupants.set(name,world)
    return world
  }
  private arrive(world:World,member:Member,zone:WorldZone,now:number,point?:Position){
    if(member.zone==='casino'&&zone!=='casino')this.roulette.detach(member.name,world.id)
    if(member.zone==='kfc'){world.restaurant.leave(member.name);delete member.dining;delete member.eatingUntil;delete member.workingUntil;delete member.carrying;delete member.kfcRole;delete member.kitchenHand;delete member.carriedItems}
    delete member.kitchenMotion;delete member.shower;delete member.barSeat;delete member.boardSeat;delete member.homePose;delete member.homeExit
    member.zone=zone;member.interaction=undefined;member.chair=undefined;member.lounge=undefined;member.lift=undefined;member.liftArrived=undefined
    Object.assign(member,spawn(zone,point),{moved:now})
  }
  private boundPosition(member:Member):Position{
    return {...localSite('casino',member.x,member.z),yaw:member.yaw}
  }
  private privateEntry(world:World,member:Member,now:number){
    this.store.transaction(unit=>{
      const account=unit.users.get(member.name)??fail(401,'Log in first')
      if((account.wallet?.coins??0)<1||account.cave?.day===dayKey(now))fail(403,'The passage is closed')
      account.cave={day:dayKey(now),active:true}
    })
    this.arrive(world,member,'private',now)
  }
  private privateExit(world:World,member:Member,now:number){
    this.store.transaction(unit=>{
      const account=unit.users.get(member.name)
      if(account?.cave?.active)account.cave={...account.cave,active:false}
    })
    this.arrive(world,member,'oasis',now)
  }
  private walkthrough(world:World,member:Member,zone:WorldZone,open:boolean,now:number){
    if(member.zone!==zone){
      if(member.zone==='kfc'){
        world.restaurant.leave(member.name)
        delete member.dining;delete member.eatingUntil;delete member.carrying;delete member.kfcRole
        delete member.kitchenHand;delete member.kitchenMotion;delete member.carriedItems;delete member.workingUntil;delete member.workKind
      }
      if(member.zone==='casino')this.roulette.detach(member.name,world.id)
      member.zone=zone;member.interaction=undefined
    }
    if(zone==='cave'&&open&&localSite(zone,member.x,member.z).z<-7.06){this.privateEntry(world,member,now);return}
    const points=this.points(world,member,now)
    const listing=points.find(p=>p.id.startsWith('property:house-')&&near(member,p.x,p.z,1.05))
    if(listing)member.interaction=listing.id as WorldUse
    if(member.interaction&&!points.some(p=>p.id===member.interaction&&near(member,p.x,p.z,(p.range??1.65)+.18)))member.interaction=undefined
    const elevator=points.find(p=>p.id==='elevator')
    if(elevator&&!near(member,elevator.x,elevator.z,1.27))member.liftArrived=undefined
    if(elevator&&!member.liftArrived&&near(member,elevator.x,elevator.z,1.02))member.interaction='elevator'
    else if(zone.startsWith('floor:')&&points.some(p=>p.id==='trader'&&near(member,p.x,p.z,1.28)))member.interaction='trader'
  }

  private points(world:World,member:Member,now:number){
    if(member.zone!=='kfc')return [...interactions(member.zone),...boardPoints(member.zone,this.boardTaken(world,member)),...this.homePoints(world,member,now)]
    return restaurantPoints(world.restaurant.view(member.name,now,true),member.dining).map(p=>({...p,...site('kfc',p.x,p.z)}))
  }
  private boardTaken(world:World,member:Member){
    return [...world.members.values()].filter(p=>p!==member&&p.zone===member.zone&&p.boardSeat!==undefined).map(p=>p.boardSeat!)
  }
  canVote(name:string,symbol:unknown,now=Date.now()){
    const member=this.occupants.get(name)?.members.get(name)
    return Boolean(member&&now-member.seen<TIMEOUT&&member.interaction==='board'&&member.zone==='floor:'+symbol)
  }
  canTrade(name:string,symbol:unknown,now=Date.now()){
    const member=this.occupants.get(name)?.members.get(name)
    return typeof symbol==='string'&&Boolean(member&&now-member.seen<TIMEOUT&&member.interaction==='trader'&&member.zone==='floor:'+symbol)
  }
  atFinancialAdvisor(name:string,now=Date.now()){
    const m=this.occupants.get(name)?.members.get(name)
    return !!m&&now-m.seen<TIMEOUT&&m.zone==='exchange'&&m.interaction==='advisor'
  }
  canBank(name:string,kind:string,now=Date.now()){
    const member=this.occupants.get(name)?.members.get(name)
    return Boolean(member&&now-member.seen<TIMEOUT&&member.zone==='bank'&&member.interaction===(kind==='borrow'?'loans':'payments'))
  }
  private housing(name:string,now:number):HousingView{
    const deeds=(this.store.metadataValue('cityDeeds')??{}) as Deeds
    const active=Object.entries(deeds).filter(([,d])=>!d.until||d.until>now)
    const mine=active.filter(([,d])=>d.holder===name)
    return {keys:mine.map(([id])=>id),occupied:active.map(([id])=>id),expires:Object.fromEntries(mine.map(([id,d])=>[id,d.until]))}
  }
  private homePoints(world:World,member:Member,now:number){
    if(!guestFloor(member.zone)&&!residentialAt(member.zone)&&member.zone!=='city')return []
    const keys=this.housing(member.name,now).keys
    if(guestFloor(member.zone)){
      const pos=localSite(member.zone,member.x,member.z),room=roomAt(member.zone,pos.x,pos.z)
      if(!room||!keys.includes(room.id))return []
      return roomPoints(room).map(p=>({...p,...site(member.zone,p.x,p.z),unit:room.id}))
    }
    return residentialPoints(member.zone,member,keys,world.residential)
  }
  private homeUse(world:World,me:Member,target:HomePoint,keys:string[],now:number){
    const b=residentialAt(me.zone),state=world.residential
    if(me.homePose)fail(409,'Stand up first')
    const people=world.life.people(world.members.values())
    if(target.door){
      const error=operateDoor(me,target,keys,state,people,now)
      if(error)fail(error.startsWith('Locked')?403:409,error)
      me.interaction=undefined
    }else if(target.pose&&target.exit){
      if(!occupy(me,target,people))fail(409,'That place is occupied')
      me.interaction=undefined
    }else if(target.id.startsWith('call:')&&b){
      const error=callResidentialLift(me,state,people,now)
      if(error)fail(409,error)
    }else if(target.id.startsWith('lift:')&&b){
      if(!aboard(me.zone,me.x,me.z)||!openLift(state.lifts[b.building.id]??{level:0,opened:0},b.level,now))fail(409,'Step inside the elevator first')
      me.interaction=target.id as WorldUse
    }else if(target.id.startsWith('drawer:')){
      if(!target.unit||!keys.includes(target.unit))fail(403,'This drawer is private')
      me.interaction=target.id as WorldUse
    }else if(target.id.startsWith('fridge:')){
      if(!access(target.unit,keys))fail(403,'This refrigerator is private')
      me.interaction=target.id as WorldUse
    }
  }

  update(name:string,action:string,data:Record<string,unknown>,now=Date.now()):WorldView{
    this.clean(now)
    this.arcade.active(name,now)
    let bookings=roster(this.store,now)
    const booking=bookings.find(b=>b.user===name)
    if(booking&&action!=='presence')fail(423,'In custody at Meridian Police')
    const account=this.store.rouletteWallet(name)??fail(401,'Log in first')
    const open=(account.coins??0)>=1&&account.caveDay!==dayKey(now)
    const avatar=account.avatar??'default'
    let world=this.occupants.get(name)
    if(!world){
      if(action!=='presence'&&action!=='teleport'&&!(action==='exit-cave'&&account.caveActive))fail(409,'Join the city first')
      world=this.enter(name,avatar,account.caveActive?'private':'city',now)
    }
    const me=world.members.get(name)!
    if(booking){
      if(me.cell!==booking.cell){this.arrive(world,me,galleryZone(booking.cell),now);me.cell=booking.cell}
      else if(data.world===world.id&&data.scene===true)this.store.transaction(tx=>cellMove(tx,booking,data.x,data.z,data.yaw))
      Object.assign(me,{x:booking.x,z:booking.z,yaw:booking.yaw,seen:now})
      return {id:world.id,now,you:{...publicMember(me,data.scene===true),name:booking.name},players:[],coins:account.coins??0,caveOpen:false,
        arcade:{hp:this.store.cityStats(name)?.hp??MAX_HP,slots:Array(SLOT_COUNT).fill(null),sequence:0,remaining:0,stars:0,contacts:[],drops:[],custody:custodyView(booking)}}
    }
    if(me.cell){delete me.cell;this.arrive(world,me,'station',now)}
    let housing=this.housing(name,now)
    const shared=data.scene===true
    world.restaurant.tick(now)
    me.seen=now;me.avatar=avatar
    world.life.tick(now,world.residential,world.members.values())
    settleResidentialLifts(world.residential,[...world.members.values()],now)
    if(me.lift&&now>=me.lift.ends){me.zone=me.lift.to;me.lift=undefined;me.liftArrived=true;me.moved=now}
    if(guestFloor(me.zone)){
      const p=localSite(me.zone,me.x,me.z),room=roomAt(me.zone,p.x,p.z)
      if(room&&!housing.keys.includes(room.id))this.arrive(world,me,me.zone,now,{x:0,z:p.z,yaw:0})
    }
    const expired=unauthorizedHome(me.zone,me.x,me.z,housing.keys)
    if(expired){
      const b=residentialAt(me.zone)!.building
      Object.assign(me,residentialSite(b,expired.exit.x,expired.exit.z))
      if(b.block===undefined)me.zone='city'
      delete me.homePose;delete me.homeExit;me.interaction=undefined
    }
    if(me.zone==='private'&&action!=='presence'&&action!=='exit-cave'&&action!=='teleport')fail(409,'Leave the room first')
    if(me.lift&&action!=='presence'&&action!=='teleport')fail(409,'Wait for the elevator to arrive')
    let resort:ResortView|undefined
    let hall:HallView|undefined,food:ReturnType<typeof residentialFood>|undefined
    if(action==='presence'){
      const motion=data.kitchenMotion as {x?:unknown;y?:unknown}|undefined
      if(me.zone==='kfc'&&['kfc:kitchen:station','kfc:kitchen:soda','kfc:kitchen:fryer'].includes(me.interaction??'')&&motion&&
        typeof motion.x==='number'&&Number.isFinite(motion.x)&&typeof motion.y==='number'&&Number.isFinite(motion.y)){
        me.kitchenMotion={x:Math.max(-1,Math.min(1,motion.x)),y:Math.max(-1,Math.min(1,motion.y))}
      }else delete me.kitchenMotion
      const {x,z,yaw}=data
      const currentFloor=data.zone===undefined||data.zone===me.zone||!(civicRoom(me.zone)||typeof data.zone==='string'&&civicRoom(data.zone))
      if(data.world===world.id&&currentFloor&&(shared||data.zone===me.zone)&&!me.chair&&!me.lounge&&me.barSeat===undefined&&me.boardSeat===undefined&&me.dining===undefined&&!me.lift&&!me.homePose&&me.zone!=='private'&&[x,z,yaw].every(n=>typeof n==='number'&&Number.isFinite(n))){
        const limit=(data.sprint===true?SPRINT_SPEED:WORLD_SPEED)*Math.min(1.25,Math.max(0,(now-me.moved)/1000)),goal=shared?{x:x as number,z:z as number}:site(me.zone,x as number,z as number)
        const {zone,...pos}=worldMove(me.zone,me,goal.x,goal.z,limit,open||me.zone==='cave',housing.keys,world.residential,now,world.life.traffic.vehicles)
        Object.assign(me,pos,{yaw:Math.atan2(Math.sin(yaw as number),Math.cos(yaw as number)),moved:now})
        if(me.kitchenMotion)me.yaw=me.interaction==='kfc:kitchen:station'?0:-Math.PI/2
        this.walkthrough(world,me,zone,open,now)
      }
    }else if(action==='close-resort'){
      if(me.interaction===data.station&&me.interaction?.startsWith('resort:')){
        if(me.homePose?.id.startsWith('salon-'))stand(me)
        me.interaction=undefined
      }
    }else if(action==='resort-floor'){
      const to=data.floor
      if(me.interaction!=='resort:lift'||(to!=='hotel'&&to!=='hotel:2'&&to!=='hotel:3'))fail(409,'Choose a floor from the hotel lift')
      this.arrive(world,me,to,now,{...HOTEL_LIFT,yaw:0})
    }else if(action==='resort'){
      const station=me.interaction
      if(!station?.startsWith('resort:')||!me.homePose?.id.startsWith('salon-')&&!this.points(world,me,now).some(p=>p.id===station&&near(me,p.x,p.z,p.range)))fail(409,'Visit the resort counter or table first')
      resort=this.store.transaction(u=>resortService(u,name,station!,now,data))
      housing=this.housing(name,now)
    }else if(action==='housing'){
      const unit=UNITS.find(u=>u.id===data.unit)??fail(400,'Unknown address')
      const counter='property:'+(unit.block===undefined?unit.id:'desk-'+unit.block)
      if(!this.points(world,me,now).some(p=>(p.id===counter||p.id==='front:hall'&&me.interaction===p.id)&&near(me,p.x,p.z,p.range)))fail(409,'Visit the listing or clerk first')
      this.store.transaction(u=>{
        const deeds=u.metadata<Deeds>('cityDeeds')??{},old=deeds[unit.id]
        if(old&&(!old.until||old.until>now)){
          if(old.holder===name)return
          fail(409,'This home is occupied')
        }
        if(unit.tenure==='resident')fail(409,'This home is unavailable')
        const owner=u.users.get(name)??fail(401,'Log in first'),purse=wallet(owner)
        requireSpending(owner,now)
        if(purse.coins<unit.price)fail(409,'Insufficient coins')
        purse.coins-=unit.price
        deeds[unit.id]={holder:name,until:unit.tenure==='rent'?now+7*86400000:0}
        u.putMetadata('cityDeeds',deeds)
        u.economyUsage(name,'/api/world/housing',{action:unit.tenure==='rent'?'housing_lease':'housing_purchase',reference:unit.id,coins:unit.price},now)
      })
      housing=this.housing(name,now)
    }else if(action==='home-floor'){
      const a=residentialAt(me.zone),to=data.level
      if(typeof to!=='number'||!Number.isInteger(to)||to<0||!a?.building.levels[to])fail(400,'Choose a residential floor')
      if(!a||!a.building.lift||me.interaction!=='lift:'+a.building.id||!aboard(me.zone,me.x,me.z))fail(409,'Step inside the elevator first')
      const error=residentialRide(me,to,world.residential,world.life.people(world.members.values()),now)
      if(error)fail(409,error)
      me.interaction=undefined
    }else if(action==='food'||action==='close-fridge'){
      const id=me.interaction
      const target=id?.startsWith('fridge:')?this.homePoints(world,me,now).find(p=>p.id===id&&near(me,p.x,p.z,p.range)):undefined
      if(action==='close-fridge'){
        if(id==='food'||id?.startsWith('fridge:'))me.interaction=undefined
      }else{
        if(data.operation!=='eat'&&data.operation!==undefined&&!target)fail(409,'Open an accessible refrigerator first')
        food=residentialFood(this.store,name,housing.keys,target?.unit,data.operation===undefined?undefined:data)
        if(!target&&data.operation===undefined)me.interaction='food'
      }
    }else if(action==='chat'){
      const text=typeof data.text==='string'?data.text.replace(/[\p{Cc}\p{Cf}]/gu,' ').trim():''
      if(!text||[...text].length>180)fail(400,'Say something in 180 characters or fewer')
      if(now-(world.lastChat.get(name)??-Infinity)<1100)fail(429,'Wait a moment before sending another message')
      world.lastChat.set(name,now)
      world.chat.push({id:++world.nextChat,name,text,at:now})
      if(world.chat.length>36)world.chat.shift()
    }else if(action==='teleport'){
      const to=data.to as Destination
      if(!Object.hasOwn(DESTINATIONS,to))fail(400,'Choose a city destination')
      if(account.caveActive||me.zone==='private')this.privateExit(world,me,now)
      else{
        if(me.zone==='casino')this.roulette.detach(name,world.id)
        this.arrive(world,me,DESTINATIONS[to],now)
      }
    }else if(action==='exit-cave'){
      if(me.zone==='private'||account.caveActive)this.privateExit(world,me,now)
    }else if(action==='use'){
      const target=this.points(world,me,now).find(p=>p.id===data.target&&near(me,p.x,p.z,p.range))
      if(!target)fail(409,'Move closer to interact')
      if(target.id.startsWith('resort:bed:')||target.id.startsWith('resort:bath:')||target.id.startsWith('fridge:hotel-')){
        const p=localSite(me.zone,me.x,me.z),r=roomAt(me.zone,p.x,p.z)
        if(!r||!housing.keys.includes(r.id)||!(target.id.endsWith(':'+r.number)||target.id==='fridge:'+r.id))fail(403,'This room requires a valid key')
        if(target.id.startsWith('resort:bed:')){
          const bed=bedAt(r)
          me.homeExit={x:me.x,z:me.z,yaw:me.yaw}
          me.homePose={...site(me.zone,bed.x,bed.z),id:r.id,kind:'rest',height:.62,yaw:-Math.PI/2*r.side}
          Object.assign(me,{x:me.homePose.x,z:me.homePose.z,yaw:me.homePose.yaw})
          me.interaction=undefined
        }else if(target.id.startsWith('resort:bath:')){
          me.shower={room:r.number,until:now+12_000};me.interaction=undefined
        }else me.interaction=target.id as WorldUse
      }else if(target.id==='exchange-lobby'){
        this.arrive(world,me,'exchange',now,{...LIFT,yaw:Math.PI})
        me.liftArrived=true
      }else if(target.id.startsWith('bath-seat:')){
        const z=bathSeats[Number(target.id.slice(10))]
        const pose={...site(me.zone,2.35,z),yaw:-Math.PI/2,id:target.id,kind:'sit' as const,height:.50}
        if(me.homePose||!occupy(me,{...target,range:.82,pose,exit:{x:target.x,z:target.z}},[...world.members.values()]))fail(409,'This bench is occupied')
        me.interaction=undefined
      }else if(['resort:poker','resort:blackjack','resort:slots'].includes(target.id)){
        if(me.homePose)fail(409,'Stand up first')
        const game=target.id.slice(7),local=localSite(me.zone,target.x,target.z)
        const positions=game==='slots'?[{x:6.72,yaw:-Math.PI/2,id:'salon-slots-'+gameStations.find(s=>s.id===game&&Math.abs(local.z-s.z)<.01)!.z}]:
          [1,-1].map(side=>({x:-6+side*1.64,yaw:side*Math.PI/2,id:'salon-'+game+'-'+side}))
        const seat=positions.find(s=>![...world.members.values()].some(m=>m.zone===me.zone&&m.homePose?.id===s.id))
        if(!seat)fail(409,'All seats are occupied')
        const pose={...site(me.zone,seat.x,local.z),yaw:seat.yaw,id:seat.id,kind:'sit' as const,height:.53}
        occupy(me,{...target,range:1.28,pose,exit:{x:me.x,z:me.z}},[])
        me.interaction=target.id as WorldUse
      }else if(/^(door|furniture|call|lift|fridge|drawer):/.test(target.id)){
        this.homeUse(world,me,target as HomePoint,housing.keys,now)
      }else if(target.id.startsWith('seat:')||target.id.startsWith('couch:')){
        const [type,index]=target.id.split(':')
        hall=this.roulette.update(name,type==='seat'?'sit':'lounge',type==='seat'?{table:Number(index)}:{couch:Number(index)},now,{id:world.id,position:this.boundPosition(me)})
      }else if(target.id.startsWith('board:')){
        const i=Number(target.id.slice(6)),seat=BOARD_SEATS[i]
        me.boardSeat=i
        Object.assign(me,site(me.zone,seat.x,seat.z),{yaw:seat.yaw})
        me.interaction='board'
      }else if(target.id.startsWith('bar-seat:')){
        const i=Number(target.id.slice(9)),seat=BAR_STOOLS[i]
        if([...world.members.values()].some(p=>p!==me&&p.barSeat===i))fail(409,'That stool is taken')
        me.barSeat=i;Object.assign(me,site('casino',seat.x,seat.z),{yaw:seat.yaw})
        me.interaction='bar'
      }else if(target.id.startsWith('kfc:sit:')){
        world.restaurant.act(me,'sit',{seat:Number(target.id.split(':').at(-1))},now)
        me.interaction='kfc:dining'
      }else if(target.id.startsWith('kfc:kitchen:')){
        const completed=world.restaurant.kitchenPoint(me,target.id,now)
        me.interaction=completed?undefined:target.id as WorldUse
        if(completed)me.workingUntil=now+750
      }else me.interaction=target.id as WorldUse
    }else if(action==='restaurant'){
      const kind=world.restaurant.jobKind(name)
      world.restaurant.act(me,data.command,data,now)
      if(data.command==='step')me.workKind=kind
      if(data.command==='step'||data.command==='kitchen'||data.command==='take'||data.command==='deliver')me.workingUntil=now+800
      if(data.command==='stand'||data.command==='leave-station'||data.command==='kitchen'&&data.gesture!=='flip')me.interaction=undefined
    }else if(action==='bail'){
      const desk=this.points(world,me,now).find(p=>p.id==='booking')
      if(me.zone!=='station'||me.interaction!=='booking'||!desk||!near(me,desk.x,desk.z,desk.range))fail(403,'Visit the booking and bail desk first')
      this.store.transaction(tx=>payBail(tx,name,data.booking,now))
      bookings=roster(this.store,now)
    }else if(action==='bar'){
      const pos=site('casino',BAR.x,BAR.z)
      if(me.zone!=='casino'||!near(me,pos.x,pos.z,1.85)&&me.barSeat===undefined)fail(409,'Order at the bar')
      const drink=DRINKS.find(d=>d.id===data.drink),id=data.id
      if(!drink||typeof id!=='string'||!/^[\w-]{12,80}$/.test(id))fail(400,'Choose a drink')
      const key=JSON.stringify([name,id])
      if(!world.barReceipts.has(key)){
        if(world.bar&&now<world.bar.ready+1300)fail(409,'The bartender is working on another drink')
        this.store.transaction(u=>{
          const account=u.users.get(name)??fail(401,'Log in first'),purse=wallet(account)
          if(purse.coins<drink.price)fail(409,'Not enough coins for this drink')
          requireSpending(account,now)
          purse.coins-=drink.price
          const economy=companies(u,now)
          economy.CAS.cash+=cashUnits(drink.price)
          operating(economy.CAS,'Bar sales',cashUnits(drink.price),now);saveCompanies(u,economy)
          u.economyUsage(name,'/api/world/bar',{action:'bar_purchase',symbol:'CAS',reference:id,coins:drink.price},now)
        })
        world.bar={name,drink:drink.id,starts:now,ready:now+2800,id};world.barReceipts.set(key,drink.id)
        if(world.barReceipts.size>100)world.barReceipts.delete(world.barReceipts.keys().next().value!)
      }else if(world.barReceipts.get(key)!==drink.id)fail(409,'That receipt belongs to a different drink')
    }else if(action==='stand-scenery'){
      if(stand(me)){
        me.interaction=undefined
      }else if(me.barSeat!==undefined){delete me.barSeat;me.z-=.37}
      else if(me.boardSeat!==undefined){
        const seat=BOARD_SEATS[me.boardSeat]
        delete me.boardSeat
        const dx=Math.sign(seat.x)*(Math.abs(seat.x)>3.5?.34:0),dz=Math.sign(seat.z-BOARD_TABLE.z)*.34
        Object.assign(me,site(me.zone,seat.x+dx,seat.z+dz))
      }
      me.interaction=undefined
    }else if(action==='floor'){
      const local=localSite(me.zone,me.x,me.z)
      if(me.interaction!=='elevator'||!near({...local,yaw:me.yaw},LIFT.x,LIFT.z,1.25))fail(409,'Enter the elevator first')
      if(data.symbol==='residences'){
        const crown=buildingById.get('block-'+crownBlock)!
        this.arrive(world,me,homeZone(crown.id,0),now,{...residentialSite(crown,0,crown.rect.b+1.03),yaw:Math.PI})
      }else{
        const to=data.symbol===''?'exchange':typeof data.symbol==='string'&&stockFloor(data.symbol)?`floor:${data.symbol}` as const:fail(400,'Choose a listed floor')
        if(to!==me.zone){
          const duration=1000+Math.min(4800,Math.abs(floorHeight(to)-floorHeight(me.zone))*9)
          me.lift={to,started:now+250,ends:now+250+duration};me.interaction=undefined;me.yaw=Math.PI
        }else{me.interaction=undefined;me.liftArrived=true}
      }
    }else if(action==='stand'||action==='bet'){
      if(me.zone!=='casino')fail(409,'Visit the casino to use a table')
      hall=this.roulette.update(name,action,data,now,{id:world.id,position:this.boundPosition(me)})
    }else if(action!=='arcade')fail(404,'Unknown city action')
    if(me.kitchenMotion&&!me.interaction?.startsWith('kfc:kitchen:'))delete me.kitchenMotion
    if(me.zone==='casino'){
      hall??=this.roulette.update(name,'presence',{},now,{id:world.id,position:this.boundPosition(me)})
      if(me.barSeat===undefined)Object.assign(me,{...site('casino',hall.you.x,hall.you.z),yaw:hall.you.yaw,chair:hall.you.chair,lounge:hall.you.lounge})
    }
    for(const person of world.members.values())if(person.zone==='kfc'){
      person.carrying=world.restaurant.hasTray(person.name)
      person.kfcRole=world.restaurant.workerRole(person.name)
      person.kitchenHand=world.restaurant.kitchenHand(person.name)
      person.carriedItems=world.restaurant.carriedItems(person.name)
    }
    const at=(id:string)=>me.interaction===id&&this.points(world,me,now).some(p=>p.id===id&&near(me,p.x,p.z,p.range))
    const drawer=me.interaction?.startsWith('drawer:')?this.homePoints(world,me,now).find(p=>p.id===me.interaction&&near(me,p.x,p.z,p.range)&&housing.keys.includes(p.unit!))?.unit:undefined
    const level=riderHeight(me,now)
    const restaurant=level<5&&(me.zone==='kfc'||near(me,RESTAURANT.x,RESTAURANT.z,26))?world.restaurant.view(name,now,me.zone==='kfc'):undefined
    const residents=world.life.population.map(n=>({id:n.resident.id,name:n.name,x:n.x,z:n.z,zone:n.zone}))
    residents.push(...cityStaff)
    if(me.zone.startsWith('floor:'))residents.push(...serviceStaff(me.zone))
    for(const a of restaurant?.actors??[])residents.push({id:'kfc:'+a.id,name:a.name,zone:'kfc',...site('kfc',a.x,a.z)})
    const simulation=this.arcade.run({world:world.id,shard:world.shard,me,players:[...world.members.values()],residents,
      residential:world.residential,vehicles:world.life.traffic.vehicles,caveOpen:open||me.zone==='cave',keys:housing.keys,drawer,front:me.interaction?.startsWith('front:')&&at(me.interaction)?storefront(me.interaction):undefined,bank:at('cash'),shop:at('counter')},now,action==='arcade'?data:undefined)
    if((action==='presence'||action==='arcade')&&typeof data.slot==='number'&&Number.isInteger(data.slot)&&data.slot>=0&&data.slot<SLOT_COUNT)me.slot=data.slot
    if(simulation.view.bite)me.eatingUntil=simulation.view.bite.ends
    const item=simulation.view.slots[me.slot??0]?.item
    me.equipped=isWeapon(item)?item:undefined
    if(simulation.respawn){const victim=world.members.get(simulation.respawn)!;delete victim.equipped;this.arrive(world,victim,'city',now)}
    if(simulation.view.custody)return this.update(name,'presence',{},now)
    const players=me.zone==='private'?[]:[...world.members.values()].filter(p=>p.name!==name&&!bookings.some(b=>b.user===p.name)&&p.zone!=='private'&&near(me,p.x,p.z,48)&&(shared?Math.abs(riderHeight(p,now)-level)<23:p.zone===me.zone)).map(p=>publicMember(p,shared))
    if(at('booking')){
      const rows=bookings.map(bailListing)
      simulation.view.register=rows.map(b=>b.name)
      simulation.view.bailRegister=rows
    }
    for(const b of bookings){
      const zone=galleryZone(b.cell)
      if(me.zone!==zone)continue
      players.push({name:b.name,avatar:b.avatar,zone,...(shared?{x:b.x,z:b.z}:localSite(zone,b.x,b.z)),yaw:b.yaw,
        online:!!this.occupants.get(b.user)?.members.get(b.user)})
    }
    const casino=site('casino',0,3)
    const tableMotion=shared&&!hall&&me.zone!=='private'&&level<5&&near(me,casino.x,casino.z,29)?this.roulette.tableMotion(world.id):undefined
    if(restaurant)restaurant.actors=restaurant.actors.filter(a=>!(simulation.health['kfc:'+a.id]?.returns>now))
    const coins=action==='bail'||action==='resort'||action==='arcade'||action==='housing'||action==='restaurant'||action==='bar'||action==='use'&&me.zone==='kfc'?this.store.rouletteWallet(name)?.coins:account.coins
    if(me.interaction==='food')food??=residentialFood(this.store,name,housing.keys)
    if(me.interaction?.startsWith('fridge:')){
      const target=this.homePoints(world,me,now).find(p=>p.id===me.interaction&&near(me,p.x,p.z,p.range))
      if(target?.unit)food??=residentialFood(this.store,name,housing.keys,target.unit)
      else me.interaction=undefined
    }
    const residential={...world.residential,fridge:me.interaction?.startsWith('fridge:')?me.interaction:undefined,
      fridges:[...world.members.values()].flatMap(p=>p.interaction?.startsWith('fridge:')?[p.interaction]:[])}
    if(me.interaction?.startsWith('resort:')&&!resort){
      const station=me.interaction
      resort=this.store.transaction(u=>resortService(u,name,station,now))
    }
    const surroundings=shared&&level<22&&me.zone!=='private'?world.life.snapshot(me,now):undefined
    if(surroundings)surroundings.residents=surroundings.residents.filter(r=>!(simulation.health[r.id]?.returns>now))
    return {id:world.id,now,resort,housing,food,residential,arcade:simulation.view,...surroundings,boardTaken:me.zone==='floor:CAS'||me.zone==='floor:BNK'?this.boardTaken(world,me):undefined,chat:me.zone==='private'?undefined:world.chat,bar:world.bar&&now-world.bar.ready<6000?world.bar:undefined,you:publicMember(me,shared),players,coins:action==='bar'?coins??0:hall?.coins??coins??0,caveOpen:open&&me.zone!=='private',hall,tableMotion,restaurant,interaction:me.interaction}
  }
}
