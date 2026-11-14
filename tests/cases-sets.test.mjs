import test from 'node:test'
import assert from 'node:assert/strict'
import {CASES,SETS,ITEMS,caseOffers,weeklyCases,weeklyItems,seasonalItems,crateTickets,setById,setRequirements,planSet,spinRewards,wheelArcs,nextReset,nextWeek,nextMonth,PAID_SPIN_PRICE} from '../src/collection.ts'
import {KINDS} from '../src/model.ts'
import {grant,grantSet,buySet,buyCrate,openOwnedCase,equip,equipCollection,listItem,listSet,cancelListing,buyListing,wallet,spin,purchase} from '../server/economy.ts'
const now=Date.parse('2026-11-14T12:00:00Z'),user=name=>({name,wallet:{coins:1000000,starterGranted:true,inventory:[],loadout:{icon:'default',pieces:{}}}})

test('case slots rotate deterministically with exact categories, permanent stock and server-enforced offers',()=>{
 const offers=caseOffers(now);for(const [window,count]of [['weekly',6],['daily',1],['permanent',5],['seasonal',3]])assert.equal(offers.filter(o=>o.window===window).length,count)
 assert.equal(new Set(offers.map(o=>o.id)).size,15);assert.deepEqual(caseOffers(nextReset(now)-1),offers)
 assert.deepEqual(weeklyCases(nextWeek(now)-1),weeklyCases(now));assert.notDeepEqual(weeklyCases(nextWeek(now)),weeklyCases(now))
 assert.deepEqual(weeklyCases(now).map(c=>c.setChance===1000000?'sets':c.type),['icon','skin','shape','mixed','frame','sets'])
 assert.equal(weeklyItems(now).length,4);assert.ok(weeklyItems(now).every(i=>i.price>=700));assert.equal(seasonalItems(now).length,3);assert.ok(seasonalItems(now).every(i=>i.monthly))
 const expired=CASES.find(c=>!offers.some(o=>o.id===c.id));assert.throws(()=>buyCrate(user('A'),expired.id,now),/rotated out/)
 const daily=offers.find(o=>o.window==='daily');assert.throws(()=>buyCrate(user('A'),daily.id,now,undefined,'bad-day',daily.price),/offer has changed/)
 const u=user('B'),drop=buyCrate(u,'skin-bronze',now);assert.ok(KINDS.includes(drop.kind));assert.equal(drop.setId,undefined);assert.equal(u.wallet.coins,999840)
})

test('case format odds sum exactly and exclusive ETC never leaks into reward pools',()=>{
 for(const c of CASES){const tickets=crateTickets(c);assert.equal(tickets.reduce((s,t)=>s+t.weight,0),1000000,c.id);assert.ok(tickets.every(t=>Number.isInteger(t.weight)&&t.weight>0&&!t.item.exclusive));assert.equal(tickets.filter(t=>t.setId).reduce((s,t)=>s+t.weight,0),c.setChance??0,c.id);if(c.setChance===1000000)assert.ok(tickets.every(t=>t.setId));if(!c.setChance)assert.ok(tickets.every(t=>!t.setId))}
 const c=weeklyCases(now).find(c=>c.setChance===1000000),u=user('Set draw'),d=buyCrate(u,c.id,now);assert.ok(d.setId);assert.equal(d.items.length,setRequirements(setById(d.setId)).length);assert.equal(planSet(u.wallet.inventory,setById(d.setId)).complete,true)
 const etc=user('ETC'),pack=buySet(etc,'set-skin-etc',now);assert.equal(pack.items.length,12);assert.equal(etc.wallet.coins,915000);assert.equal(planSet(etc.wallet.inventory,setById(pack.setId)).complete,true)
})

test('piece-specific rights and duplicates cannot equip another kind; legacy universals retain all six rights',()=>{
 const u=user('Pieces'),item=ITEMS.find(i=>i.id==='skin-neon'),pawn=grant(u,item,'crate',now,'P'),king=grant(u,item,'crate',now,'K')
 assert.equal(king.duplicate,false);assert.throws(()=>equip(u,'K',pawn.uid),/different piece/);equip(u,'P',pawn.uid);equip(u,'K',king.uid)
 const duplicate=grant(u,item,'crate',now,'P');assert.equal(duplicate.duplicate,true)
 const set=setById('set-skin-neon');assert.equal(planSet(u.wallet.inventory,set).complete,false);assert.throws(()=>listSet(u,[],set.id,100,'','incomplete-set-fixture'),/every required/)
 const legacy=user('Legacy'),full=grant(legacy,item,'crate',now);for(const k of KINDS)equip(legacy,k,full.uid);assert.equal(planSet(legacy.wallet.inventory,set).complete,true);assert.deepEqual(planSet(legacy.wallet.inventory,set).uids,[full.uid])
 const listings=[];listItem(u,listings,pawn.uid,50);assert.equal(u.wallet.loadout.pieces.P,undefined);assert.equal(u.wallet.loadout.pieces.K,item.id)
})

