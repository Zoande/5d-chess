import type {Bite,Grocery} from './food.ts'

// Keep the first slot's historic item ID so existing hotbars, drawers, drops and bank recovery still work.
export const WEAPONS={
  blaster:{name:'Pistol',model:'pistol',price:25,damage:35,range:8,delay:900,magazine:12,reload:1100},
  smg:{name:'SMG',model:'smg',price:60,damage:15,range:9,delay:190,magazine:24,reload:1450},
  ar:{name:'Assault Rifle',model:'ar',price:95,damage:25,range:13,delay:330,magazine:20,reload:1650},
  shotgun:{name:'Shotgun',model:'shotgun',price:80,damage:58,range:5,delay:1150,magazine:5,reload:1750},
  sniper:{name:'Sniper Rifle',model:'sniper',price:140,damage:72,range:19,delay:1550,magazine:4,reload:2100},
} as const
export type WeaponId=keyof typeof WEAPONS
export const weaponIds=Object.keys(WEAPONS) as WeaponId[]
export function isWeapon(value:unknown):value is WeaponId{return typeof value==='string'&&Object.hasOwn(WEAPONS,value)}
export type Magazine={rounds:number;readyAt:number}
export type Item = Grocery | 'cash' | WeaponId
export type Stack = {item:Item; count:number}
export type ArmoryPayment='cash'|'bank'
export function armoryQuote(slots:readonly (Stack|null)[],coins:number,id:WeaponId,payment:ArmoryPayment){
  const price=WEAPONS[id].price
  const cash=slots.reduce((sum,s)=>sum+(s?.item==='cash'?s.count:0),0)
  // Spending the last cash in an occupied slot makes it available for the item.
  let remaining=payment==='cash'?price:0
  const slot=slots.findIndex(s=>{
    if(!s)return true
    if(s.item!=='cash'||!remaining)return false
    const used=Math.min(remaining,s.count);remaining-=used
    return used===s.count
  })
  const balance=payment==='cash'?cash:coins
  return {cash,slot,shortfall:Math.max(0,price-balance)}
}
export const SLOT_COUNT=9
export const MAX_HP=100
export const CLEAR_MINUTES=[0,10,20,40,60,90]
export const JAIL_MINUTES=[0,2,10,60,360,1440]
export const CELL_COUNT=50
export const PUZZLE_SIZE=1000
export const alias=(cell:number)=>'Inmate '+String(cell).padStart(2,'0')
export {entrances,origins,venue,venueWalk,cellPosition,type Venue} from './civic-venues.ts'
export interface BailListing {id:string;name:string;reason:string;ends:number|null;price:number|null}
export interface CustodyView {cell:number;name:string;ends:number|null;noRelease:boolean;x:number;z:number;yaw:number}
export interface Contact {height?:number;distance?:number;inSight?:boolean;id:string;label:string;x:number;z:number;zone:string;hp?:number;kind:'officer'|'dog'|'helicopter'|'resident'|'player'}
export interface ArcadeView {
  bite?:Bite
  sequence:number;slots:(Stack|null)[];hp:number;stars:number;remaining:number;contacts:Contact[]
  magazines?:Partial<Record<WeaponId,Magazine>>;lastShot?:number;lastHit?:boolean
  register?:string[];bailRegister?:BailListing[];recoveringStaff?:string[];drawer?:Stack[];recovery?:Stack[];drops:{id:string;x:number;z:number}[];warning?:string;searches?:string[];custody?:CustodyView
}
