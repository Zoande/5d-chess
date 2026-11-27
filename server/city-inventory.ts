import type {Account} from './accounts.ts'
import {wallet} from './economy.ts'
import {requireSpending} from './credit.ts'
import {GROCERIES,isGrocery,type Bite,type Pantry} from '../src/world/food.ts'
import {blankOrder} from '../src/world/restaurant-model.ts'
import {armoryQuote,MAX_HP,isWeapon,WEAPONS,type Magazine,type WeaponId,SLOT_COUNT,type Item,type Stack} from '../src/world/arcade.ts'
import {toStockUnits,fromStockUnits} from '../src/stock-model.ts'
import {fail} from './http.ts'

export interface Pack {
  bite?:Bite
  slots:(Stack|null)[]; hp:number; drawers:Record<string,Stack[]>; recovery:Stack[]
  magazines?:Partial<Record<WeaponId,Magazine>>;nextShot?:number
  sequence:number;lastShot?:number;lastHit?:boolean;wantedReason?:string;stars:number;remaining:number
}
export const foodItem=isGrocery
const limit=(item:Item)=>item==='cash'?Number.MAX_SAFE_INTEGER:isWeapon(item)?1:9
export function quantity(value:unknown):number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0)fail(400,'Choose a positive whole quantity')
  return value
}
function fill(slots:Pack['slots'],item:Item,count:number){
  for(const stack of slots){
    if(stack?.item!==item)continue
    const add=Math.min(count,limit(item)-stack.count)
    count-=add;stack.count+=add
    if(!count)return 0
  }
  if(item==='cash'&&slots.some(s=>s?.item==='cash'))return count
  for(let i=0;i<slots.length&&count;i++){
    if(slots[i])continue
    const add=Math.min(count,limit(item))
    slots[i]={item,count:add};count-=add
  }
  return count
}
export function stash(stacks:Stack[],item:Item,count:number){
  const existing=stacks.find(s=>s.item===item)
  if(existing){if(!Number.isSafeInteger(existing.count+count))fail(409,'Storage limit reached');existing.count+=count}
  else stacks.push({item,count})
}
export function pack(a:Account):Pack {
  if(a.cityPack)return a.cityPack
  const p:Pack={slots:Array(SLOT_COUNT).fill(null),hp:MAX_HP,drawers:{},recovery:[],stars:0,remaining:0,sequence:0}
  a.cityPack=p
  for(const {id} of GROCERIES){
    const amount=a.food?.[id]??0
    if(amount)recover(p,id,amount)
  }
  mirrorFood(a)
  return p
}
export function recover(p:Pack,item:Item,count:number){
  const left=fill(p.slots,item,count)
  if(left)stash(p.recovery,item,left)
}
export function releaseDrawer(p:Pack,id:string){
  const contents=p.drawers[id]
  if(!contents)return
  for(const stack of contents)stash(p.recovery,stack.item,stack.count)
  delete p.drawers[id]
  p.sequence++
}
export function releaseFridge(a:Account,id:string){
  const contents=a.fridges?.[id]
  if(!contents)return
  const p=pack(a)
  for(const {id:item} of GROCERIES)if(contents[item])recover(p,item,contents[item]!)
  delete a.fridges![id]
  mirrorFood(a)
  p.sequence++
}
export function carry(p:Pack,item:Item,count:number){
  if(fill(p.slots,item,quantity(count)))fail(409,'Your nine slots cannot hold that quantity')
}
export function remove(p:Pack,item:Item,count:number){
  let left=quantity(count)
  for(const [i,s] of p.slots.entries()){
    if(s?.item!==item)continue
    const used=Math.min(left,s.count)
    s.count-=used;left-=used
    if(!s.count)p.slots[i]=null
    if(!left)return
  }
  fail(409,'Choose an available quantity')
}
// Compatibility projection for pre-expansion readers. Gameplay always reads the slots.
export function mirrorFood(a:Account){
  const food:Pantry=blankOrder()
  for(const s of pack(a).slots)if(s&&foodItem(s.item))food[s.item]=(food[s.item]??0)+s.count
  a.food=food
  return food
}
export function heal(a:Account,amount:number){const p=pack(a);p.hp=Math.min(MAX_HP,p.hp+amount)}
export function transfer(a:Account,operation:unknown,item:Item,amount:number,atBank:boolean,atShop:boolean,drawer:string|undefined,now:number,payment:unknown='cash'){
  const p=pack(a)
  if(operation==='withdraw'||operation==='deposit'){
    if(!atBank)fail(409,'Visit the city cash counter')
    const w=wallet(a),units=toStockUnits(w.coins),delta=toStockUnits(amount)
    if(!Number.isSafeInteger(delta))fail(400,'Amount exceeds the wallet limit')
    if(operation==='withdraw'){
      requireSpending(a,now)
      if(units<delta)fail(409,'Insufficient bank balance')
      carry(p,'cash',amount);w.coins=fromStockUnits(units-delta)
    }else{
      if(!Number.isSafeInteger(units+delta))fail(409,'Wallet limit reached')
      remove(p,'cash',amount);w.coins=fromStockUnits(units+delta)
    }
  }else if(operation==='buy'){
    if(!atShop)fail(409,'Visit the arcade gun shop')
    requireSpending(a,now)
    const id=item===undefined?'blaster':item
    if(!isWeapon(id))fail(400,'Choose a weapon on the rack')
    if(payment!=='cash'&&payment!=='bank')fail(400,'Choose carried cash or banked coins')
    if(amount!==1)fail(400,'Choose one item per purchase')
    const w=wallet(a),price=WEAPONS[id].price
    const quote=armoryQuote(p.slots,w.coins,id,payment)
    if(quote.shortfall)fail(409,payment==='cash'?'Not enough carried cash. Choose banked coins or withdraw cash at the bank.':'Not enough banked coins for this purchase.')
    if(quote.slot<0)fail(409,'Free a hotbar slot before buying this item.')
    if(payment==='cash')remove(p,'cash',price)
    else w.coins=fromStockUnits(toStockUnits(w.coins)-toStockUnits(price))
    carry(p,id,1)
  }else if(operation==='recover'||operation==='take'||operation==='store'){
    if(operation==='recover'?!atBank:!drawer)fail(403,'Open the appropriate storage first')
    if(operation!=='recover'&&foodItem(item))fail(409,'Food belongs in the refrigerator')
    const stacks=operation==='recover'?p.recovery:(p.drawers[drawer!]??=[])
    if(operation==='store'){remove(p,item,amount);stash(stacks,item,amount)}
    else{
      const index=stacks.findIndex(s=>s.item===item&&s.count>=amount)
      if(index<0)fail(409,'Choose an available quantity')
      carry(p,item,amount);stacks[index].count-=amount
      if(!stacks[index].count)stacks.splice(index,1)
    }
  }else fail(400,'Unknown inventory action')
  mirrorFood(a)
}
