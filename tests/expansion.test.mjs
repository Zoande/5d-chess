import test from 'node:test'
import assert from 'node:assert/strict'
import {ITEMS,GENERAL_ITEMS,CRATES,crateTickets,monthKey,nextMonth,weeklyItems} from '../src/collection.ts'
import {wallet,buyCrate,equip,equipLook,grant,listItem,cancelListing,buyListing} from '../server/economy.ts'
import {pieceVectors,setCosmetics} from '../src/art.ts'
import {avatarArt,frameArt} from '../src/cosmetic-art.ts'
import {KINDS,PLAYERS} from '../src/model.ts'
const user=name=>({name,wallet:{starterGranted:true,coins:100000,inventory:[],loadout:{icon:'default',pieces:{}}}})

test('paired looks validate both layers atomically and shape overrides apply to just the chosen piece',()=>{
 const u=user('Stylist'),skin=grant(u,ITEMS.find(i=>i.id==='skin-neon'),'crate'),shape=grant(u,ITEMS.find(i=>i.id==='shape-regency'),'crate')
 const original=structuredClone(wallet(u).loadout)
 assert.throws(()=>equipLook(u,'N',skin.uid,'unowned'),/Item not found/)
 assert.deepEqual(wallet(u).loadout,original)
 equipLook(u,'N',skin.uid,shape.uid)
 assert.equal(wallet(u).loadout.pieces.N,'skin-neon')
 assert.equal(wallet(u).loadout.shapes.N,'shape-regency')
 assert.equal(wallet(u).loadout.shapes.K,undefined)
 try{
  setCosmetics({red:wallet(u).loadout})
  assert.equal(pieceVectors('N','red').shape,pieceVectors('N','red','skin-neon','shape-regency').shape)
  assert.equal(pieceVectors('K','red').shape,pieceVectors('K','red','default','default').shape)
 }finally{setCosmetics({})}
 const listings=[];listItem(u,listings,shape.uid,100)
 assert.equal(wallet(u).loadout.shapes.N,undefined)
})

test('monthly exclusives stay out of all general crates and weekly offers; exact tickets sum to a million',()=>{
 assert.equal(ITEMS.length,112)
 for(const [type,general,monthly] of [['skin',40,10],['icon',20,10],['frame',10,5],['shape',10,5]]){
  assert.equal(GENERAL_ITEMS.filter(i=>i.type===type).length,general)
  assert.equal(ITEMS.filter(i=>i.type===type&&i.monthly).length,monthly)
 }
 for(const crate of CRATES){
  const tickets=crateTickets(crate)
  assert.equal(tickets.reduce((s,t)=>s+t.weight,0),1000000,crate.id)
  assert.ok(tickets.every(t=>Number.isInteger(t.weight)&&t.weight>0))
  if(!crate.monthly)assert.ok(tickets.every(t=>!t.item.monthly))
  else if(crate.monthly==='exclusive')assert.ok(tickets.every(t=>t.item.monthly))
  else{assert.ok(tickets.some(t=>t.item.monthly));assert.ok(tickets.some(t=>!t.item.monthly));assert.ok(tickets.every(t=>!t.item.monthly||t.item.monthly===crate.monthly))}
 }
 const edit=weeklyItems();assert.ok(edit.every(i=>!i.monthly));assert.deepEqual(edit.slice(0,4).map(i=>i.type),['skin','icon','frame','shape'])
 const now=Date.parse('2026-11-30T22:59:00Z'),next=nextMonth(now)
 assert.equal(monthKey(now),'2026-11');assert.equal(monthKey(next),'2026-12')
 const u=user('Monthly');assert.throws(()=>buyCrate(u,'monthly-eclipse',next,monthKey(now)),/seasonal collection has changed/)
 assert.equal(wallet(u).coins,100000)
 for(let i=0;i<20;i++){const drop=buyCrate(u,'monthly-eclipse',now,monthKey(now));assert.ok(ITEMS.find(item=>item.id===drop.itemId).monthly)}
})

test('every shape set has six distinct silhouettes, composes with skins, and keeps all faction colors',()=>{
 const shapes=ITEMS.filter(i=>i.type==='shape')
 for(const kind of KINDS){const paths=new Set()
  for(const shape of shapes){
   const vector=pieceVectors(kind,'red','skin-neon',shape.id),base=pieceVectors(kind,'red','skin-neon')
   assert.notEqual(vector.shape,base.shape,shape.id);assert.deepEqual(vector.layers,base.layers)
   paths.add(vector.shape)
   assert.equal(new Set(PLAYERS.map(p=>pieceVectors(kind,p,'skin-neon',shape.id).base)).size,4)
  }assert.equal(paths.size,16,kind)
 }
 for(const shape of shapes)assert.equal(new Set(KINDS.map(k=>pieceVectors(k,'red','default',shape.id).shape)).size,6)
 for(const item of ITEMS.filter(i=>i.type==='icon'))assert.ok(!avatarArt(item.id).includes('undefined'),item.id)
 for(const item of ITEMS.filter(i=>i.type==='frame'))assert.ok(frameArt(item.id).includes('frame-structure'),item.id)
})

test('frames and shapes equip independently and unequip when their last available copy is listed',()=>{
 for(const [slot,id] of [['frame','frame-rift-halo'],['shape','shape-regency']]){
  const seller=user('Seller'),buyer=user('Buyer'),listings=[],item=ITEMS.find(i=>i.id===id),drop=grant(seller,item,'crate')
  equip(seller,slot,drop.uid);assert.equal(wallet(seller).loadout[slot],id)
  assert.throws(()=>equip(seller,'icon',drop.uid),/cannot be equipped/)
  listItem(seller,listings,drop.uid,50);assert.equal(wallet(seller).loadout[slot],undefined)
  cancelListing(seller,listings,listings[0].id);equip(seller,slot,drop.uid)
  listItem(seller,listings,drop.uid,50);buyListing(buyer,[seller,buyer],listings,listings[0].id)
  equip(buyer,slot,drop.uid);assert.equal(wallet(buyer).loadout[slot],id)
  equip(buyer,slot,'default');assert.equal(wallet(buyer).loadout[slot],undefined)
 }
})
