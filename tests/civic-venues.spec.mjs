import {observeWire} from './live-wire.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createApplication} from '../server/application.ts'
import {ChessStore} from '../server/storage.ts'
import {at,cells,entrances,insideDoor,stair} from '../src/world/civic-venues.ts'
import {browserWalker,observeCity} from './civic-controls.mjs'

for(const keyboard of [true,false])test('walk from Clock Square through both Civic Avenue venues with '+(keyboard?'3D keyboard':'3D touch controls'),{timeout:520000},async()=>{
  const store=new ChessStore('.',{memory:true}),app=createApplication(store),server=app.createServer()
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  let browser
  try{
    const base='http://127.0.0.1:'+server.address().port
    browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
    const context=await browser.newContext(keyboard?{viewport:{width:960,height:600}}:{viewport:{width:480,height:540},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'})
    const page=await context.newPage(),errors=[],travel=[]
    await observeCity(page)
    page.on('pageerror',e=>errors.push(e.message))
    observeWire(page).on('send',m=>{if(m.action==='teleport')travel.push(m.data.to)})
    await context.request.post(base+'/api/signup',{data:{username:'Civic visitor',password:'fixture',confirm:'fixture'}})
    await page.goto(base+'/chess/lobby.html')
    await page.getByRole('link',{name:'City',exact:true}).first().click()
    const zone=z=>page.locator('#world-canvas[data-zone="'+z+'"]').waitFor({timeout:60000})
    await zone('city')
    assert.ok(await page.evaluate(()=>window.walkObservation.renderer.getContext() instanceof WebGL2RenderingContext))
    const v=await page.evaluate(()=>window.walkObservation.view.you)
    assert.deepEqual([v.x,v.z],[0,8])
    const {walk,outside,use}=browserWalker(page,!keyboard)
    await outside(entrances.station);await walk(at('station',insideDoor('station').x,insideDoor('station').z));await zone('station')
    await walk(at('station',-4.45,.39));await use('desk')
    await page.getByRole('heading',{name:'Meridian Police front desk'}).waitFor()
    await page.getByRole('button',{name:'Close',exact:true}).click()
    for(let n=1;n<=5;n++){
      await walk(at('station',stair.up,0),at('station',stair.up,2.90),at('station',stair.down,2.90),at('station',stair.down,stair.start-.38))
      await zone('precinct:'+n)
    }
    await walk(at('station',cells[49].x,0))
    for(let n=5;n>0;n--){
      await walk(at('station',stair.down,stair.start-.53));await walk(at('station',stair.down,stair.start+.40));await zone(n===1?'station':'precinct:'+(n-1))
      await walk(at('station',stair.down,2.90),at('station',stair.up,2.90),at('station',stair.up,0))
    }
    for(const id of ['station','gunshop']){
      if(id==='gunshop'){
        await outside(entrances.gunshop);await walk(at(id,insideDoor(id).x,insideDoor(id).z));await zone('gunshop')
        await walk(at(id,0,-1.22));await use('counter')
        await page.getByRole('button',{name:/Buy Pistol for 25 banked coins/}).waitFor()
        await page.getByRole('button',{name:'Close',exact:true}).click()
      }
      const p=insideDoor(id);await walk(at(id,p.x,p.z));await walk(entrances[id]);await zone('city')
      await page.waitForFunction(goal=>{
        const p=window.walkObservation.view.you
        return p.zone==='city'&&Math.hypot(p.x-goal.x,p.z-goal.z)<.36
      },entrances[id])
    }
    assert.ok(travel.every(to=>to==='city'));assert.deepEqual(errors,[])
  }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));app.drain();store.close()}
})
