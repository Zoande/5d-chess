import {deskFurniture,at,insideDoor,venue} from '../src/world/civic-venues.ts'
import {randomUUID} from 'node:crypto'
import type {ChessStore,UnitOfWork} from './storage.ts'
import {CLEAR_MINUTES,MAX_HP,WEAPONS,isWeapon,type ArcadeView,type Contact,type Stack,type Item} from '../src/world/arcade.ts'
import {actorDistance,clearSight} from '../src/world/sight.ts'
import type {Vehicle} from '../src/world/traffic.ts'
import type {ResidentialView} from '../src/world/residential.ts'
import {near,localSite,site,riderHeight,type WorldPlayer} from '../src/world/model.ts'
import {UNITS,type Deeds} from '../src/world/housing.ts'
import {buildingById,homeZone,residentialSite,residentialAt,contains} from '../src/world/residential.ts'
import {ROOMS,center,guestFloor,roomAt} from '../src/world/resort.ts'
import {migratePrecinct,book,roster,custodyView} from './custody.ts'
import type {STOREFRONTS} from '../src/world/storefronts.ts'
import {wallet} from './economy.ts'
import {requireSpending} from './credit.ts'
import {BITE_MS,GROCERIES,isGrocery} from '../src/world/food.ts'
import {heal,carry,mirrorFood,pack,quantity,releaseDrawer,transfer,type Pack} from './city-inventory.ts'
import {fail} from './http.ts'