test('complete Sets escrow all members, cancel together, retry once and transfer atomically without fees',()=>{
 const seller=user('Seller'),buyer=user('Buyer'),set=setById('set-skin-etc'),listings=[];grantSet(seller,set,now);equipCollection(seller,set.id)
 const l=listSet(seller,listings,set.id,9000,'An entire court.','whole-set-list-fixture',now);assert.equal(l.uids.length,12);assert.equal(seller.wallet.inventory.filter(o=>o.listed===l.id).length,12);assert.equal(planSet(seller.wallet.inventory,set).complete,false)
 assert.equal(listSet(seller,listings,set.id,9000,'An entire court.','whole-set-list-fixture',now).id,l.id);assert.equal(listings.length,1)
 assert.throws(()=>listItem(seller,listings,l.uid,50),/already listed/);cancelListing(seller,listings,l.id);assert.ok(seller.wallet.inventory.every(o=>!o.listed))
 const sale=listSet(seller,listings,set.id,9000,'','whole-set-list-second',now);buyer.wallet.inventory=Array.from({length:4990},(_,i)=>({uid:'fixture'+i,itemId:'icon-laurel',pending:false,acquired:now}));const before=structuredClone([seller,buyer,listings]);assert.throws(()=>buyListing(buyer,[seller,buyer],listings,sale.id),/full/);assert.deepEqual([seller,buyer,listings],before)
 buyer.wallet.inventory=[];buyListing(buyer,[seller,buyer],listings,sale.id,now);assert.equal(seller.wallet.coins,1009000);assert.equal(buyer.wallet.coins,991000);assert.equal(buyer.wallet.inventory.length,12);assert.equal(planSet(buyer.wallet.inventory,set).complete,true);assert.equal(seller.wallet.inventory.length,0)
 listSet(seller,listings,set.id,9000,'','whole-set-list-second',now);assert.equal(listings.length,0,'closed listing retries do not create a new sale')
})

test('the 25-slot wheel respects each rotation clock and visual sizes are independent from draw odds',()=>{
 assert.equal(PAID_SPIN_PRICE,300);const pool=spinRewards(now);assert.equal(pool.length,25);assert.equal(pool.reduce((s,r)=>s+r.weight,0),1000000);assert.ok(pool.every(r=>r.weight>0));assert.deepEqual(['fixed','daily','weekly','seasonal'].map(c=>pool.filter(r=>r.cadence===c).length),[10,5,5,5])
 const next=spinRewards(nextReset(now));assert.deepEqual(next.slice(0,10),pool.slice(0,10));assert.notDeepEqual(next.slice(10,15),pool.slice(10,15));assert.deepEqual(next.slice(15,20),pool.slice(15,20));assert.deepEqual(next.slice(20),pool.slice(20));assert.notDeepEqual(spinRewards(nextWeek(now)).slice(15,20),pool.slice(15,20));assert.notDeepEqual(spinRewards(nextMonth(now)).slice(20),pool.slice(20))
 const arcs=wheelArcs(pool);assert.ok(Math.abs(Math.max(...arcs.map(a=>a.end))-360)<1e-9);const rare=pool.findIndex(r=>r.cadence==='seasonal'&&r.rarity==='mythic');assert.ok((arcs[rare].end-arcs[rare].start)/360>pool[rare].weight/1000000*100);assert.ok(new Set(pool.map(r=>r.visualWeight)).size>3)
})

test('earned case vouchers remain openable after rotation and are consumed only once',()=>{
 const u=user('Voucher'),c=CASES.find(c=>c.id==='sets-grandmaster');u.wallet.cases=[{uid:'owned-case-fixture',caseId:c.id,acquired:now}]
 const coins=u.wallet.coins,drop=purchase(u,'owned-case-open-fixture',()=>openOwnedCase(u,'owned-case-fixture',nextMonth(now)));assert.ok(drop.setId);assert.equal(u.wallet.coins,coins);assert.equal(u.wallet.cases.length,0);const count=u.wallet.inventory.length;assert.deepEqual(purchase(u,'owned-case-open-fixture',()=>openOwnedCase(u,'owned-case-fixture')),drop);assert.equal(u.wallet.inventory.length,count);assert.throws(()=>openOwnedCase(u,'owned-case-fixture'),/no longer/)
 const stale=user('Spin');assert.throws(()=>spin(stale,now,false,'2000-01-01'),/wheel has changed/);assert.equal(stale.wallet.lastSpin,undefined)
})

test('paid wheel expected catalog value remains below its price even when costly cases rotate in',()=>{
 let highest=0
 for(let d=0;d<370;d++){
  const pool=spinRewards(now+d*86400000),ev=pool.reduce((sum,r)=>{const value=r.coins??(r.caseId?CASES.find(c=>c.id===r.caseId).price:r.setId?setById(r.setId).price:r.itemId?ITEMS.find(i=>i.id===r.itemId).price:ITEMS.find(i=>i.rarity===r.rarity&&!i.monthly&&!i.exclusive).price);return sum+value*r.weight/1000000},0)
  highest=Math.max(highest,ev);assert.ok(ev<PAID_SPIN_PRICE,ev+' on day '+d)
 }
 assert.ok(highest>100)
})
