import {settlePrisonDue,setPrisonTerm} from './prison-company.ts'
import {confined} from '../src/world/civic-venues.ts'
import {debit} from './resort-ledger.ts'
import {COMPANIES,cashUnits,companies,journal,saveCompanies,type Companies} from './corporate.ts'
import {notify} from './accounts.ts'
import {randomInt,randomUUID} from 'node:crypto'
import {alias,CELL_COUNT,cellPosition,JAIL_MINUTES,PUZZLE_SIZE,type BailListing,type CustodyView} from '../src/world/arcade.ts'
import type {ChessStore,UnitOfWork} from './storage.ts'
import {pack} from './city-inventory.ts'
import {fail} from './http.ts'

type Booking=CustodyView&{user:string;avatar:string;id:string;reason:string;minutes:number}
export type Puzzle={tiles:number[];placed:boolean[]}
const KEY='meridianBookings'
// Translate offsets from the original off-map cell centres under one SQLite writer lock.
export function migratePrecinct(tx:UnitOfWork){
  const entries=tx.metadata<Booking[]>(KEY)??[]
  let changed=false
  const now=Date.now()
  const terms=entries.some(b=>!b.id&&b.ends!==null&&b.ends>now)?tx.metadata<Companies>(COMPANIES)?.PRI?.terms:undefined
  for(const b of entries){
    if(!b.id&&(b.ends===null||b.ends>now)){
      b.id=randomUUID()
      b.reason=b.ends===null?'Moderation order':'City arrest · original charge unrecorded'
      const term=terms?.find(t=>t.user===b.user&&t.end===b.ends)
      b.minutes=b.ends===null?0:Math.max(1,Math.ceil((b.ends-(term?.start??now))/60000))
      changed=true
    }
    if(!(b.x>190))continue
    const oldX=210+(b.cell%2?-4.2:4.2),oldZ=-6-Math.floor((b.cell-1)/2)*3.2
    const center=cellPosition(b.cell)
    Object.assign(b,confined(b.cell,center.x+b.x-oldX,center.z+b.z-oldZ))
    changed=true
  }
  if(changed)tx.putMetadata(KEY,entries)
}
export function roster(store:ChessStore,now:number):Booking[]{
  const list=(store.metadataValue(KEY)??[]) as Booking[]
  return list.filter(b=>b.ends===null||b.ends>now)
}
export function custodyView(b:Booking):CustodyView{
  const {cell,name,ends,noRelease,x,z,yaw}=b
  return {cell,name,ends,noRelease,x,z,yaw}
}
export function book(tx:UnitOfWork,user:string,stars:number,now:number,permanent=false,noRelease=false){
  const account=tx.users.get(user)??fail(404,'Player not found')
  settlePrisonDue(tx,now)
  const list=(tx.metadata<Booking[]>(KEY)??[]).filter(b=>b.ends===null||b.ends>now)
  let b=list.find(b=>b.user===user)
  if(b&&!permanent)return b
  if(!b){
    const cell=Array.from({length:CELL_COUNT},(_,i)=>i+1).find(n=>!list.some(b=>b.cell===n))
    if(!cell)return
    b={user,id:'',reason:'',minutes:0,cell,name:alias(cell),avatar:account.wallet?.loadout.icon??'default',ends:null,noRelease:false,...cellPosition(cell)}
    list.push(b)
  }
  if(!permanent&&(!Number.isInteger(stars)||stars<1||stars>5))fail(400,'Invalid wanted level')
  const p=pack(account)
  b.id=randomUUID()
  b.reason=permanent?'Moderation order':(p.wantedReason??'City arrest')+' · '+stars+'-star wanted level'
  b.minutes=permanent?0:JAIL_MINUTES[stars]
  b.ends=permanent?null:now+JAIL_MINUTES[stars]*60000;b.noRelease=noRelease
  setPrisonTerm(tx,user,b.ends,now)
  tx.putMetadata(KEY,list)
  p.stars=0;p.remaining=0;delete p.wantedReason
  if(account.cave)account.cave.active=false
  if(permanent&&!account.cellPuzzle){
    const tiles=Array.from({length:PUZZLE_SIZE},(_,i)=>i)
    for(let i=tiles.length-1;i>0;i--){const j=randomInt(i+1);[tiles[i],tiles[j]]=[tiles[j],tiles[i]]}
    account.cellPuzzle={tiles,placed:Array(PUZZLE_SIZE).fill(false)}
  }
  return b
}
export function release(tx:UnitOfWork,user:string,now=Date.now()){
  settlePrisonDue(tx,now)
  const list=tx.metadata<Booking[]>(KEY)??[]
  if(list.some(b=>b.user===user&&(b.ends===null||b.ends>now)))setPrisonTerm(tx,user,now,now)
  tx.putMetadata(KEY,list.filter(b=>b.user!==user))
  const a=tx.users.get(user)
  if(a)delete a.cellPuzzle
}
export function bailListing(b:Booking):BailListing{
  const price=b.noRelease?null:b.ends===null?1000:Math.min(500,Math.max(1,Math.ceil(500*b.minutes/JAIL_MINUTES[5])))
  return {id:b.id,name:b.name,reason:b.reason,ends:b.ends,price}
}

