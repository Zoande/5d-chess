import test from 'node:test'
import assert from 'node:assert/strict'
import {EFFECT_ITEMS} from '../src/effects.ts'
import {CASES,crateTickets,itemById} from '../src/collection.ts'
import {grant,equip,listItem,cancelListing,buyListing} from '../server/economy.ts'
const user=name=>({name,wallet:{coins:10000,starterGranted:true,inventory:[],loadout:{icon:'default',pieces:{}}}})
test('twenty animation cosmetics have exact case odds and mixed-case rewards',()=>{
 assert.equal(EFFECT_ITEMS.filter(i=>i.type==='movement').length,10);assert.equal(EFFECT_ITEMS.filter(i=>i.type==='capture').length,10);assert.equal(new Set(EFFECT_ITEMS.map(i=>i.id)).size,20)
 for(const type of ['movement','capture']){const tickets=crateTickets(CASES.find(c=>c.type===type));assert.equal(tickets.reduce((n,t)=>n+t.weight,0),1000000);assert.ok(tickets.every(t=>t.item.type===type));assert.equal(tickets.length,10)}
 for(const id of ['mixed-vault','mixed-prismatic','mixed-relic']){const pool=crateTickets(CASES.find(c=>c.id===id));for(const type of ['movement','capture'])assert.ok(pool.some(t=>t.item.type===type&&!t.setId),id)}
 const encore=crateTickets(CASES.find(c=>c.id==='effects-encore'));assert.equal(encore.length,20);assert.ok(encore.every(t=>['movement','capture'].includes(t.item.type)))
})
test('animation slots enforce ownership and type, reconcile escrow, and transfer normally',()=>{
 const a=user('A'),b=user('B'),listings=[],move=grant(a,itemById('movement-time'),'crate'),kill=grant(a,itemById('capture-void'),'crate')
 assert.throws(()=>equip(b,'movement',move.uid),/not found/);assert.throws(()=>equip(a,'capture',move.uid),/cannot be equipped/)
 equip(a,'movement',move.uid);equip(a,'capture',kill.uid);assert.equal(a.wallet.loadout.movement,'movement-time');assert.equal(a.wallet.loadout.capture,'capture-void')
 const listing=listItem(a,listings,move.uid,250);assert.equal(a.wallet.loadout.movement,undefined);assert.equal(a.wallet.loadout.capture,'capture-void');assert.throws(()=>equip(a,'movement',move.uid),/listing/)
 cancelListing(a,listings,listing.id);equip(a,'movement',move.uid);const sale=listItem(a,listings,move.uid,250);buyListing(b,[a,b],listings,sale.id);equip(b,'movement',move.uid);assert.equal(b.wallet.loadout.movement,'movement-time');assert.equal(b.wallet.coins,9750);equip(b,'movement','default');assert.equal(b.wallet.loadout.movement,undefined)
})
