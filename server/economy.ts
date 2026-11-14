import {randomBytes,randomInt} from 'node:crypto'
import {type Wallet,type Drop,type Listing,type Collectible,type ItemType,ITEMS,CRATES,CRATE_ODDS,RARITIES,SPIN_REWARDS,dayKey,nextReset,nextWeek,weeklyItems,itemById,duplicateRefund} from '../src/collection.ts'
import {KINDS,type Kind} from '../src/model.ts'
export interface EconomicAccount {name:string;wallet?:Wallet;receipts?:{key:string;drop:Drop}[]}
export const uid=()=>randomBytes(12).toString('hex')
const reject=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status})}
export function wallet(account:EconomicAccount):Wallet{return account.wallet??={coins:0,inventory:[],loadout:{icon:'default',pieces:{}}}}
export function weightedIndex(weights:readonly number[],ticket=randomInt(weights.reduce((a,b)=>a+b,0))){if(!Number.isInteger(ticket)||ticket<0||ticket>=weights.reduce((a,b)=>a+b,0))throw new Error('Invalid draw');for(let i=0;i<weights.length;i++){ticket-=weights[i];if(ticket<0)return i}throw new Error('Invalid weights')}
export function grant(account:EconomicAccount,item:Collectible,source:Drop['source'],now=Date.now()):Drop{
 const w=wallet(account),duplicate=w.inventory.some(x=>x.itemId===item.id),id=uid()
 w.inventory.push({uid:id,itemId:item.id,acquired:now,pending:duplicate})
 return {id:uid(),source,uid:id,itemId:item.id,duplicate,refund:duplicate?duplicateRefund(item):undefined,created:now}
}
function spend(account:EconomicAccount,price:number){const w=wallet(account);if(w.coins<price)reject(409,'Not enough coins');w.coins-=price}
export function spin(account:EconomicAccount,now=Date.now()):Drop{
 const w=wallet(account);if(w.inventory.length>=5000)reject(409,'Inventory is full');if(w.lastSpin===dayKey(now))reject(409,'You have already spun today')
 const index=weightedIndex(SPIN_REWARDS.map(r=>r.weight)),reward=SPIN_REWARDS[index]
 let drop:Drop
 if('coins'in reward&&reward.coins){drop={id:uid(),source:'spin',coins:reward.coins,created:now};w.coins+=reward.coins}
 else{const pool=ITEMS.filter(i=>i.rarity===reward.rarity);drop=grant(account,pool[randomInt(pool.length)],'spin',now)}
 w.lastSpin=dayKey(now);drop.segment=index;return drop
}
export function buyCrate(account:EconomicAccount,crateId:unknown,now=Date.now()):Drop{
 const crate=CRATES.find(c=>c.id===crateId)??reject(400,'Unknown crate')
 if(wallet(account).inventory.length>=5000)reject(409,'Inventory is full')
 const rarity=RARITIES[weightedIndex(CRATE_ODDS[crate.tier])],pool=ITEMS.filter(i=>i.type===crate.type&&i.rarity===rarity)
 spend(account,crate.price);return grant(account,pool[randomInt(pool.length)],'crate',now)
}
export function buyFeatured(account:EconomicAccount,itemId:unknown,now=Date.now()){
 const item=weeklyItems(now).find(i=>i.id===itemId)??reject(409,'This item is not in this week’s shop')
 if(wallet(account).inventory.length>=5000)reject(409,'Inventory is full')
 spend(account,item.price);const drop=grant(account,item,'crate',now);const owned=wallet(account).inventory.find(i=>i.uid===drop.uid)!;owned.pending=false;return drop
}
export function resolveDuplicate(account:EconomicAccount,id:unknown,refund:unknown){
 if(typeof refund!=='boolean')reject(400,'Choose keep or refund')
 const w=wallet(account),owned=w.inventory.find(i=>i.uid===id)??reject(404,'Item not found')
 if(!owned.pending)reject(409,'This item has already been kept or refunded')
 if(refund){w.coins+=duplicateRefund(itemById(owned.itemId)!);w.inventory=w.inventory.filter(i=>i!==owned)}else owned.pending=false
}
export function equip(account:EconomicAccount,slot:unknown,id:unknown){
 const w=wallet(account)
 if(slot!=='icon'&&!KINDS.includes(slot as Kind))reject(400,'Unknown equipment slot')
 if(id==='default'){if(slot==='icon')w.loadout.icon='default';else delete w.loadout.pieces[slot as Kind];return}
 const owned=w.inventory.find(i=>i.uid===id)??reject(404,'Item not found')
 if(owned.listed||owned.pending)reject(409,'Keep this item or cancel its listing before equipping it')
 const item=itemById(owned.itemId)!
 if(item.type!==(slot==='icon'?'icon':'skin'))reject(400,'This item cannot be equipped in that slot')
 if(slot==='icon')w.loadout.icon=owned.itemId;else w.loadout.pieces[slot as Kind]=owned.itemId
}
function unequipIfMissing(w:Wallet,itemId:string){if(w.inventory.some(i=>i.itemId===itemId&&!i.listed&&!i.pending))return;if(w.loadout.icon===itemId)w.loadout.icon='default';for(const k of KINDS)if(w.loadout.pieces[k]===itemId)delete w.loadout.pieces[k]}
export function listItem(account:EconomicAccount,listings:Listing[],id:unknown,price:unknown,now=Date.now()){
 if(typeof price!=='number'||!Number.isSafeInteger(price)||price<1||price>100000000)reject(400,'Price must be a whole number from 1 to 100,000,000')
 if(listings.filter(l=>l.seller===account.name).length>=100)reject(409,'You can have up to 100 active listings')
 const w=wallet(account),owned=w.inventory.find(i=>i.uid===id)??reject(404,'Item not found')
 if(owned.listed||owned.pending)reject(409,'This item is already listed or awaiting your duplicate choice')
 const listing:Listing={id:uid(),seller:account.name,uid:owned.uid,itemId:owned.itemId,price:price as number,created:now}
 owned.listed=listing.id;unequipIfMissing(w,owned.itemId);listings.push(listing);return listing
}
export function cancelListing(account:EconomicAccount,listings:Listing[],id:unknown){const listing=listings.find(l=>l.id===id&&l.seller===account.name)??reject(404,'Listing not found');const owned=wallet(account).inventory.find(i=>i.uid===listing.uid);if(owned)delete owned.listed;listings.splice(listings.indexOf(listing),1)}
export function buyListing(buyer:EconomicAccount,accounts:EconomicAccount[],listings:Listing[],id:unknown,now=Date.now()){
 const listing=listings.find(l=>l.id===id)??reject(409,'This listing is no longer available')
 if(listing.seller===buyer.name)reject(400,'You cannot buy your own listing')
 const seller=accounts.find(a=>a.name===listing.seller)??reject(409,'Seller unavailable'),sw=wallet(seller),bw=wallet(buyer)
 const owned=sw.inventory.find(i=>i.uid===listing.uid&&i.listed===listing.id)??reject(409,'Item unavailable')
 if(bw.inventory.length>=5000)reject(409,'Inventory is full')
 spend(buyer,listing.price);sw.coins+=listing.price;sw.inventory.splice(sw.inventory.indexOf(owned),1)
 bw.inventory.push({...owned,acquired:now,pending:false,listed:undefined});listings.splice(listings.indexOf(listing),1)
}
/** POST retries use one stable key. The last 100 receipts survive restarts. */
export function purchase(account:EconomicAccount,key:unknown,action:()=>Drop){
 if(typeof key!=='string'||! /^[a-zA-Z0-9-]{12,80}$/.test(key))reject(400,'A purchase request ID is required')
 account.receipts??=[]
 const old=account.receipts.find(r=>r.key===key);if(old)return old.drop
 const drop=action();account.receipts.unshift({key:key as string,drop});account.receipts.length=Math.min(100,account.receipts.length);return drop
}
export function economyView(account:EconomicAccount,now=Date.now()){const w=wallet(account);return {wallet:structuredClone(w),spinReady:w.lastSpin!==dayKey(now),reset:nextReset(now),rotation:nextWeek(now),featured:weeklyItems(now).map(i=>i.id),now,recent:(account.receipts??[]).slice(0,10).map(r=>r.drop)}}
