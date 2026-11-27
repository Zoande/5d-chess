import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createApplication} from '../server/application.ts'
import {ChessStore} from '../server/storage.ts'
import {site} from '../src/world/model.ts'
import {observeCity} from './civic-controls.mjs'
import {MANAGER,SUPPLIES,stationPoint} from '../src/world/restaurant-model.ts'

test('a cook flips a burger with the keyboard, moves the shared hand pose and uses both civic shortcuts',{timeout:120000},async t=>{
  const realNow=Date.now
  let offset=0
  Date.now=()=>realNow()+offset
  t.after(()=>{Date.now=realNow})
  const store=new ChessStore('.',{memory:true}),app=createApplication(store),server=app.createServer()
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  t.after(async()=>{app.drain();server.closeAllConnections();await new Promise(r=>server.close(r));store.close()})
  const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  t.after(()=>browser.close())
  const base='http://127.0.0.1:'+server.address().port
  const cook=await browser.newContext({viewport:{width:1080,height:720}}),guest=await browser.newContext()
  const call=async(ctx,path,data={})=>{
    const r=await ctx.request.post(base+'/api/'+path,{data:{scene:true,...data}})
    assert.ok(r.ok(),path+' '+await r.text());return r.json()
  }
  for(const [ctx,name] of [[cook,'Kitchen cook'],[guest,'Kitchen guest']]){
    await call(ctx,'signup',{username:name,password:'fixture',confirm:'fixture'})
    await call(ctx,'world/teleport',{to:'kfc'})
  }
  let v=await call(cook,'world/presence')
  async function walk(x,z){
    const dest=site('kfc',x,z)
    for(let i=0;i<8;i++){
      if(Math.hypot(v.you.x-dest.x,v.you.z-dest.z)<.08)return
      offset+=800
      v=await call(cook,'world/presence',{world:v.id,...dest,yaw:0})
    }
    assert.fail('Cannot walk to '+JSON.stringify({x,z,from:v.you}))
  }
  const use=async target=>{v=await call(cook,'world/use',{target})}
  const station=stationPoint(0)
  await walk(0,-.45);await walk(4.75,-.45);await walk(MANAGER.x,MANAGER.z)
  await call(cook,'world/restaurant',{command:'hire',role:'cook'})
  await walk(4.75,-2.65);await walk(SUPPLIES.tickets.x,SUPPLIES.tickets.z)
  if(!v.restaurant.tickets){offset+=5100;v=await call(cook,'world/presence')}
  await use('kfc:kitchen:tickets')
  // Approach the shelves and the grill along the kitchen aisle.
  await walk(-5.31,-2.6);await walk(SUPPLIES.bun.x,SUPPLIES.bun.z);await use('kfc:kitchen:bun')
  await walk(-5.31,-5.46);await walk(station.x,station.z);await use('kfc:kitchen:station')
  await walk(-5.31,-5.46);await walk(SUPPLIES.raw.x,SUPPLIES.raw.z);await use('kfc:kitchen:raw')
  await walk(-5.31,-5.46);await walk(station.x,station.z);await use('kfc:kitchen:station')
  offset+=1200;await use('kfc:kitchen:station')
  assert.equal(v.interaction,'kfc:kitchen:station')
  const page=await cook.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await observeCity(page);await page.goto(base+'/chess/world.html')
  await page.waitForFunction(()=>window.walkObservation?.graphicsReady&&window.walkObservation.station)
  await page.locator('#world-canvas').focus()
  const gloves=()=>page.evaluate(()=>{
    const s=window.walkObservation,gloves=[]
    s.art.scene.traverseVisible(o=>{if(o.name==='Kitchen glove')gloves.push(o.getWorldPosition(o.position.clone()).toArray())})
    return gloves
  })
  const before=await gloves();assert.equal(before.length,1)
  await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown')
  await page.waitForFunction(()=>window.walkObservation.view.you.kitchenMotion?.y<-.3)
  await page.waitForFunction(start=>{
    let moved=false
    window.walkObservation.art.scene.traverseVisible(o=>{
      if(o.name==='Kitchen glove'){
        const p=o.getWorldPosition(o.position.clone())
        moved=Math.hypot(p.x-start[0],p.y-start[1],p.z-start[2])>.04
      }
    })
    return moved
  },before[0])
  const peer=await call(guest,'world/teleport',{to:'kfc'})
  assert.ok(peer.players.find(p=>p.name==='Kitchen cook')?.kitchenMotion.y<-.3)
  for(let i=0;i<5;i++)await page.keyboard.press('ArrowUp')
  await page.waitForFunction(()=>window.walkObservation.view.restaurant?.kitchen?.patty==='flipped')
  if(process.env.CITY_REVIEW_DIR)await page.screenshot({path:process.env.CITY_REVIEW_DIR+'/kitchen.png'})
  for(const [label,zone] of [['GUNS','gunshop'],['PRISON','station']]){
    const shortcut=page.getByRole('link',{name:label,exact:true})
    await shortcut.click()
    await page.waitForFunction(z=>window.walkObservation.view.you.zone===z,zone)
    assert.equal(await shortcut.getAttribute('aria-current'),'page')
    if(zone==='station'&&process.env.CITY_REVIEW_DIR){
      await page.locator('#world-canvas[data-zone="station"]').waitFor()
      await page.screenshot({path:process.env.CITY_REVIEW_DIR+'/prison.png'})
    }
  }
  assert.deepEqual(errors,[])
})
