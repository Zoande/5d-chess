import {commandResult} from './live-wire.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readdir} from 'node:fs/promises'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {createApplication} from '../server/application.ts'
import {observeCity,browserWalker} from './civic-controls.mjs'
import {visitorRoute} from './civic-route.mjs'
import {origins,entrances} from '../src/world/civic-venues.ts'

test('the five-model armory, hotbar, camera and reload work in the WebGL city',{timeout:120000},async t=>{
  const realNow=Date.now
  let elapsed=0
  Date.now=()=>realNow()+elapsed
  t.after(()=>{Date.now=realNow})
  const store=new ChessStore('.',{memory:true}),app=createApplication(store),server=app.createServer()
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  t.after(async()=>{app.drain();server.closeAllConnections();await new Promise(r=>server.close(r));store.close()})
  const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  t.after(()=>browser.close())
  const base='http://127.0.0.1:'+server.address().port,ctx=await browser.newContext({viewport:{width:1080,height:720},hasTouch:true})
  const name='Armory Tester'
  assert.equal((await ctx.request.post(base+'/api/signup',{data:{username:name,password:'fixture',confirm:'fixture'}})).status(),201)
  store.transaction(tx=>{tx.users.get(name).wallet.coins=400.125})
  const route=visitorRoute(async(action,data)=>{
    const r=await ctx.request.post(base+'/api/world/'+action,{data:{scene:true,...data}})
    assert.ok(r.ok(),await r.text());return r.json()
  },ms=>elapsed+=ms)
  assert.equal((await route.enter('gunshop')).you.zone,'gunshop')
  let page=await ctx.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await observeCity(page);await page.goto(base+'/chess/world.html')
  await page.locator('#world-canvas[data-zone="gunshop"]').waitFor()
  await page.locator('#world-canvas').focus()
  await page.keyboard.down('w')
  try{await page.getByRole('button',{name:/Visit the armory counter/}).waitFor()}finally{await page.keyboard.up('w')}
  if(process.env.ARMORY_REVIEW_DIR)await page.screenshot({path:process.env.ARMORY_REVIEW_DIR+'/clerk.png'})
  await page.keyboard.press('e')
  const shop=page.getByRole('dialog')
  await shop.locator('.armory-shop').waitFor()
  assert.equal(await shop.locator('[data-weapon]').count(),5)
  assert.equal(await shop.getByRole('radio',{name:/Banked coins/}).isChecked(),true)
  await shop.getByRole('button',{name:'Select Shotgun'}).click()
  await shop.getByRole('radio',{name:/Carried cash/}).check()
  assert.ok(await shop.getByRole('button',{name:'Buy Shotgun for 80 cash'}).isDisabled())
  await shop.getByText(/Short 80 cash/).waitFor()
  await shop.getByRole('radio',{name:/Banked coins/}).check()
  if(process.env.ARMORY_REVIEW_DIR)await page.screenshot({path:process.env.ARMORY_REVIEW_DIR+'/counter.png'})
  await page.setViewportSize({width:390,height:750})
  assert.ok(await shop.evaluate(d=>d.scrollWidth<=d.clientWidth))
  await shop.getByRole('button',{name:'Buy Shotgun for 80 banked coins'}).tap()
  await shop.getByText('Shotgun added to hotbar slot 1. Paid 80 banked coins.').waitFor()
  assert.equal(await shop.locator('[data-bank]').innerText(),'320.125')
  if(process.env.ARMORY_REVIEW_DIR)await page.screenshot({path:process.env.ARMORY_REVIEW_DIR+'/mobile.png'})
  await shop.getByRole('button',{name:'Close',exact:true}).tap()
  await page.reload()
  await page.locator('#world-canvas[data-zone="gunshop"]').waitFor()
  if(await shop.isVisible())await shop.getByRole('button',{name:'Close',exact:true}).tap()
  await page.locator('.arcade-slots').getByRole('button',{name:/Shotgun/}).waitFor()
  const desktop=await browser.newContext({viewport:{width:1080,height:720},storageState:await ctx.storageState()})
  await page.close()
  page=await desktop.newPage()
  page.on('pageerror',e=>errors.push(e.message))
  await observeCity(page);await page.goto(base+'/chess/world.html')
  await page.locator('#world-canvas[data-zone="gunshop"]').waitFor()
  const activeShop=page.getByRole('dialog')
  if(await activeShop.isVisible())await activeShop.getByRole('button',{name:'Close',exact:true}).click()
  await page.locator('.arcade-slots').getByRole('button',{name:/Shotgun/}).click()
  const cameraButton=page.getByRole('button',{name:'Switch camera'})
  await cameraButton.click();await page.locator('#city-world[data-camera="third"]').waitFor()
  await cameraButton.click();await page.locator('#city-world[data-camera="first"]').waitFor()
  const visitor=await browser.newContext()
  assert.equal((await visitor.request.post(base+'/api/signup',{data:{username:'Doorway guest',password:'fixture',confirm:'fixture'}})).status(),201)
  const arrival=await visitor.request.post(base+'/api/world/teleport',{data:{to:'gunshop',scene:true}})
  const inside=await arrival.json()
  assert.equal(inside.you.zone,'gunshop')
  await visitor.request.post(base+'/api/world/presence',{data:{scene:true,world:inside.id,x:inside.you.x,z:inside.you.z,yaw:Math.PI}})
  await page.getByRole('link',{name:'GUNS',exact:true}).click()
  await browserWalker(page).walk({...entrances.gunshop,z:entrances.gunshop.z+2.3})
  await page.waitForFunction(()=>window.walkObservation.view.you.zone==='city'&&window.walkObservation.view.arcade.contacts.some(c=>c.id==='player:Doorway guest'&&c.inSight&&c.distance<5))
  const canvas=page.locator('#world-canvas')
  if(!await canvas.evaluate(c=>document.pointerLockElement===c))await canvas.click()
  await page.waitForFunction(()=>document.pointerLockElement===document.querySelector('#world-canvas'))
  await page.waitForFunction(()=>{
    const s=window.walkObservation
    return s.held.children.length&&s.figures.get('Doorway guest')?.figure.rig&&Math.abs(s.camera.position.z-s.position.z)<.1
  })
  if(process.env.CITY_REVIEW_DIR){
    const frame=await page.evaluate(()=>window.walkObservation.renderer.info.render.frame)
    await page.waitForFunction(n=>window.walkObservation.renderer.info.render.frame>=n+3,frame)
    await page.evaluate(()=>window.walkObservation.gl.finish())
    await page.screenshot({path:process.env.CITY_REVIEW_DIR+'/doorway.png'})
  }
  const shot=commandResult(page,'arcade')
  await page.mouse.down();await page.mouse.up()
  const hit=await shot
  assert.equal(hit.status,200);assert.equal(hit.request.data.target,'player:Doorway guest')
  const outcome=hit.view
  assert.equal(outcome.arcade.contacts.find(c=>c.id==='player:Doorway guest').hp,42)
  await page.getByText('4 / 5',{exact:true}).waitFor()
  await page.keyboard.press('r')
  await page.getByText('5 / 5',{exact:true}).waitFor()
  assert.deepEqual(errors,[])

  // Check skinned vertices after animation, when the GPU actually draws them.
  // A valid bind pose alone can mask a centimetre/metre error.
  const stageFile=(await readdir('dist/chess/chunks')).find(f=>/^stage-.*\.js$/.test(f))
  const probe=await ctx.newPage()
  await probe.route('**/chess/world.js',r=>r.fulfill({contentType:'text/javascript',body:''}))
  await probe.goto(base+'/chess/world.html')
  const heights=await probe.evaluate(async ({file,origin})=>{
    const {CityStage}=await import('/chess/chunks/'+file)
    const s=new CityStage(document.querySelector('#world-canvas'),document.querySelector('#city-world'),()=>{})
    const actor=(name,x)=>({name,x:origin.x+x,z:origin.z,yaw:0,zone:'gunshop',online:true,avatar:'default'})
    s.set({id:'art',now:Date.now(),coins:0,players:[actor('Mia',-1),actor('Axel',1)],you:actor('Viewer',0),housing:{keys:[],occupied:[],expires:{}}},0,true)
    const end=performance.now()+30000
    while(performance.now()<end&&(!s.graphicsReady||[...s.figures.values()].filter(f=>f.figure.rig).length!==3))await new Promise(requestAnimationFrame)
    return [...s.figures.values()].filter(f=>f.figure.target.name!=='Viewer').map(({figure})=>{
      let min=Infinity,max=-Infinity
      figure.rig.root.traverse(mesh=>{
        if(!mesh.isSkinnedMesh)return
        const v=mesh.position.clone()
        for(let i=0;i<mesh.geometry.attributes.position.count;i+=7){
          mesh.getVertexPosition(i,v);mesh.localToWorld(v);min=Math.min(min,v.y);max=Math.max(max,v.y)
        }
      })
      const wrist=figure.rig.bones.get('RightHand'),point=wrist.position.clone()
      figure.rig.pose(.016,0,false,undefined,true,false,'blaster',{x:-.6,y:-.6})
      const low=wrist.getWorldPosition(point).clone()
      figure.rig.pose(.016,0,false,undefined,true,false,'blaster',{x:.6,y:.6})
      return {height:max-min,handTravel:low.distanceTo(wrist.getWorldPosition(point)),holding:figure.rig.held.children.length}
    })
  },{file:stageFile,origin:origins.gunshop})
  assert.equal(heights.length,2)
  for(const {height,handTravel,holding} of heights){
    assert.ok(height>1.5&&height<2,'Animated player height: '+height)
    assert.ok(handTravel>.12,'Cook wrist travel: '+handTravel)
    assert.equal(holding,0)
  }
})