// Use the unique sentence ID. A stale register cannot pay for the next occupant of a cell.
export function payBail(tx:UnitOfWork,payer:string,id:unknown,now:number){
  const active=(tx.metadata<Booking[]>(KEY)??[]).filter(b=>b.ends===null||b.ends>now)
  if(active.some(b=>b.user===payer))fail(423,'In custody at Meridian Police')
  const booking=active.find(b=>typeof id==='string'&&b.id===id)??fail(409,'This sentence is no longer available')
  const {price}=bailListing(booking)
  if(price===null)fail(403,'Only moderation can release this inmate')
  const account=tx.users.get(payer)??fail(401,'Log in first')
  debit(account,price,now)
  release(tx,booking.user,now)
  const e=companies(tx,now),units=cashUnits(price)
  e.PRI.carry+=units
  journal(e.PRI,'Bail income',units,now)
  saveCompanies(tx,e)
  const freed=tx.users.get(booking.user)!
  notify(freed,{kind:'casino',title:'Released on bail',detail:'Your bail was paid at the Meridian booking desk.',code:'PRI'})
}
export function cellMove(tx:UnitOfWork,b:Booking,x:unknown,z:unknown,yaw:unknown){
  if(typeof x!=='number'||typeof z!=='number'||typeof yaw!=='number'||![x,z,yaw].every(Number.isFinite))return
  const list=tx.metadata<Booking[]>(KEY)??[],entry=list.find(e=>e.user===b.user&&e.cell===b.cell)
  if(!entry)return
  const point={...confined(b.cell,x,z),yaw}
  if(entry.x===point.x&&entry.z===point.z&&entry.yaw===yaw)return
  Object.assign(entry,point)
  Object.assign(b,entry)
  tx.putMetadata(KEY,list)
}
export function puzzleAction(tx:UnitOfWork,b:Booking,data?:Record<string,unknown>){
  const current=tx.metadata<Booking[]>(KEY)?.find(entry=>entry.user===b.user&&entry.cell===b.cell)
  const puzzle=tx.users.get(b.user)?.cellPuzzle
  if(!current||current.ends!==null||!puzzle)fail(403,'The puzzle table is reserved for permanent custody')
  if(data){
    const {piece,target}=data
    if(typeof piece!=='number'||!Number.isInteger(piece)||piece<0||piece>=PUZZLE_SIZE||puzzle.tiles[piece]!==target)fail(409,'That piece does not fit there')
    puzzle.placed[piece]=true
    if(!current.noRelease&&puzzle.placed.every(Boolean)){release(tx,b.user);return {released:true}}
  }
  return {puzzle}
}
// Project only identity-bearing fields. Board coordinates, move colors, item IDs,
// and game codes must still work when a player happens to share their spelling.
const identities=new Set(['user','name','owner','holder','seller','buyer','buy','sell','account','opponents','customer','worker','carrier','playerName','voter','byName','leader'])
const prose=new Set(['title','detail','endReason','bio','text','label','activity','description'])
export function publicView(value:unknown,bookings:Booking[]):unknown{
  if(!bookings.length)return value
  const names=new Map(bookings.map(b=>[b.user,b.name]))
  const escaped=[...names.keys()].sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')
  const pattern=new RegExp(String.raw`(?<![\p{L}\p{N}_])(?:${escaped})(?![\p{L}\p{N}_])`,'gu')
  function visit(v:unknown,key:string,resort=false):unknown{
    if(typeof v==='string'){
      if(identities.has(key)||key==='seats'||resort&&(key==='turn'||key==='winner'))return names.get(v)??v
      if(prose.has(key)||resort&&key==='result')return v.replace(pattern,s=>names.get(s)!)
      return v
    }
    if(Array.isArray(v))return v.map(entry=>visit(entry,key,resort))
    if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,item])=>[k,visit(item,key==='seats'?'seats':k,resort||k==='resort')]))
    return v
  }
  return visit(value,'')
}
