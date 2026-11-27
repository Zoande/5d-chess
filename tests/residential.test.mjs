import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ChessStore} from '../server/storage.ts'
import {CityWorlds} from '../server/world.ts'
import {RouletteHall} from '../server/roulette-hall.ts'
import {Restaurant} from '../server/restaurant.ts'
import {residentialFood} from '../server/residential-food.ts'
import {BUILDINGS,STOREY,buildingById,contains,homeZone,residentialSite,residentialStep} from '../src/world/residential.ts'
import {UNITS} from '../src/world/housing.ts'
import {riderHeight,walkingHeight,worldMove,site} from '../src/world/model.ts'
import {COUNTERS,blankOrder} from '../src/world/restaurant-model.ts'

function city(t){
  const store=new ChessStore('.',{memory:true}),hall=new RouletteHall(store),world=new CityWorlds(store,hall)
  hall.stop()
  t.after(()=>store.close())
  const names=['Alice','Bob']
  store.transaction(u=>names.forEach(name=>u.users.add(name,{name,hash:'',salt:'',wallet:{coins:9999,starterGranted:true,inventory:[],loadout:{icon:'default',pieces:{}}}})))
  let now=Date.UTC(2026,10,24,12)
  const act=(name,action,data={},dt=30)=>{
    const next=now+dt
    for(let at=now+50;at<=next;at+=50)world.step(at)
    now=next
    return world.update(name,action,{scene:true,...data},now)
  }
  function move(name,x,z){
    let v=act(name,'presence')
    for(let i=0;i<22&&Math.hypot(v.you.x-x,v.you.z-z)>.05;i++){
      const next=act(name,'presence',{world:v.id,x,z,yaw:0},1000)
      if(name==='Bob')act('Alice','presence')
      if(Math.hypot(next.you.x-v.you.x,next.you.z-v.you.z)<.005)return next
      v=next
    }
    return v
  }
  const walk=(name,b,x,z)=>{const p=residentialSite(b,x,z);return move(name,p.x,p.z)}
  return {store,act,move,walk}
}
function lobby(f,name,index){
  const b=BUILDINGS[index]
  for(const [x,z] of [[0,11],[index===0?-61.5:73,11],[index===0?-61.5:73,-30.75],[b.x,-30.75]])f.move(name,x,z)
  f.act(name,'use',{target:'door:'+b.id+'-street'})
  assert.equal(f.walk(name,b,0,3.87).you.zone,homeZone(b.id,0))
  return b
}

test('every apartment storey and two-storey house can be traversed both ways with continuous stair elevation',()=>{
  for(const b of BUILDINGS.filter(b=>b.stairs)){
    const s=b.stairs,keys=[b.id]
    let zone=homeZone(b.id,0),p={...residentialSite(b,s.x-s.width/2,s.front-Math.sign(s.back-s.front)*.41),yaw:0}
    function step(x,z){
      const target=residentialSite(b,x,z),v=worldMove(zone,p,target.x,target.z,9,true,keys)
      assert.ok(Math.hypot(v.x-target.x,v.z-target.z)<.06,b.id+' stair blocked at '+[x,z])
      p=v;zone=v.zone
    }
    const dz=s.back-s.front,landing=s.front+dz*.9,outside=s.front-Math.sign(dz)*.43
    for(let floor=1;floor<b.levels.length;floor++){
      step(s.x-s.width/2,s.front+dz*.44)
      assert.match(zone,/^stairs:/)
      const y=walkingHeight(zone,p.x,p.z)
      assert.ok(y>(floor-1)*STOREY&&y<(floor-.5)*STOREY)
      step(s.x-s.width/2,landing)
      step(s.x+s.width/2,landing)
      step(s.x+s.width/2,outside)
      assert.equal(zone,homeZone(b.id,floor))
      if(floor<b.levels.length-1)step(s.x-s.width/2,outside)
    }
    for(let floor=b.levels.length-2;floor>=0;floor--){
      step(s.x+s.width/2,landing)
      step(s.x-s.width/2,landing)
      step(s.x-s.width/2,outside)
      assert.equal(zone,homeZone(b.id,floor))
      if(floor>0)step(s.x+s.width/2,outside)
    }
  }
})

test('residential lift requires a physical cabin and reaches each floor in both directions',t=>{
  for(const index of [0,1]){
    const f=city(t),b=lobby(f,'Alice',index),use=target=>f.act('Alice','use',{target})
    assert.throws(()=>f.act('Alice','home-floor',{level:4}),{status:409})
    assert.throws(()=>use('lift:'+b.id),{status:409})
    f.walk('Alice',b,6.8,1.35)
    f.walk('Alice',b,b.lift.x,1.35)
    assert.ok(f.walk('Alice',b,b.lift.x,b.lift.z).you.z>b.z+2.8)
    for(const level of [4,2,3,1,0]){
      use('lift:'+b.id)
      const v=f.act('Alice','home-floor',{level})
      assert.equal(v.you.lift.to,homeZone(b.id,level))
      assert.ok(riderHeight(v.you,(v.you.lift.started+v.you.lift.ends)/2)!==riderHeight(v.you,v.now))
      assert.throws(()=>f.act('Alice','floor',{symbol:'CAS'}),{status:409})
      assert.equal(f.act('Alice','presence',{},3200).you.zone,homeZone(b.id,level))
    }
    assert.ok(f.walk('Alice',b,b.lift.x,1.35).you.z<b.z+1.5)
  }
})

