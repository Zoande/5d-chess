import {observeWire} from './live-wire.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {createApplication} from '../server/application.ts'
import {shared} from '../src/world/map-data.ts'
import release from '../.meridian/manifest.json' with {type:'json'}
import {observeCity,browserWalker} from './civic-controls.mjs'

async function fixture(t){
  const store=new ChessStore('.',{memory:true}),app=createApplication(store),server=app.createServer()
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));app.drain();store.close()})
  const base='http://127.0.0.1:'+server.address().port,page=await browser.newPage({viewport:{width:840,height:600},hasTouch:true,reducedMotion:'reduce'})
  assert.equal((await page.request.post(base+'/api/signup',{data:{username:'Meridian explorer',password:'fixture',confirm:'fixture'}})).status(),201)
  return {base,page}
}
test('ordinary City entry loads the compiled map, reads the square board and sits on a generated bench',{timeout:145000},async t=>{
  const {page,base}=await fixture(t),files=[],teleports=[]
  await observeCity(page)
  page.on('response',r=>{if(r.url().includes('/chess/maps/'))files.push([r.url().split('/').at(-1),r.status()])})
  observeWire(page).on('send',m=>{if(m.action==='teleport')teleports.push(m.data.to)})
  await page.goto(base+'/chess/?local=1&players=4')
  await page.locator('#scene').waitFor()
  await page.goto(base+'/chess/lobby.html')
  assert.deepEqual(files,[])
  await page.getByRole('link',{name:'City',exact:true}).first().click()
  await page.locator('#world-canvas[data-zone=city]').waitFor()
  assert.deepEqual(files.sort(),['manifest.json',release.sections.shared.file,release.sections.visual.file].map(f=>[f,200]).sort())
  const walker=browserWalker(page),board=shared.directory.find(p=>p.id==='directory:clock-directory')
  await walker.outside({x:board.x,z:board.z+1})
  const result=await walker.use(board.id)
  const dialog=page.locator('#world-service')
  await dialog.getByRole('heading',{name:board.title}).waitFor()
  for(const place of board.nearby)assert.match(await dialog.innerText(),new RegExp(place.direction+' · '+place.metres+' m'))
  await dialog.getByRole('button',{name:'Close'}).tap()
  const before=result.request.input,after=result.view.you
  assert.ok(Math.hypot(before.x-after.x,before.z-after.z)<.2)
  const seat=shared.seats.find(s=>s.id==='furniture:frontage-hotel-bench-0')
  await walker.outside(seat)
  // Use the same large touch action that the mobile HUD exposes.
  await page.waitForFunction(id=>window.walkObservation.nearest?.id===id,seat.id)
  await page.locator('[data-world-use]').tap()
  await page.waitForFunction(id=>window.walkObservation.view.you.homePose?.id===id,seat.pose.id)
  await page.locator('[data-world-use]').tap()
  await page.waitForFunction(()=>!window.walkObservation.view.you.homePose)
  assert.ok(teleports.every(to=>to==='city'))
})
test('mixed release and damaged map stop world entry and show the retry path',{timeout:80000},async t=>{
  const {page,base}=await fixture(t),posts=[]
  page.on('request',r=>{if(r.url().includes('/api/world/')&&r.method()==='POST')posts.push(r.url())})
  const mismatch=await page.request.post(base+'/api/world/teleport',{data:{mapVersion:'previous',scene:true,to:'gunshop'}})
  assert.equal(mismatch.status(),412)
  await page.route('**/api/world/map-version',r=>r.fulfill({json:{version:'another-deployment'}}))
  await page.goto(base+'/chess/world.html?go=gunshop')
  await page.getByText(/city and its map are on the same version/).waitFor()
  assert.deepEqual(posts,[])
  await page.unroute('**/api/world/map-version')
  await page.route('**/chess/maps/meridian/shared-*.json',async r=>{
    const response=await r.fetch(),bytes=await response.body()
    bytes[bytes.length-1]^=1
    await r.fulfill({response,body:bytes})
  })
  await page.getByRole('link',{name:'Retry'}).click()
  await page.getByText(/could not load its map/).waitFor()
  assert.deepEqual(posts,[])
  await page.unroute('**/chess/maps/meridian/shared-*.json')
  await page.getByRole('link',{name:'Retry'}).click()
  await page.locator('#world-canvas[data-zone=gunshop]').waitFor()
})