type Located={x:number;z:number;zone:string}
type Drop=Located&{id:string;items:Stack[]}
type NpcHealth={hp:number;returns:number}
type Scene={front?:typeof STOREFRONTS[number];residential?:ResidentialView;vehicles?:readonly Vehicle[];caveOpen?:boolean;world:string;shard:number;me:WorldPlayer;players:WorldPlayer[];residents:(Located&{id:string;name:string})[];keys:string[];drawer?:string;bank:boolean;shop:boolean}
type Search={id:string;world:string;units:Contact[];cursor:number;lastKnown:Located;last:number;arrived:number;raidAt:number;dogAt:number;dogWarningUntil?:number;searched:string[];warning:string}
const longestRange=Math.max(...Object.values(WEAPONS).map(w=>w.range))
const searchSites=[
  ...UNITS.map(unit=>{
    const building=buildingById.get(unit.block===undefined?unit.id:'block-'+unit.block)!
    const {rect}=building.levels[unit.floor].units.find(u=>u.id===unit.id)!
    return {...unit,target:{...residentialSite(building,(rect.l+rect.r)/2,(rect.b+rect.f)/2),zone:homeZone(building.id,unit.floor)},
      inside:(me:WorldPlayer)=>contains(rect,(me.x-building.x)*building.facing,(me.z-building.z)*building.facing)}
  }),
  ...ROOMS.map(room=>{
    const point=site(room.floor,room.side*5.6,center(room))
    return {id:room.id,name:'Royal room '+room.number,...point,target:{...point,zone:room.floor},
      inside:(me:WorldPlayer)=>{const p=localSite(me.zone,me.x,me.z);return roomAt(me.zone,p.x,p.z)?.id===room.id}}
  }),
]
export const RULES={notice:4500,sight:[0,12,15,18,22,30],officers:[0,1,2,3,4,5],speed:[0,1.6,1.9,2.2,2.5,2.7],dogRange:7,dogCooldown:18000,dogNotice:2400,raidDelay:12000}
function advance(p:Pack,by:number){
  if(p.stars===5)return
  p.stars=Math.min(5,p.stars+by)
  p.remaining=CLEAR_MINUTES[p.stars]*60000
}
export class CityArcade {
  private store:ChessStore
  private seen=new Map<string,number>()
  private searches=new Map<string,Search>()
  constructor(store:ChessStore){
    this.store=store
    store.transaction(tx=>{
      migratePrecinct(tx)
      for(const shard of [1,...tx.metadata<number[]>('dropDistricts')??[]]){
        const key='cityDrops:'+shard,bags=tx.metadata<Drop[]>(key)??[]
        let moved=false
        for(const bag of bags)if(venue(bag.zone)&&bag.x>190){
          const door=insideDoor(bag.zone)
          Object.assign(bag,at(bag.zone,door.x,door.z));moved=true
        }
        if(moved)tx.putMetadata(key,bags)
      }
    })
    for(const shard of (store.metadataValue('dropDistricts')??[]) as number[])this.retire(shard)
  }
  retire(shard:number){
    if(shard===1)return
    const key='cityDrops:'+shard
    if(!this.store.metadataValue(key))return
    this.store.transaction(tx=>{
      const items=tx.metadata<Drop[]>(key)??[]
      if(items.length)tx.putMetadata('cityDrops:1',[...tx.metadata<Drop[]>('cityDrops:1')??[],...items])
      tx.putMetadata(key,[])
      tx.putMetadata('dropDistricts',(tx.metadata<number[]>('dropDistricts')??[]).filter(n=>n!==shard))
    })
  }
  offline(name:string){this.seen.delete(name)}
  active(name:string,now:number){
    const last=this.seen.get(name)
    this.seen.set(name,now)
    if(last===undefined||now<=last||now-last>30000)return
    if(!this.store.cityStats(name)?.stars)return
    this.store.transaction(tx=>{
      const p=pack(tx.users.get(name)!)
      p.remaining=Math.max(0,p.remaining-(now-last))
      if(!p.remaining){p.stars=0;delete p.wantedReason;this.searches.delete(name)}
    })
  }
  private staff(now:number):Contact[]{
    return [...deskFurniture.map(d=>({id:d.id,label:d.id==='desk'?'Desk officer':'Booking officer',kind:'officer' as const,zone:'station',...at('station',d.x,d.z+.72)})),
      {id:'patrol',label:'Meridian patrol',kind:'officer',zone:'city',x:-50+4*Math.sin(now/9000),z:-61}]
  }
  private sweep(tx:UnitOfWork,s:Scene,stars:number,search:Search,now:number){
    const deeds=tx.metadata<Deeds>('cityDeeds')??{}
    const owned=searchSites.filter(u=>deeds[u.id]?.holder===s.me.name&&(!deeds[u.id].until||deeds[u.id].until>now))
    const candidates=stars<4?owned:searchSites.filter(u=>owned.includes(u)||Math.hypot(u.x-s.me.x,u.z-s.me.z)<18||owned.some(h=>Math.hypot(u.x-h.x,u.z-h.z)<12))
    const unit=candidates.find(u=>!search.searched.includes(u.id))??candidates[search.cursor%candidates.length]
    if(!unit)return
    search.cursor++;search.searched=[...search.searched.slice(-3),unit.id];search.warning='Searching '+unit.name
    const officer=search.units.at(-1)!
    Object.assign(officer,unit.target)
    if(!owned.includes(unit))return
    const a=tx.users.get(s.me.name)!,p=pack(a)
    const drawer=p.drawers[unit.id]
    if(drawer?.some(i=>isWeapon(i.item))){p.drawers[unit.id]=drawer.filter(i=>!isWeapon(i.item));p.sequence++}
    if(s.me.zone===unit.target.zone&&unit.inside(s.me)){
      if(p.slots.some(i=>isWeapon(i?.item))){p.slots=p.slots.map(i=>isWeapon(i?.item)?null:i);p.sequence++}
    }
  }
  private pursue(s:Scene,p:Pack,now:number){
    const me=s.me
    if(!p.stars){this.searches.delete(me.name);return}
    let search=this.searches.get(me.name)
    if(!search){
      search={id:randomUUID(),world:s.world,units:[],cursor:0,lastKnown:{x:me.x,z:me.z,zone:me.zone},last:now,arrived:now,raidAt:now,dogAt:now-RULES.dogCooldown,searched:[],warning:'Meridian patrol is searching'}
      this.searches.set(me.name,search)
    }
    search.world=s.world
    const dt=Math.max(0,Math.min(1.25,(now-search.last)/1000));search.last=now
    const residence=residentialAt(me.zone)
    const local=guestFloor(me.zone)?localSite(me.zone,me.x,me.z):undefined
    const guestRoom=local&&roomAt(me.zone,local.x,local.z)
    const room=guestRoom??residence?.f.units.find(u=>contains(u.rect,(me.x-residence.building.x)*residence.building.facing,(me.z-residence.building.z)*residence.building.facing))
    const canEnter=(!residence&&!guestRoom)||p.stars>=3&&(!room||s.keys.includes(room.id)||p.stars>=4)
    while(search.units.length<RULES.officers[p.stars]){
      const i=search.units.length
      search.units.push({id:'patrol-'+search.id+'-'+i,label:'Patrol '+(i+1),kind:'officer',x:me.x+10+i*1.5,z:me.z+4-i,zone:canEnter?me.zone:'city'})
    }
    if(p.stars>=3&&now-search.raidAt>=RULES.raidDelay){
      this.store.transaction(tx=>this.sweep(tx,s,p.stars,search!,now))
      search.raidAt=now
    }
    let caught=false,tracking=false
    const health=this.store.metadataValue('npc:'+s.shard) as Record<string,NpcHealth>|undefined
    for(const [i,o] of search.units.entries()){
      if(!canEnter||(health?.[o.id]?.returns??0)>now)continue
      if(p.stars>=3&&i===search.units.length-1&&search.searched.length&&now-search.raidAt<5000)continue
      if(o.zone!==me.zone){
        if(now-search.arrived<5000)continue
        Object.assign(o,{x:me.x+12,z:me.z+2,zone:me.zone})
      }
      if(now-search.arrived<RULES.notice)continue
      const distance=Math.hypot(o.x-me.x,o.z-me.z)
      const spotted=distance<=RULES.sight[p.stars]||p.stars===5&&me.zone==='city'
      if(spotted){search.lastKnown={x:me.x,z:me.z,zone:me.zone};tracking=true}
      const phase=(now-search.arrived)/4500+i
      const goal=spotted?me:{x:search.lastKnown.x+4*Math.cos(phase),z:search.lastKnown.z+4*Math.sin(phase)}
      const d=Math.hypot(goal.x-o.x,goal.z-o.z),step=Math.min(d,RULES.speed[p.stars]*dt)
      if(d){o.x+=(goal.x-o.x)*step/d;o.z+=(goal.z-o.z)*step/d}
      if(distance<1.15)caught=true
    }
    if(!search.searched.length||now-search.raidAt>5000)search.warning=tracking?'Meridian patrol in pursuit':'Meridian patrol is searching'
    if(p.stars===5){
      const lead=search.units[0],d=Math.hypot(lead.x-me.x,lead.z-me.z)
      if(d<=RULES.dogRange&&lead.zone===me.zone&&now-search.dogAt>=RULES.dogCooldown){
        search.dogAt=now;search.dogWarningUntil=now+RULES.dogNotice
      }
      if(search.dogWarningUntil!==undefined){
        if(now<search.dogWarningUntil){
          search.warning='Dog team approaching — move away!';caught=false
        }else{
          if(now-search.dogWarningUntil<1500&&d<2.8&&lead.zone===me.zone)caught=true
          search.warning='Helicopter tracking the area';delete search.dogWarningUntil
        }
      }
    }
    if(caught){
      const b=this.store.transaction(tx=>book(tx,me.name,p.stars,now))
      if(b){this.searches.delete(me.name);return b}
      search.warning='Booking full — patrol holding back'
    }
  }
  run(s:Scene,now:number,data?:Record<string,unknown>){
    const {me,world}=s
    const dropKey='cityDrops:'+s.shard,npcKey='npc:'+s.shard
    const patrols=()=>[...this.searches.values()].filter(search=>search.world===world&&now-search.last<30000).flatMap(search=>search.units)
    const staff=[...this.staff(now),...patrols()]
    const bookings=roster(this.store,now)
    const people:Contact[]=s.players.filter(o=>o.zone!=='private'&&o.name!==me.name&&!bookings.some(b=>b.user===o.name)).map(o=>({x:o.x,z:o.z,zone:o.zone,height:riderHeight(o,now),id:'player:'+o.name,label:o.name,kind:'player'}))
    const civilians:Contact[]=[...people,...s.residents.map(o=>({...o,id:o.id,label:o.name,kind:'resident' as const}))]
    const targets=[...staff,...civilians]
    const observer={...me,height:riderHeight(me,now)},visibility=new Map<string,boolean>()
    const canTarget=(c:Contact)=>{
      if(!visibility.has(c.id))visibility.set(c.id,clearSight(observer,c,s,now))
      return visibility.get(c.id)!
    }
    let respawn:string|undefined
    const saved=data?undefined:this.store.cityPack(me.name)
    const {p,drops,health}=saved&&(!saved.bite||saved.bite.ends>now)&&Object.keys(saved.drawers).every(id=>s.keys.includes(id))?{
      p:saved,drops:(this.store.metadataValue(dropKey)??[]) as Drop[],health:(this.store.metadataValue(npcKey)??{}) as Record<string,NpcHealth>
    }:this.store.transaction(tx=>{
      const a=tx.users.get(me.name)!,p=pack(a)
      if(p.bite&&p.bite.ends<=now){heal(a,20);delete p.bite}
      for(const id of Object.keys(p.drawers))if(!s.keys.includes(id))releaseDrawer(p,id)
      const drops=tx.metadata<Drop[]>(dropKey)??[],health=tx.metadata<Record<string,NpcHealth>>(npcKey)??{}
      if(data){
        if(data.sequence!==p.sequence)fail(409,'Inventory changed. Review your hotbar.')
        const op=data.operation
        if(op==='groceries'||op==='treatment'){
          const counter=s.front
          if(!counter)fail(409,'Visit the counter first')
          const grocery=GROCERIES.find(i=>i.id===data.item&&counter.stock?.includes(i.id))
          const care=counter.care
          if(op==='groceries'&&!grocery||op==='treatment'&&!care)fail(400,'Choose an available service')
          const cost=op==='groceries'?grocery!.price:care!.cost
          const purse=wallet(a)
          if(cost){requireSpending(a,now);if(purse.coins<cost)fail(409,'Insufficient coins')}
          if(op==='groceries'){carry(p,grocery!.id,1);mirrorFood(a)}
          else{
            if(p.hp>=MAX_HP)fail(409,'Already at full health')
            heal(a,care!.hp)
          }
          purse.coins-=cost
          tx.economyUsage(me.name,'/api/world/arcade',{action:'restaurant_action',service:counter.id,reference:grocery?.id??'care',coins:cost},now)
        }else if(op==='eat'){
          const slot=typeof data.slot==='number'&&Number.isInteger(data.slot)?data.slot:-1
          const stack=p.slots[slot]
          if(!stack||!isGrocery(stack.item)||stack.item!==data.item)fail(409,'Select food from your inventory')
          if(p.bite)fail(409,'Finish eating first')
          p.bite={item:stack.item,ends:now+BITE_MS}
          if(--stack.count===0)p.slots[slot]=null
          mirrorFood(a)
        }else if(op==='fire'||op==='reload'){
          const id=typeof data.slot==='number'&&Number.isInteger(data.slot)?p.slots[data.slot]?.item:undefined
          if(!isWeapon(id))fail(409,'Select a carried weapon')
          const weapon=WEAPONS[id],magazines=p.magazines??={}
          const magazine=magazines[id]??={rounds:weapon.magazine,readyAt:0}
          if(now<magazine.readyAt)fail(409,'Reloading')
          if(op==='reload'){
            if(magazine.rounds===weapon.magazine)fail(409,'Magazine is full')
            magazine.rounds=weapon.magazine;magazine.readyAt=now+weapon.reload
            p.sequence++
            return {p,drops,health}
          }
          if(now<(p.nextShot??(p.lastShot??-Infinity)+WEAPONS.blaster.delay))fail(409,'Weapon recharging')
          if(!magazine.rounds)fail(409,'Reload your weapon')
          const t=targets.find(c=>c.id===data.target&&actorDistance(observer,c)<=weapon.range&&canTarget(c))
          if(data.target&&!t)fail(409,'Target is out of sight or range')
          magazine.rounds--;p.nextShot=now+weapon.delay
          p.lastShot=now;p.lastHit=!!t
          p.wantedReason??='Firing a weapon in the city'
          advance(p,1)
          if(t?.kind==='player'){
            const victim=tx.users.get(t.label)!,vp=pack(victim)
            vp.hp=Math.max(0,vp.hp-weapon.damage)
            if(!vp.hp){
              const items=vp.slots.filter((i):i is Stack=>!!i)
              if(items.length){
                drops.push({id:randomUUID(),items,x:t.x,z:t.z,zone:t.zone})
                if(s.shard>1)tx.putMetadata('dropDistricts',[...new Set([...tx.metadata<number[]>('dropDistricts')??[],s.shard])])
              }
              vp.slots=vp.slots.map(()=>null);vp.hp=MAX_HP;vp.sequence++;mirrorFood(victim)
              if(victim.cave)victim.cave.active=false
              respawn=t.label;p.wantedReason='Defeating a player';advance(p,1);tx.putMetadata(dropKey,drops)
            }
          }else if(t){
            const n=health[t.id]??={hp:MAX_HP,returns:0}
            if(n.returns>now)fail(409,'Target is recovering')
            if(!n.hp)n.hp=MAX_HP
            n.hp=Math.max(0,n.hp-weapon.damage)
            if(!n.hp){n.returns=now+30000;p.wantedReason='Defeating a city character';advance(p,1)}
            tx.putMetadata(npcKey,health)
          }
        }else if(op==='pickup'){
          const i=drops.findIndex(d=>d.id===data.target&&d.zone===me.zone&&near(me,d.x,d.z,1.85))
          if(i<0)fail(409,'Move closer to an available drop')
          for(const item of drops[i].items)carry(p,item.item,item.count)
          drops.splice(i,1);tx.putMetadata(dropKey,drops);mirrorFood(a)
        }else transfer(a,op,data.item as Item,quantity(data.amount??1),s.bank,s.shop,s.drawer,now,data.payment)
        p.sequence++
      }
      return {p,drops,health}
    })
    const booked=this.pursue(s,p,now)
    const search=this.searches.get(me.name)
    // A raid has its own write transaction after the encounter.
    if(search?.raidAt===now&&search.cursor)Object.assign(p,this.store.cityPack(me.name))
    const armed=p.slots.some(slot=>isWeapon(slot?.item))
    const contacts:Contact[]=[]
    for(const t of [...this.staff(now),...patrols(),...civilians]){
      if(me.zone==='private'||t.zone==='private'||health[t.id]?.returns>now||!near(me,t.x,t.z,36))continue
      const distance=actorDistance(observer,t)
      if(distance>36)continue
      const hp=t.kind==='player'?this.store.cityStats(t.label)?.hp:health[t.id]?.hp
      contacts.push({...t,distance,inSight:armed&&distance<=longestRange&&canTarget(t),hp:hp??MAX_HP})
    }
    if(p.stars===5&&search){const lead=search.units[0];contacts.push({...lead,id:'heli',label:'Police helicopter',kind:'helicopter',hp:100},{...lead,x:lead.x+.8,id:'dog',label:'Dog team',kind:'dog',hp:100})}
    const view:ArcadeView={bite:p.bite,magazines:p.magazines,lastShot:p.lastShot,lastHit:p.lastHit,sequence:p.sequence,slots:p.slots,hp:p.hp,stars:p.stars,remaining:p.remaining,contacts,
      drops:drops.filter(d=>d.zone===me.zone&&near(me,d.x,d.z,28)).map(({id,x,z})=>({id,x,z})),
      recoveringStaff:Object.keys(health).filter(id=>id.startsWith('staff:')&&health[id].returns>now),
      drawer:s.drawer?p.drawers[s.drawer]??[]:undefined,recovery:s.bank?p.recovery:undefined,warning:search?.warning,searches:search?.searched.slice(-4),custody:booked&&custodyView(booked)}
    return {view,respawn,health}
  }
}