test('original deed ids, tenures and prices survive with functional doors and local furniture occupancy',t=>{
  const f=city(t),b=lobby(f,'Alice',0),id='flat-0-1',u=UNITS.find(x=>x.id===id)
  assert.deepEqual([u.floor,u.bedrooms,u.price,u.tenure],[1,1,150,'rent'])
  f.walk('Alice',b,4.6,.8)
  assert.equal(f.act('Alice','use',{target:'property:desk-0'}).interaction,'property:desk-0')
  const paid=f.act('Alice','housing',{unit:id})
  assert.equal(paid.coins,9849)
  assert.equal(f.act('Alice','housing',{unit:id}).coins,9849)
  const expires=paid.housing.expires[id]
  const saved=f.store.metadataValue('cityDeeds')
  assert.equal(saved[id].until,expires)
  f.walk('Alice',b,7,1.22);f.walk('Alice',b,b.lift.x,1.22);f.walk('Alice',b,b.lift.x,b.lift.z)
  f.act('Alice','use',{target:'lift:'+b.id});f.act('Alice','home-floor',{level:1})
  f.act('Alice','presence',{},3100)
  f.walk('Alice',b,b.lift.x,.22)
  const door=b.levels[1].doors.find(d=>d.id===id)
  f.walk('Alice',b,door.x,.22)
  assert.ok(f.walk('Alice',b,door.x,door.z-.57).you.z>b.z+door.z)
  const opened=f.act('Alice','use',{target:'door:'+id})
  f.walk('Alice',b,door.x,door.z+.79)
  assert.ok(f.act('Alice','use',{target:'door:'+id},320).residential.doors[id]<0)
  assert.ok(f.walk('Alice',b,door.x,door.z-.66).you.z>b.z+door.z)
  f.walk('Alice',b,door.x,door.z+.79)
  f.act('Alice','use',{target:'door:'+id},320)
  assert.ok(opened.residential.doors[id])
  assert.ok(f.walk('Alice',b,door.x,door.z-.66).you.z<b.z+door.z)
  const p=b.levels[1].points.find(p=>p.unit===id&&p.id.startsWith('fridge:'))
  f.act('Alice','food',{})
  assert.throws(()=>f.act('Alice','food',{id:'food-invalid-001',operation:'store',item:'cola',amount:1}),{status:409})
  assert.throws(()=>f.act('Alice','use',{target:p.id.replace(id,'flat-0-4')}),{status:409})
  f.store.transaction(tx=>{
    const account=tx.users.get('Alice')
    account.fridges={[id]:{...blankOrder(),cola:2}}
    tx.putMetadata('cityDeeds',{[id]:{holder:'Alice',until:opened.now+1}})
  })
  const evicted=f.act('Alice','food',{})
  assert.ok(evicted.you.z>b.z+door.z)
  assert.equal(evicted.food.personal.cola,2)
  assert.equal(JSON.parse(f.store.accountJson('Alice')).fridges[id],undefined)
})

test('private door collision and shared furniture prevent unauthorized entry and duplicate occupancy',t=>{
  const f=city(t),b=buildingById.get('house-10'),u=UNITS.find(u=>u.id===b.id)
  const zone=homeZone(b.id,0),front={...residentialSite(b,0,4.25),yaw:0},inside=residentialSite(b,0,2.72)
  const step=(keys,doors)=>worldMove('city',front,inside.x,inside.z,4,true,keys,{doors,lifts:{}})
  assert.equal(step([],{}).zone,'city')
  assert.equal(step([u.id],{}).zone,'city')
  assert.equal(step([],{[u.id]:1}).zone,'city')
  assert.equal(step([u.id],{[u.id]:1}).zone,zone)
  const apartment=lobby(f,'Alice',0)
  f.move('Bob',0,11);f.move('Bob',-61.5,11);f.move('Bob',-61.5,-30.75);f.move('Bob',apartment.x,-30.75)
  f.walk('Bob',apartment,0,3.8)
  const seat=apartment.levels[0].points.find(p=>p.pose?.kind==='sit')
  for(const name of ['Alice','Bob']){
    f.walk(name,apartment,0,-4.7)
    f.walk(name,apartment,seat.x,-4.7)
    f.walk(name,apartment,seat.x,seat.z)
  }
  assert.equal(f.act('Alice','use',{target:seat.id}).you.homePose?.kind,'sit')
  assert.throws(()=>f.act('Bob','use',{target:seat.id}),{status:409})
  assert.equal(f.act('Bob','presence').players.find(p=>p.name==='Alice').homePose?.id,seat.pose.id)
  assert.equal(f.act('Alice','stand-scenery').you.homePose,undefined)
  assert.equal(f.act('Bob','use',{target:seat.id}).you.homePose?.kind,'sit')
})

