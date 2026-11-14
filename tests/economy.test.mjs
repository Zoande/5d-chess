import test from 'node:test'
import assert from 'node:assert/strict'
import {ITEMS,RARITIES,CRATE_ODDS,SPIN_REWARDS,dayKey,nextReset,weekKey,nextWeek,weeklyItems} from '../src/collection.ts'
import {wallet,weightedIndex,grant,spin,buyCrate,buyFeatured,resolveDuplicate,equip,listItem,buyListing,cancelListing,purchase} from '../server/economy.ts'
const user=name=>({name})
test('catalog contains 20 items of each kind, four legendary and one mythic; odds are exact',()=>{
 for(const type of ['icon','skin']){const items=ITEMS.filter(i=>i.type===type);assert.equal(items.length,20);assert.equal(items.filter(i=>i.rarity==='legendary').length,4);assert.equal(items.filter(i=>i.rarity==='mythic').length,1);for(const r of RARITIES)assert.ok(items.some(i=>i.rarity===r))}
 for(const odds of [...CRATE_ODDS,SPIN_REWARDS.map(r=>r.weight)]){assert.equal(odds.reduce((a,b)=>a+b),1000000);let boundary=0;for(let i=0;i<odds.length;i++){assert.equal(weightedIndex(odds,boundary),i);boundary+=odds[i];assert.equal(weightedIndex(odds,boundary-1),i)}}
})
test('Dutch daily and weekly resets handle spring and autumn daylight saving',()=>{
 assert.equal(dayKey(Date.parse('2026-01-01T23:30:00Z')),'2026-01-02')
 const spring=Date.parse('2026-03-28T23:00:00Z'),autumn=Date.parse('2026-10-24T22:00:00Z')
 assert.equal(nextReset(spring)-spring,23*3600000);assert.equal(nextReset(autumn)-autumn,25*3600000)
 assert.equal(weekKey(Date.parse('2026-11-15T23:30:00Z')),'2026-11-16')
 assert.equal(new Date(nextWeek(Date.parse('2026-11-14T12:00:00Z'))).toISOString(),'2026-11-15T23:00:00.000Z')
 const a=weeklyItems(spring),b=weeklyItems(spring+10000);assert.deepEqual(a,b);assert.equal(new Set(a.map(i=>i.id)).size,8)
})
test('daily spin and purchases are persisted once per request; insufficient balance cannot mint items',()=>{
 const u=user('A'),now=Date.parse('2026-11-14T12:00:00Z')
 const drop=purchase(u,'request-spin-0001',()=>spin(u,now)),snapshot=structuredClone(u)
 assert.deepEqual(purchase(u,'request-spin-0001',()=>spin(u,now)),drop);assert.deepEqual(u,snapshot)
 assert.throws(()=>spin(u,now),/already spun/);assert.doesNotThrow(()=>spin(u,nextReset(now)))
 const empty=user('B');assert.throws(()=>buyCrate(empty,'skin-gold'),/Not enough/);assert.equal(wallet(empty).inventory.length,0)
 wallet(empty).coins=5000
 const item=weeklyItems(now)[0];const bought=buyFeatured(empty,item.id,now);assert.equal(wallet(empty).coins,5000-item.price);assert.equal(bought.itemId,item.id)
 assert.throws(()=>buyFeatured(empty,'does-not-exist',now),/not in this week/)
})
test('duplicates have an explicit once-only keep/refund choice and cannot be equipped or listed while pending',()=>{
 const u=user('A'),item=ITEMS.find(i=>i.type==='skin'),first=grant(u,item,'crate'),second=grant(u,item,'crate')
 assert.equal(second.duplicate,true);assert.throws(()=>equip(u,'K',second.uid),/Keep this item/)
 assert.throws(()=>listItem(u,[],second.uid,100),/awaiting/)
 resolveDuplicate(u,second.uid,true);assert.equal(wallet(u).coins,second.refund);assert.throws(()=>resolveDuplicate(u,second.uid,true),/not found/)
 equip(u,'K',first.uid);assert.equal(wallet(u).loadout.pieces.K,item.id)
 const third=grant(u,item,'crate');resolveDuplicate(u,third.uid,false);assert.equal(wallet(u).inventory.length,2)
 assert.throws(()=>resolveDuplicate(u,third.uid,true),/already been/)
})
test('market escrows exact copies, unequips the last usable copy, and transfers coins atomically',()=>{
 const seller=user('Seller'),buyer=user('Buyer'),other=user('Other'),listings=[],item=ITEMS.find(i=>i.type==='skin'),drop=grant(seller,item,'crate')
 equip(seller,'K',drop.uid);listItem(seller,listings,drop.uid,75)
 assert.equal(wallet(seller).loadout.pieces.K,undefined);assert.throws(()=>equip(seller,'K',drop.uid),/cancel its listing/)
 assert.throws(()=>buyListing(buyer,[seller,buyer],listings,listings[0].id),/Not enough/);assert.equal(listings.length,1)
 wallet(buyer).coins=100;const id=listings[0].id;buyListing(buyer,[seller,buyer],listings,id)
 assert.equal(wallet(buyer).coins,25);assert.equal(wallet(seller).coins,75);assert.equal(wallet(seller).inventory.length,0);assert.equal(wallet(buyer).inventory[0].uid,drop.uid)
 assert.throws(()=>buyListing(other,[seller,other],listings,id),/no longer available/)
 const next=listItem(buyer,listings,drop.uid,100);assert.throws(()=>cancelListing(seller,listings,next.id),/not found/);cancelListing(buyer,listings,next.id)
 assert.equal(wallet(buyer).inventory[0].listed,undefined);assert.throws(()=>listItem(buyer,listings,drop.uid,-1),/whole number/)
})
