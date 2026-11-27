import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {ChessStore} from '../server/storage.ts'
import {createApplication} from '../server/application.ts'
import {book,roster} from '../server/custody.ts'
import {pack,carry} from '../server/city-inventory.ts'
import {RULES} from '../server/city-arcade.ts'
import {CLEAR_MINUTES,JAIL_MINUTES,WEAPONS,weaponIds} from '../src/world/arcade.ts'
import {visitorRoute} from './civic-route.mjs'
import {cells,cellPosition,insideDoor,at} from '../src/world/civic-venues.ts'
import {entrances} from '../src/world/arcade.ts'
import {site} from '../src/world/model.ts'

async function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'meridian-')),realNow=Date.now
  let now=realNow(),store,app,server,base
  Date.now=()=>now
  async function open(){
    store=new ChessStore(dir);app=createApplication(store);server=createServer(app.handle)
    await new Promise(r=>server.listen(0,'127.0.0.1',r))
    base='http://127.0.0.1:'+server.address().port
  }
  async function stop(){app.drain();server.closeAllConnections();await new Promise(r=>server.close(r));store.close()}
  t.after(async()=>{await stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true})})
  await open()
  const cookies=new Map()
  async function request(name,path,data){
    const r=await fetch(base+'/api/'+path,{method:data===undefined?'GET':'POST',headers:{cookie:cookies.get(name)??'','content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)})
    if(r.headers.has('set-cookie'))cookies.set(name,r.headers.get('set-cookie').split(';')[0])
    return {status:r.status,value:await r.json()}
  }
  async function ok(name,path,data){const r=await request(name,path,data);assert.ok(r.status<300,path+' '+JSON.stringify(r.value));return r.value}
  const signup=name=>ok(name,'signup',{username:name,password:'local-test',confirm:'local-test'})
  const world=(name,path,data={})=>ok(name,'world/'+path,{scene:true,...data})
  const route=name=>visitorRoute((path,data)=>world(name,path,data),ms=>now+=ms)
  async function counter(name,to,target,x,z){
    const v=to==='gunshop'?await route(name).enter(to):await world(name,'teleport',{to})
    now+=1250
    await world(name,'presence',{world:v.id,...site(v.you.zone,x,z),yaw:0})
    return world(name,'use',{target})
  }
  return {dir,request,ok,world,signup,counter,route,get store(){return store},tick:ms=>now+=ms,
    restart:async()=>{await stop();await open()},operator:(...args)=>execFileSync(process.execPath,['scripts/city-custody.mjs',...args],{env:{...process.env,DATA_DIR:dir}})}
}
test('the armory sells five weapons, validates cash and preserves magazine state across reloads and restart',async t=>{
  const f=await fixture(t),name='Armory Guest'
  await f.signup(name)
  const total=weaponIds.reduce((sum,id)=>sum+WEAPONS[id].price,0)
  f.store.transaction(tx=>carry(pack(tx.users.get(name)),'cash',total))
  let v=await f.counter(name,'gunshop','counter',0,-1.2)
  const trade=(operation,extra)=>f.world(name,'arcade',{operation,sequence:v.arcade.sequence,...extra})
  for(const item of weaponIds)v=await trade('buy',{item})
  assert.equal(count(v,'cash'),0)
  assert.deepEqual(weaponIds.map(item=>count(v,item)),[1,1,1,1,1])
  const slot=v.arcade.slots.findIndex(s=>s?.item==='shotgun')
  v=await trade('fire',{slot})
  assert.equal(v.arcade.magazines.shotgun.rounds,WEAPONS.shotgun.magazine-1)
  assert.equal(v.you.equipped,'shotgun')
  const reject=async(operation,extra)=>assert.equal((await f.request(name,'world/arcade',{operation,scene:true,sequence:v.arcade.sequence,...extra})).status,409)
  await reject('fire',{slot});await reject('buy',{item:'smg'})
  await f.restart()
  v=await f.world(name,'presence')
  assert.equal(v.arcade.magazines.shotgun.rounds,4)
  v=await trade('reload',{slot});await reject('fire',{slot})
  f.tick(WEAPONS.shotgun.reload)
  v=await trade('fire',{slot});assert.equal(v.arcade.magazines.shotgun.rounds,4)
})

const slots=v=>v.arcade.slots
const count=(v,item)=>slots(v).reduce((n,s)=>n+(s?.item===item?s.count:0),0)

test('armory checkout uses the chosen balance, respects capacity and charges each purchase once',async t=>{
  const f=await fixture(t),name='Counter shopper'
  await f.signup(name)
  f.store.transaction(tx=>{const a=tx.users.get(name);a.wallet.coins=95.375;carry(pack(a),'cash',25)})
  const shop=await f.counter(name,'gunshop','counter',0,-1.2)
  const checkout=(payment,sequence=shop.arcade.sequence,item='ar')=>f.request(name,'world/arcade',{scene:true,operation:'buy',item,payment,sequence})
  assert.match((await checkout('cash')).value.error,/Not enough carried cash/)
  assert.equal((await checkout('unknown')).status,400)
  const bought=await checkout('bank')
  assert.equal(bought.status,200)
  assert.equal(bought.value.coins,.375)
  assert.equal(count(bought.value,'cash'),25)
  assert.equal(count(bought.value,'ar'),1)
  assert.equal((await checkout('bank')).status,409)
  assert.match((await checkout('bank',bought.value.arcade.sequence,'blaster')).value.error,/Not enough banked coins/)
  f.store.transaction(tx=>{const a=tx.users.get(name);a.wallet.coins=100;carry(pack(a),'smg',7)})
  const full=await f.world(name,'presence')
  assert.ok(full.arcade.slots.every(Boolean))
  assert.match((await checkout('bank',full.arcade.sequence,'blaster')).value.error,/Free a hotbar slot/)
  const exact=await checkout('cash',full.arcade.sequence,'blaster')
  assert.equal(exact.status,200)
  assert.equal(exact.value.coins,100)
  assert.deepEqual(exact.value.arcade.slots[0],{item:'blaster',count:1})
  assert.equal(count(exact.value,'cash'),0)
})

test('local HTTP migration, full hotbar, recovery, bank and arcade-counter transfers survive restart',async t=>{
  const f=await fixture(t),name='Mira'
  await f.signup(name)
  f.store.transaction(tx=>{const a=tx.users.get(name);a.wallet.coins=253.125;a.food={burger:83,cola:0,fries:0}})
  await f.restart()
  let v=await f.counter(name,'bank','cash',0,.95)
  assert.equal(v.coins,253.125);assert.equal(slots(v).length,9);assert.equal(count(v,'burger'),81)
  assert.deepEqual(v.arcade.recovery,[{item:'burger',count:2}])
  const trade=(operation,extra={})=>f.world(name,'arcade',{operation,sequence:v.arcade.sequence,...extra})
  assert.equal((await f.request(name,'world/arcade',{operation:'withdraw',amount:20,sequence:0})).status,409)
  assert.equal((await f.request(name,'world/food',{id:'cannot-eat-overflow',operation:'eat',amount:82,item:'burger'})).status,409)
  v=await f.world(name,'food',{id:'consume-stack-0001',operation:'eat',amount:18,item:'burger'})
  v=await f.world(name,'use',{target:'cash'})
  v=await trade('recover',{item:'burger',amount:2})
  v=await trade('withdraw',{amount:75})
  assert.equal(count(v,'cash'),75);assert.equal(v.coins,178.125)
  assert.equal((await f.request(name,'world/arcade',{operation:'withdraw',amount:75,sequence:v.arcade.sequence-1})).status,409)
  v=await trade('deposit',{amount:40})
  assert.equal(v.coins,218.125)
  v=await f.counter(name,'gunshop','counter',0,-1.2)
  assert.equal((await f.request(name,'world/arcade',{operation:'buy',sequence:v.arcade.sequence})).status,409)
  assert.equal(count(await f.world(name,'presence'),'cash'),35)
  v=await f.world(name,'food',{id:'consume-stack-0002',operation:'eat',amount:9,item:'burger'})
  v=await f.world(name,'use',{target:'counter'})
  v=await trade('buy')
  assert.equal(count(v,'cash'),10);assert.equal(count(v,'blaster'),1)
  await f.restart();v=await f.world(name,'presence')
  assert.equal(v.coins,218.125);assert.equal(count(v,'burger'),56);assert.equal(count(v,'cash'),10)
})

test('local combat, eating, death, competing pickups, pursuit, offline sentence and public aliases',async t=>{
  const f=await fixture(t),a='Odessa Finch',b='Sam',c='Inez'
  for(const n of [a,b,c])await f.signup(n)
  const match=await f.ok(a,'games',{playerCount:2})
  await f.ok(b,'games/'+match.code+'/join',{})
  f.store.transaction(tx=>{
    tx.putMetadata('cityDeeds',{'house-1':{holder:b,until:0}})
    const victim=tx.users.get(b);victim.food={burger:2,fries:0,cola:0}
    const p=pack(victim);carry(p,'cash',80);p.drawers={'house-1':[{item:'cash',count:40}]}
    victim.fridges={'house-1':{burger:0,fries:3,cola:0}}
  })
  let v=await f.counter(a,'bank','cash',0,1)
  v=await f.world(a,'arcade',{operation:'withdraw',amount:25,sequence:v.arcade.sequence})
  v=await f.counter(a,'gunshop','counter',0,-1.2)
  await f.world(a,'arcade',{operation:'buy',sequence:v.arcade.sequence})
  for(const n of [b,c,a])v=await f.world(n,'teleport',{to:'city'})
  const bank=(await f.world(b,'presence')).coins
  async function shot(){
    f.tick(950);v=await f.world(a,'arcade',{operation:'fire',slot:0,target:'player:'+b,sequence:v.arcade.sequence})
  }
  await shot();assert.equal(v.arcade.stars,1);assert.equal((await f.world(b,'presence')).arcade.hp,65)
  assert.equal((await f.world(b,'food',{id:'restore-health-burger',operation:'eat',item:'burger',amount:1})).arcade.hp,85)
  await shot();await shot();await shot();assert.equal(v.arcade.stars,5)
  const dead=await f.world(b,'presence')
  assert.equal(dead.arcade.hp,100);assert.ok(slots(dead).every(s=>s===null));assert.equal(dead.coins,bank)
  assert.equal(v.arcade.drops.length,1)
  const beforeRestart=v.arcade.drops
  await f.restart()
  const claims=await Promise.all([b,c].map(async n=>{
    const state=await f.world(n,'presence')
    return f.request(n,'world/arcade',{operation:'pickup',sequence:state.arcade.sequence,target:beforeRestart[0].id})
  }))
  assert.deepEqual(claims.map(r=>r.status).sort(),[200,409])
  const winner=claims.find(r=>r.status===200).value
  assert.equal(count(winner,'cash'),80);assert.equal(count(winner,'burger'),1)
  const saved=JSON.parse(f.store.accountJson(b))
  assert.equal(saved.cityPack.drawers['house-1'][0].count,40);assert.equal(saved.fridges['house-1'].fries,3)
  v=await f.world(a,'presence')
  for(let i=0;i<650&&!v.arcade.custody;i++){f.tick(50);v=await f.world(a,'presence')}
  const jail=v.arcade.custody;assert.equal(jail.name,'Inmate 01')
  assert.ok(Math.abs(jail.ends-Date.now()-86400000)<50)
  for(const [path,field] of [['leaderboard','rating'],['leaderboard/coins/full','coins'],['leaderboard/net-worth/full','netWorth']]){
    const board=(await f.ok(b,path)).players
    assert.equal(board.at(-1).name,'Inmate 01')
    assert.equal(board.at(-1).jailed,true)
    assert.equal(board.at(-1).rank,board.length)
    assert.ok(field in board.at(-1))
  }
  for(const [path,data] of [['games/'+match.code+'/orders',{orders:[]}],['economy/spin',{}],['economy/buy',{}],['stocks/trade',{}],['bank/borrow',{}],['world/teleport',{to:'city'}],['world/arcade',{}],['roulette-hall/presence',{}],['stocks/history?symbol=BNK',undefined],['casino',undefined]]){
    assert.equal((await f.request(a,path,data)).status,423,path)
  }
  for(const path of ['leaderboard','leaderboard/coins/full','games','games/'+match.code,'profile?user=Inmate%2001','profile/history?user=Inmate%2001&tab=games','notifications']){
    const response=await f.ok(b,path);assert.ok(!JSON.stringify(response).includes(a),path)
  }
  assert.equal((await f.request(b,'profile?user=Odessa%20Finch')).status,404)
  assert.equal((await f.ok(b,'games/'+match.code)).seats.red,'Inmate 01')
  assert.equal((await f.ok(a,'me')).user,'Inmate 01')
  const frozen=(await f.world(a,'presence',{world:v.id,x:jail.x+.7,z:jail.z+.4,yaw:1})).arcade.custody
  assert.deepEqual([frozen.x,frozen.z],[jail.x+.7,jail.z+.4])
  await f.ok(a,'logout',{})
  await f.restart()
  const visitor=f.route(b);await visitor.enter('station');v=await visitor.climb()
  const avatar=v.players.find(p=>p.name===jail.name)
  assert.deepEqual([avatar.x,avatar.z,avatar.online],[frozen.x,frozen.z,false])
  const login=await f.ok(a,'login',{username:a,password:'local-test'});assert.equal(login.user,'Inmate 01')
  v=await f.world(a,'presence');assert.equal(v.you.x,frozen.x);assert.equal(v.you.z,frozen.z)
  await f.ok(a,'logout',{});f.tick(86400001)
  assert.equal((await f.ok(a,'login',{username:a,password:'local-test'})).user,a)
  assert.equal((await f.ok(a,'custody')).custody,null)
  assert.equal((await f.ok(b,'games/'+match.code)).seats.red,a)
})

test('walk through both street entrances, visit the jail wing, and return to the city',async t=>{
  const f=await fixture(t),name='Visitor'
  await f.signup(name)
  const visitor=f.route(name)
  await visitor.read()
  for(const target of ['enter-station','enter-gunshop','gallery-up'])assert.equal((await f.request(name,'world/use',{target,scene:true})).status,409)
  assert.equal((await f.request(name,'world/teleport',{to:'precinct:5'})).status,400)
  for(const zone of ['station','gunshop']){
    await visitor.enter(zone)
    if(zone==='station'){
      for(let floor=1;floor<=5;floor++)assert.equal((await visitor.climb()).you.zone,'precinct:'+floor)
      const c=cells[49]
      await visitor.step(c.x,0)
      assert.equal(await visitor.walk(cellPosition(50)),false)
      assert.ok(visitor.view.you.z<at('station',0,.75).z)
      await visitor.step(c.x,0)
      for(let floor=5;floor>0;floor--)await visitor.descend()
    }
    const p=insideDoor(zone)
    assert.ok(await visitor.walk(at(zone,p.x,p.z)))
    assert.ok(await visitor.walk(entrances[zone]))
    const v=visitor.view
    assert.equal(v.you.zone,'city')
    assert.ok(Math.hypot(v.you.x-entrances[zone].x,v.you.z-entrances[zone].z)<.01)
  }
})

test('all 50 cells exclude a 51st booking, enforce each deadline and serialize reuse',async t=>{
  const f=await fixture(t)
  const start=Date.now()
  f.store.transaction(tx=>{
    for(let i=0;i<=50;i++){
      const name='Booked '+i;tx.users.add(name,{name,salt:'',hash:''})
      const stars=1+i%5,b=book(tx,name,stars,start)
      if(i===50){assert.equal(b,undefined);continue}
      assert.equal(b.cell,i+1);assert.equal(b.ends,start+JAIL_MINUTES[stars]*60000)
    }
  })
  await f.restart()
  assert.equal(roster(f.store,start).length,50)
  assert.equal(f.store.transaction(tx=>book(tx,'Booked 50',5,start+120000)).cell,1)
  assert.equal(new Set(roster(f.store,start+120000).map(c=>c.cell)).size,41)
  await f.signup('Late arrival')
  f.store.transaction(tx=>{
    // Fill the spots vacated by the two-minute sentences.
    for(let i=0;i<10;i++){const n='Reserve '+i;tx.users.add(n,{name:n,salt:'',hash:''});book(tx,n,5,start+120000)}
    carry(pack(tx.users.get('Late arrival')),'blaster',1)
  })
  f.tick(120000)
  let v=await f.world('Late arrival','presence')
  v=await f.world('Late arrival','arcade',{operation:'fire',sequence:v.arcade.sequence,slot:0})
  for(let i=0;i<140&&!v.arcade.warning?.startsWith('Booking full');i++){
    f.tick(150);v=await f.world('Late arrival','presence')
  }
  assert.match(v.arcade.warning,/Booking full/);assert.equal(v.arcade.custody,undefined)
  f.operator('release','Booked 50');f.tick(50)
  v=await f.world('Late arrival','presence');assert.equal(v.arcade.custody.cell,1)
})

test('1000 shuffled pieces, persisted matches and operator-only releases over local HTTP',async t=>{
  const f=await fixture(t),name='Puzzle Tester'
  await f.signup(name)
  for(const locked of [false,true]){
    f.operator('jail',name,...(locked?['--no-release']:[]))
    assert.equal((await f.request(name,'custody/release',{})).status,423)
    const {puzzle}=await f.ok(name,'custody/puzzle')
    assert.equal(new Set(puzzle.tiles).size,1000)
    assert.equal((await f.request(name,'custody/puzzle',{piece:0,target:(puzzle.tiles[0]+1)%1000})).status,409)
    for(let i=0;i<1000;i++){
      if(i===2){await f.restart();assert.equal((await f.ok(name,'custody/puzzle')).puzzle.placed.filter(Boolean).length,2)}
      const result=await f.ok(name,'custody/puzzle',{piece:i,target:puzzle.tiles[i]})
      if(i===999)assert.equal(!!result.released,!locked)
    }
    assert.equal(!!(await f.ok(name,'custody')).custody,locked)
    if(locked){f.operator('release',name);assert.equal((await f.ok(name,'custody')).custody,null)}
  }
})


test('each wanted tier counts authenticated active time, resets on escalation and pauses on logout',async t=>{
  const f=await fixture(t),name='Night Shift'
  await f.signup(name)
  f.store.transaction(tx=>carry(pack(tx.users.get(name)),'blaster',1))
  for(let tier=1;tier<=5;tier++){
    let v=await f.world(name,'presence')
    for(let i=0;i<tier;i++){
      if(v.arcade.magazines?.blaster?.rounds===0)v=await f.world(name,'arcade',{operation:'reload',sequence:v.arcade.sequence,slot:0})
      f.tick(1200)
      v=await f.world(name,'arcade',{operation:'fire',sequence:v.arcade.sequence,slot:0})
      assert.equal(v.arcade.remaining,CLEAR_MINUTES[i+1]*60000)
      assert.equal(v.arcade.contacts.filter(c=>c.kind==='officer'&&c.id.startsWith('patrol-')).length,RULES.officers[i+1])
      assert.equal(!!v.arcade.custody,false)
    }
    await f.ok(name,'logout',{})
    f.tick(43200000)
    await f.ok(name,'login',{username:name,password:'local-test'})
    v=await f.world(name,'presence')
    assert.equal(v.arcade.remaining,CLEAR_MINUTES[tier]*60000)
    if(tier===5){
      f.tick(1200)
      v=await f.world(name,'arcade',{operation:'fire',sequence:v.arcade.sequence,slot:0})
      assert.equal(v.arcade.remaining,CLEAR_MINUTES[5]*60000-1200)
    }
    // Remain logged in on a different site page for the entire clearance interval.
    for(let ms=0;ms<CLEAR_MINUTES[tier]*60000;ms+=30000){
      f.tick(30000);await f.ok(name,'custody')
    }
    assert.equal((await f.world(name,'presence')).arcade.stars,0)
  }
})

test('bank and restaurant staff take arcade damage at their visible counters',async t=>{
  const f=await fixture(t),name='Counter Visitor'
  await f.signup(name)
  f.store.transaction(tx=>carry(pack(tx.users.get(name)),'blaster',1))
  for(const [to,prefix] of [['bank','staff:bank:'],['kfc','kfc:']]){
    let v=await f.world(name,'teleport',{to})
    f.tick(1250)
    v=await f.world(name,'presence',{world:v.id,...site(to,0,.95),yaw:0})
    const target=v.arcade.contacts.find(p=>p.inSight&&p.id.startsWith(prefix)&&Math.hypot(v.you.x-p.x,v.you.z-p.z)<=8)
    assert.ok(target,'in-range staff at the '+to+' counter')
    v=await f.world(name,'arcade',{operation:'fire',sequence:v.arcade.sequence,slot:0,target:target.id})
    assert.equal(v.arcade.contacts.find(p=>p.id===target.id)?.hp,65)
  }
})

test('NPC HP, suspect-only seizures, neighboring searches and a warned range-limited dog team',async t=>{
  const f=await fixture(t),name='Maris',other='Jan'
  for(const user of [name,other])await f.signup(user)
  f.store.transaction(tx=>{
    tx.putMetadata('cityDeeds',{'house-1':{holder:name,until:0},'house-0':{holder:other,until:0}})
    const a=pack(tx.users.get(name));carry(a,'blaster',1)
    a.drawers['house-1']=[{item:'blaster',count:1},{item:'cash',count:42}]
    pack(tx.users.get(other)).drawers['house-0']=[{item:'blaster',count:1}]
  })
  let v=await f.route(name).enter('station')
  async function shot(target=''){
    f.tick(950);v=await f.world(name,'arcade',{operation:'fire',slot:0,target,sequence:v.arcade.sequence})
  }
  await shot('desk');assert.equal(v.arcade.contacts.find(c=>c.id==='desk').hp,65)
  await shot('desk');assert.equal(v.arcade.contacts.find(c=>c.id==='desk').hp,30)
  await shot();assert.equal(v.arcade.stars,3)
  f.tick(RULES.raidDelay);v=await f.world(name,'presence')
  assert.deepEqual(v.arcade.searches,['house-1'])
  assert.deepEqual(f.store.cityPack(name).drawers['house-1'],[{item:'cash',count:42}])
  await shot();assert.equal(v.arcade.stars,4)
  // Leave the station while patrols search the neighborhood.
  v=await f.world(name,'teleport',{to:'kfc'})
  for(let i=0;i<4&&!v.arcade.searches.includes('house-0');i++){
    f.tick(RULES.raidDelay);v=await f.world(name,'presence')
  }
  assert.ok(v.arcade.searches.includes('house-0'))
  assert.deepEqual(f.store.cityPack(other).drawers['house-0'],[{item:'blaster',count:1}])
  // Begin a fresh pursuit at the saved wanted level to exercise the dog warning.
  await f.ok(name,'logout',{})
  await f.ok(name,'login',{username:name,password:'local-test'})
  v=await f.world(name,'teleport',{to:'prison'})
  await shot('desk');assert.equal(v.arcade.stars,5)
  assert.equal(v.arcade.contacts.some(c=>c.id==='desk'),false)
  assert.ok(v.arcade.contacts.some(c=>c.kind==='helicopter'))
  assert.ok(v.arcade.contacts.some(c=>c.kind==='dog'))
  let warned=false
  for(let i=0;i<120&&!v.arcade.custody;i++){
    f.tick(250);v=await f.world(name,'presence')
    if(v.arcade.warning?.startsWith('Dog team')){
      warned=true
      const dog=v.arcade.contacts.find(c=>c.kind==='dog')
      assert.ok(Math.hypot(dog.x-v.you.x,dog.z-v.you.z)<RULES.dogRange+1)
      break
    }
  }
  assert.ok(warned,'dog warning precedes the tag')
})

test('a signed-in legacy inmate and an unclaimed venue bag migrate once across restarts',async t=>{
  const f=await fixture(t),name='Old precinct resident'
  await f.signup(name)
  f.operator('jail',name,'--no-release')
  const {puzzle}=await f.ok(name,'custody/puzzle')
  await f.ok(name,'custody/puzzle',{piece:71,target:puzzle.tiles[71]})
  const contents=[{item:'cash',count:17}],gear=[{item:'blaster',count:1}]
  f.store.transaction(tx=>{
    const a=tx.users.get(name);a.wallet.coins=391.125;pack(a).drawers={'house-1':gear}
    const list=tx.metadata('meridianBookings')
    Object.assign(list[0],{x:205.8+.62,z:-6-.39,yaw:1.23})
    tx.putMetadata('meridianBookings',list)
    tx.putMetadata('cityDrops:1',[{id:'legacy-bag',x:240,z:1,zone:'gunshop',items:contents}])
  })
  const center=cellPosition(1),door=insideDoor('gunshop')
  for(let i=0;i<2;i++){
    await f.restart()
    const view=await f.world(name,'presence'),b=view.arcade.custody
    assert.equal(view.you.zone,'precinct:1');assert.equal(view.coins,391.125)
    assert.equal(b.cell,1);assert.equal(b.name,'Inmate 01');assert.equal(b.noRelease,true)
    assert.ok(Math.abs(b.x-center.x-.62)<1e-8&&Math.abs(b.z-center.z+.39)<1e-8)
    assert.equal(b.yaw,1.23);assert.deepEqual(f.store.cityPack(name).drawers['house-1'],gear)
    const saved=(await f.ok(name,'custody/puzzle')).puzzle
    assert.deepEqual(saved.tiles,puzzle.tiles);assert.equal(saved.placed.filter(Boolean).length,1);assert.ok(saved.placed[71])
    assert.deepEqual(f.store.metadataValue('cityDrops:1'),[{id:'legacy-bag',zone:'gunshop',items:contents,...at('gunshop',door.x,door.z)}])
  }
})

test('the server resolves two-player hits through an open doorway and rejects a target behind its wall',async t=>{
  const f=await fixture(t),a='Outside Visitor',b='Inside Visitor'
  for(const n of [a,b]){
    await f.signup(n);f.store.transaction(tx=>carry(pack(tx.users.get(n)),'blaster',1))
    await f.world(n,'teleport',{to:'gunshop'})
  }
  const visitor=f.route(a),shopper=f.route(b)
  await visitor.read();await shopper.read()
  assert.ok(await visitor.walk(entrances.gunshop));assert.equal(visitor.view.you.zone,'city')
  for(const [name,other] of [[a,b],[b,a]]){
    const v=await f.world(name,'presence'),id='player:'+other
    assert.equal(v.arcade.contacts.find(c=>c.id===id)?.inSight,true)
    await f.world(name,'arcade',{operation:'fire',target:id,slot:0,sequence:v.arcade.sequence})
    assert.equal((await f.world(other,'presence')).arcade.hp,65)
  }
  const outside=entrances.gunshop,inside=insideDoor('gunshop')
  assert.ok(await visitor.walk({...outside,x:outside.x+2.5}))
  assert.ok(await shopper.walk(at('gunshop',inside.x,inside.z-1.4)))
  assert.ok(await shopper.walk(at('gunshop',inside.x+2.5,inside.z-1.4)))
  const v=await f.world(a,'presence'),id='player:'+b
  assert.equal(v.arcade.contacts.find(c=>c.id===id)?.inSight,false)
  assert.equal((await f.request(a,'world/arcade',{operation:'fire',target:id,slot:0,sequence:v.arcade.sequence})).status,409)
  assert.equal((await f.world(b,'presence')).arcade.hp,65)
})