test('takeaway payments, collection and refrigerator transfers persist and reject invalid requests',t=>{
  const dir=mkdtempSync(join(tmpdir(),'chess-food-'))
  t.after(()=>rmSync(dir,{recursive:true,force:true}))
  let store=new ChessStore(dir)
  try{
    store.transaction(u=>u.users.add('Alice',{name:'Alice',hash:'',salt:'',wallet:{coins:100,starterGranted:true,inventory:[],loadout:{icon:'default',pieces:{}}}}))
    let restaurant=new Restaurant(store)
    const player={...site('kfc',COUNTERS[0],-.55),name:'Alice',zone:'kfc',yaw:0}
    const at=Date.UTC(2026,10,24,12),order={id:'takeaway-buy-001',lane:0,takeaway:true,items:{...blankOrder(),burger:1,cola:2}}
    restaurant.act(player,'buy',order,at)
    restaurant.act(player,'buy',order,at+1)
    assert.equal(store.rouletteWallet('Alice').coins,70)
    assert.throws(()=>restaurant.act(player,'collect',{id:order.id},at+2),{status:409})
    restaurant=new Restaurant(store)
    restaurant.view('Alice',at+3,true)
    for(let j=1;j<=35;j++)restaurant.tick(at+j*1000)
    assert.throws(()=>restaurant.act({...player,z:player.z+5},'collect',{id:order.id},at+35005),{status:409})
    restaurant.act(player,'collect',{id:order.id},at+35006)
    restaurant.act(player,'collect',{id:order.id},at+35007)
    assert.equal(JSON.parse(store.accountJson('Alice')).food.cola,2)
    const id='house-10',keys=[id]
    const transfer={id:'store-cola-001',operation:'store',item:'cola',amount:'all'}
    assert.throws(()=>residentialFood(store,'Alice',[],id,transfer),{status:409})
    assert.throws(()=>residentialFood(store,'Alice',keys,id,{...transfer,item:'pizza'}),{status:400})
    assert.throws(()=>residentialFood(store,'Alice',keys,id,{...transfer,amount:-2}),{status:409})
    assert.equal(residentialFood(store,'Alice',keys,id,transfer).stored.cola,2)
    assert.equal(residentialFood(store,'Alice',keys,id,transfer).stored.cola,2)
    store.close();store=new ChessStore(dir)
    assert.equal(residentialFood(store,'Alice',keys,id).stored.cola,2)
    const retrieved=residentialFood(store,'Alice',keys,id,{...transfer,id:'retrieve-cola-01',operation:'take',amount:1})
    assert.equal(retrieved.personal.cola,1)
    assert.equal(residentialFood(store,'Alice',keys,id,{...transfer,id:'consume-cola-01',operation:'eat',amount:1}).personal.cola,0)
    assert.equal(residentialFood(store,'Alice',[],undefined).personal.cola,1)
    assert.equal(JSON.parse(store.accountJson('Alice')).fridges[id],undefined)
  }finally{store.close()}
})

test('shared layouts keep every doorway and usable residential fixture connected',()=>{
  const spacing=.13,keys=UNITS.map(unit=>unit.id)
  for(const b of BUILDINGS)for(const [level,f] of b.levels.entries()){
    const zone=homeZone(b.id,level),grid=(x,z)=>[Math.round(x/spacing),Math.round(z/spacing)]
    const start=b.block!==undefined?grid(0,.25):level?grid(2.17,1.9):grid(0,2.9)
    const points=[start],seen=new Set([start.join(',')])
    const state={doors:Object.fromEntries(f.doors.map(d=>[d.id,1])),lifts:{[b.id]:{level,opened:0}}}
    for(let i=0;i<points.length;i++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=points[i][0]+dx,z=points[i][1]+dz,key=x+','+z
      if(seen.has(key))continue
      seen.add(key)
      const p=residentialSite(b,x*spacing,z*spacing)
      if(residentialStep(zone,p.x,p.z,keys,state,1000)===zone)points.push([x,z])
    }
    const close=(p,distance)=>points.some(([x,z])=>Math.hypot(x*spacing-p.x,z*spacing-p.z)<distance)
    for(const tile of f.tiles.filter(tile=>tile.kind==='bath')){
      assert.ok(points.some(([x,z])=>contains(tile.rect,x*spacing,z*spacing)),zone+' has an inaccessible bathroom')
    }
    for(const point of f.points){
      assert.ok(close(point,point.range),zone+' lacks access to '+point.id)
      if(point.exit){
        const exit=residentialSite(b,point.exit.x,point.exit.z)
        assert.equal(residentialStep(zone,exit.x,exit.z,keys,state,1000),zone,zone+' has a blocked exit '+point.id)
      }
      if(point.door&&point.door.id!==b.id&&!point.door.id.endsWith('-street'))assert.ok(close(point,.13),zone+' has a blocked door '+point.id)
    }
  }
})
