import {randomBytes,randomInt} from 'node:crypto'
import {type Wallet,type Drop,type Listing,type Collectible,type ItemType,STARTER_COINS,MARKET_DESCRIPTION_LIMIT,PAID_SPIN_PRICE,ITEMS,GENERAL_ITEMS,CRATES,crateTickets,caseOffers,seasonalItems,setById,setRequirements,planSet,covers,type CosmeticSet,monthKey,nextMonth,CRATE_ODDS,RARITIES,SPIN_REWARDS,spinRewards,dailyDeals,dayKey,nextReset,nextWeek,weeklyItems,itemById,duplicateRefund} from '../src/collection.ts'
import {KINDS,type Kind} from '../src/model.ts'
export interface EconomicAccount {name:string;wallet?:Wallet;marketRequests?:{requestId:string;listing:Listing}[];receipts?:{key:string;drop:Drop}[]}
export const uid=()=>randomBytes(12).toString('hex')
const reject=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status})}
export function wallet(account:EconomicAccount):Wallet{
 const w=account.wallet??={coins:0,inventory:[],loadout:{icon:'default',pieces:{}}}
 if(!w.starterGranted){w.coins+=STARTER_COINS;w.starterGranted=true}
 return w
}
export function weightedIndex(weights:readonly number[],ticket=randomInt(weights.reduce((a,b)=>a+b,0))){if(!Number.isInteger(ticket)||ticket<0||ticket>=weights.reduce((a,b)=>a+b,0))throw new Error('Invalid draw');for(let i=0;i<weights.length;i++){ticket-=weights[i];if(ticket<0)return i}throw new Error('Invalid weights')}
export function grant(account:EconomicAccount,item:Collectible,source:Drop['source'],now=Date.now(),kind?:Kind):Drop{
 const w=wallet(account),duplicate=w.inventory.some(x=>covers(x,item.id,kind)),id=uid()
 w.inventory.push({uid:id,itemId:item.id,kind,acquired:now,pending:duplicate})
 return {id:uid(),source,uid:id,itemId:item.id,kind,duplicate,refund:duplicate?duplicateRefund(item):undefined,created:now}
}
function spend(account:EconomicAccount,price:number){const w=wallet(account);if(w.coins<price)reject(409,'Not enough coins');w.coins-=price}
export function spin(account:EconomicAccount,now=Date.now(),paid=false,expectedDay?:unknown):Drop{
 const w=wallet(account);if(w.inventory.length>=5000||(w.cases?.length??0)>=500)reject(409,'Inventory is full')
 if(expectedDay!==undefined&&expectedDay!==dayKey(now))reject(409,'The wheel has changed. Review today’s rewards before spinning.')
 if(paid){if(w.lastSpin!==dayKey(now))reject(409,'Claim your free daily spin first');if(w.coins<PAID_SPIN_PRICE)reject(409,'Not enough coins')}else if(w.lastSpin===dayKey(now))reject(409,'You have already spun today')
 const rewards=spinRewards(now),index=weightedIndex(rewards.map(r=>r.weight)),reward=rewards[index]
 const set=reward.setId?setById(reward.setId):undefined;if(set&&w.inventory.length+setRequirements(set).length>5000)reject(409,'Inventory is full')
 if(paid)spend(account,PAID_SPIN_PRICE)
 let drop:Drop
 if(reward.coins){drop={id:uid(),source:'spin',coins:reward.coins,created:now};w.coins+=reward.coins}
 else if(reward.caseId){const id=uid();(w.cases??=[]).push({uid:id,caseId:reward.caseId,acquired:now});drop={id:uid(),source:'spin',caseId:reward.caseId,caseUid:id,created:now}}
 else if(set){drop=grantSet(account,set,now);drop.source='spin'}
 else{const pool=reward.itemId?[itemById(reward.itemId)!]:GENERAL_ITEMS.filter(i=>i.rarity===reward.rarity);drop=grantUnit(account,pool[randomInt(pool.length)],'spin',now)}
 if(!paid)w.lastSpin=dayKey(now);drop.paid=paid;drop.segment=index;drop.wheel=rewards;return drop
}
export function openOwnedCase(account:EconomicAccount,caseUid:unknown,now=Date.now()):Drop{
 const w=wallet(account),owned=w.cases?.find(c=>c.uid===caseUid)??reject(409,'This case is no longer available'),c=CRATES.find(c=>c.id===owned.caseId)??reject(409,'Unknown case')
 const tickets=crateTickets(c),t=tickets[weightedIndex(tickets.map(t=>t.weight))],set=t.setId?setById(t.setId):undefined
 if(w.inventory.length+(set?setRequirements(set).length:1)>5000)reject(409,'Inventory is full')
 const drop=set?grantSet(account,set,now):grantUnit(account,t.item,'crate',now);w.cases!.splice(w.cases!.indexOf(owned),1);return drop
}
function grantUnit(account:EconomicAccount,item:Collectible,source:Drop['source'],now:number,kind?:Kind){return grant(account,item,source,now,item.type==='skin'||item.type==='shape'?kind??KINDS[randomInt(KINDS.length)]:undefined)}
export function grantSet(account:EconomicAccount,set:CosmeticSet,now=Date.now()):Drop{
 const requirements=setRequirements(set),w=wallet(account)
 if(w.inventory.length+requirements.length>5000)reject(409,'Inventory is full')
 const items=requirements.map(r=>{const id=uid();w.inventory.push({uid:id,itemId:r.itemId,kind:r.kind,acquired:now,pending:false});return {uid:id,itemId:r.itemId,kind:r.kind}})
 return {id:uid(),source:'crate',uid:items[0].uid,itemId:set.itemId,setId:set.id,items,created:now}
}
export function buyCrate(account:EconomicAccount,crateId:unknown,now=Date.now(),month?:unknown,offerKey?:unknown,expectedPrice?:unknown):Drop{
 const crate=CRATES.find(c=>c.id===crateId)??reject(400,'Unknown case'),offer=caseOffers(now).find(o=>o.id===crate.id)??reject(409,'This case has rotated out. Refresh the shop.')
 if(crate.monthly&&month!==monthKey(now))reject(409,'The seasonal collection has changed. Refresh the shop.')
 if(offerKey!==undefined&&offerKey!==offer.key||expectedPrice!==undefined&&expectedPrice!==offer.price)reject(409,'This case offer has changed. Refresh the shop.')
 const tickets=crateTickets(crate),ticket=tickets[weightedIndex(tickets.map(t=>t.weight))],set=ticket.setId?setById(ticket.setId):undefined,count=set?setRequirements(set).length:1
 if(wallet(account).inventory.length+count>5000)reject(409,'Inventory is full')
 spend(account,offer.price);return set?grantSet(account,set,now):grantUnit(account,ticket.item,'crate',now)
}
export function buyFeatured(account:EconomicAccount,itemId:unknown,now=Date.now(),expectedPrice?:unknown,kind?:unknown){
 const deal=dailyDeals(now).find(d=>d.itemId===itemId),item=(deal?itemById(deal.itemId):weeklyItems(now).find(i=>i.id===itemId)??seasonalItems(now).find(i=>i.id===itemId))??reject(409,'This item is not in this week’s shop or today’s deals')
 if((item.type==='skin'||item.type==='shape')&&kind!==undefined&&!KINDS.includes(kind as Kind))reject(400,'Choose a piece type')
 if(wallet(account).inventory.length>=5000)reject(409,'Inventory is full')
 if(expectedPrice!==undefined&&expectedPrice!==(deal?.price??item.price))reject(409,'This offer has changed. Refresh the shop before buying.')
 spend(account,deal?.price??item.price);const drop=grantUnit(account,item,'crate',now,kind as Kind|undefined);wallet(account).inventory.find(i=>i.uid===drop.uid)!.pending=false;return drop
}
export function buySet(account:EconomicAccount,setId:unknown,now=Date.now()){
 const set=(typeof setId==='string'?setById(setId):undefined)??reject(400,'Unknown Set')
 if(!set?.exclusive)reject(409,'This Set is not a direct shop offer')
 if(wallet(account).inventory.length+setRequirements(set).length>5000)reject(409,'Inventory is full')
 spend(account,set.price);return grantSet(account,set,now)
}
export function resolveDuplicate(account:EconomicAccount,id:unknown,refund:unknown){
 if(typeof refund!=='boolean')reject(400,'Choose keep or refund')
 const w=wallet(account),owned=w.inventory.find(i=>i.uid===id)??reject(404,'Item not found')
 if(!owned.pending)reject(409,'This item has already been kept or refunded')
 if(refund){w.coins+=duplicateRefund(itemById(owned.itemId)!);w.inventory=w.inventory.filter(i=>i!==owned)}else owned.pending=false
}
export function equip(account:EconomicAccount,slot:unknown,id:unknown){
 const w=wallet(account)
 const shapeKind=typeof slot==='string'&&slot.startsWith('shape-')&&KINDS.includes(slot.slice(6) as Kind)?slot.slice(6) as Kind:undefined
 if(slot!=='icon'&&slot!=='frame'&&slot!=='shape'&&!shapeKind&&!KINDS.includes(slot as Kind))reject(400,'Unknown equipment slot')
 if(shapeKind){
  if(id==='default'){(w.loadout.shapes??={})[shapeKind]='default';return}
  const owned=w.inventory.find(i=>i.uid===id)??reject(404,'Item not found')
  if(owned.listed||owned.pending)reject(409,'Keep this item or cancel its listing before equipping it')
  if(owned.kind&&owned.kind!==shapeKind)reject(400,'This outline is for a different piece')
  if(itemById(owned.itemId)?.type!=='shape')reject(400,'This item cannot be equipped in that slot')
  ;(w.loadout.shapes??={})[shapeKind]=owned.itemId;return
 }
 if(id==='default'){if(slot==='icon')w.loadout.icon='default';else if(slot==='frame'||slot==='shape')delete w.loadout[slot];else delete w.loadout.pieces[slot as Kind];return}
 const owned=w.inventory.find(i=>i.uid===id)??reject(404,'Item not found')
 if(owned.listed||owned.pending)reject(409,'Keep this item or cancel its listing before equipping it')
 const item=itemById(owned.itemId)!
 if(owned.kind&&(slot==='shape'||owned.kind!==slot))reject(400,'This cosmetic is for a different piece')
 if(item.type!==(slot==='icon'||slot==='frame'||slot==='shape'?slot:'skin'))reject(400,'This item cannot be equipped in that slot')
 if(slot==='icon'||slot==='frame'||slot==='shape')w.loadout[slot]=owned.itemId;else w.loadout.pieces[slot as Kind]=owned.itemId
}
export function equipLook(account:EconomicAccount,target:unknown,primary:unknown,secondary:unknown){
 if(target!=='icon'&&!KINDS.includes(target as Kind))reject(400,'Unknown equipment target')
 // Validate both layers on a copy before applying either one to the real account.
 const candidate=structuredClone(account)
 equip(candidate,target,primary);equip(candidate,target==='icon'?'frame':`shape-${target}`,secondary)
 wallet(account).loadout=wallet(candidate).loadout
}
function unequipIfMissing(w:Wallet,itemId:string){
 const usable=(kind?:Kind)=>w.inventory.some(i=>covers(i,itemId,kind)&&!i.listed&&!i.pending)
 if(w.loadout.icon===itemId&&!usable())w.loadout.icon='default'
 if(w.loadout.frame===itemId&&!usable())delete w.loadout.frame
 for(const k of KINDS){if(w.loadout.pieces[k]===itemId&&!usable(k))delete w.loadout.pieces[k];if((w.loadout.shapes?.[k]??w.loadout.shape)===itemId&&!usable(k)){if(w.loadout.shape===itemId)(w.loadout.shapes??={})[k]='default';else if(w.loadout.shapes)delete w.loadout.shapes[k]}}
 if(w.loadout.shape===itemId&&!w.inventory.some(i=>i.itemId===itemId&&!i.kind&&!i.listed&&!i.pending)){for(const k of KINDS)if((w.loadout.shapes?.[k]??w.loadout.shape)===itemId&&usable(k))(w.loadout.shapes??={})[k]=itemId;delete w.loadout.shape}
}
export function equipDesign(account:EconomicAccount,itemId:unknown){
 const item=(typeof itemId==='string'?itemById(itemId):undefined)??reject(400,'Unknown design')
 if(!item||!['skin','shape'].includes(item.type))reject(400,'Choose a piece design')
 const w=wallet(account);if(!KINDS.every(k=>w.inventory.some(o=>covers(o,item.id,k)&&!o.listed&&!o.pending)))reject(409,'Collect all six pieces before equipping the whole design')
 for(const k of KINDS){if(item.type==='skin')w.loadout.pieces[k]=item.id;else(w.loadout.shapes??={})[k]=item.id}
}
export function equipCollection(account:EconomicAccount,setId:unknown){const set=(typeof setId==='string'?setById(setId):undefined)??reject(400,'Unknown Set');if(!set||!planSet(wallet(account).inventory,set).complete)reject(409,'Complete this Set before equipping it');for(const id of [set.skinId,set.outlineId])if(id)equipDesign(account,id)}
export function listItem(account:EconomicAccount,listings:Listing[],id:unknown,price:unknown,now=Date.now(),description:unknown=''){
 if(typeof price!=='number'||!Number.isSafeInteger(price)||price<1||price>100000000)reject(400,'Price must be a whole number from 1 to 100,000,000')
 if(typeof description!=='string'||description.length>MARKET_DESCRIPTION_LIMIT||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(description))reject(400,`Description must be plain text of at most ${MARKET_DESCRIPTION_LIMIT} characters`)
 const note=(description as string).replace(/\r\n?/g,'\n').trim()
 if(listings.filter(l=>l.seller===account.name).length>=100)reject(409,'You can have up to 100 active listings')
 const w=wallet(account),owned=w.inventory.find(i=>i.uid===id)??reject(404,'Item not found')
 if(owned.listed||owned.pending)reject(409,'This item is already listed or awaiting your duplicate choice')
 const listing:Listing={id:uid(),seller:account.name,uid:owned.uid,itemId:owned.itemId,kind:owned.kind,price:price as number,created:now,...(note?{description:note}:{})}
 owned.listed=listing.id;unequipIfMissing(w,owned.itemId);listings.push(listing);return listing
}
export function listSet(account:EconomicAccount,listings:Listing[],setId:unknown,price:unknown,description:unknown,requestId:unknown,now=Date.now()){
 if(typeof requestId!=='string'||! /^[a-zA-Z0-9-]{12,80}$/.test(requestId))reject(400,'A Set listing request ID is required')
 const old=account.marketRequests?.find(r=>r.requestId===requestId)
 if(old){if(old.listing.setId!==setId||old.listing.price!==price||old.listing.description!==(typeof description==='string'&&description.trim()?description.trim():undefined))reject(409,'This request ID belongs to a different listing');return old.listing}
 const set=(typeof setId==='string'?setById(setId):undefined)??reject(400,'Unknown Set');if(!set)reject(400,'Unknown Set')
 const plan=planSet(wallet(account).inventory,set);if(!plan.complete)reject(409,'Collect every required piece before selling this Set')
 const listing=listItem(account,listings,plan.uids[0],price,now,description);listing.setId=set.id;listing.uids=plan.uids
 for(const id of plan.uids){const owned=wallet(account).inventory.find(o=>o.uid===id)!;owned.listed=listing.id;unequipIfMissing(wallet(account),owned.itemId)}
 account.marketRequests??=[];account.marketRequests.unshift({requestId:requestId as string,listing:structuredClone(listing)});account.marketRequests.length=Math.min(100,account.marketRequests.length);return listing
}
export function cancelListing(account:EconomicAccount,listings:Listing[],id:unknown){const listing=listings.find(l=>l.id===id&&l.seller===account.name)??reject(404,'Listing not found');for(const owned of wallet(account).inventory)if(owned.listed===listing.id)delete owned.listed;listings.splice(listings.indexOf(listing),1)}
export function buyListing(buyer:EconomicAccount,accounts:EconomicAccount[],listings:Listing[],id:unknown,now=Date.now()){
 const listing=listings.find(l=>l.id===id)??reject(409,'This listing is no longer available')
 if(listing.seller===buyer.name)reject(400,'You cannot buy your own listing')
 const seller=accounts.find(a=>a.name===listing.seller)??reject(409,'Seller unavailable'),sw=wallet(seller),bw=wallet(buyer),ids=listing.uids??[listing.uid]
 if(!ids.length||new Set(ids).size!==ids.length)reject(409,'Invalid listing members')
 const members=ids.map(id=>sw.inventory.find(i=>i.uid===id&&i.listed===listing.id));if(members.some(i=>!i))reject(409,'Item unavailable')
 if(bw.inventory.length+members.length>5000)reject(409,'Inventory is full')
 spend(buyer,listing.price);sw.coins+=listing.price
 for(const owned of members){sw.inventory.splice(sw.inventory.indexOf(owned!),1);bw.inventory.push({...owned!,acquired:now,pending:false,listed:undefined})}
 listings.splice(listings.indexOf(listing),1)
}
/** POST retries use one stable key. The last 100 receipts survive restarts. */
export function purchase(account:EconomicAccount,key:unknown,action:()=>Drop){
 if(typeof key!=='string'||! /^[a-zA-Z0-9-]{12,80}$/.test(key))reject(400,'A purchase request ID is required')
 account.receipts??=[]
 const old=account.receipts.find(r=>r.key===key);if(old)return old.drop
 const drop=action();account.receipts.unshift({key:key as string,drop});account.receipts.length=Math.min(100,account.receipts.length);return drop
}
export function economyView(account:EconomicAccount,now=Date.now()){const w=wallet(account);return {month:monthKey(now),monthlyReset:nextMonth(now),paidSpinPrice:PAID_SPIN_PRICE,wallet:structuredClone(w),spinReady:w.lastSpin!==dayKey(now),reset:nextReset(now),rotation:nextWeek(now),spinRewards:spinRewards(now),spinDay:dayKey(now),caseOffers:caseOffers(now),seasonalItems:seasonalItems(now).map(i=>i.id),featured:weeklyItems(now).map(i=>i.id),dailyDeals:dailyDeals(now),now,recent:(account.receipts??[]).slice(0,10).map(r=>r.drop)}}
