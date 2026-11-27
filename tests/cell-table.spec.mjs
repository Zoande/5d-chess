import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {createApplication} from '../server/application.ts'
import {book,release} from '../server/custody.ts'
import {cellPosition,tablePosition} from '../src/world/civic-venues.ts'
import {observeCity,browserWalker} from './civic-controls.mjs'

async function fixture(t,webgl){
  const store=new ChessStore('.',{memory:true}),app=createApplication(store),server=app.createServer()
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const base='http://127.0.0.1:'+server.address().port
  const browser=await chromium.launch({args:['--no-sandbox',...(webgl?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--disable-webgl'])]})
  t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));app.drain();store.close()})
  const page=await browser.newPage({viewport:{width:960,height:720},hasTouch:true,reducedMotion:'reduce'})
  const requests=[],errors=[]
  page.on('request',r=>{if(r.url().includes('/api/'))requests.push(new URL(r.url()).pathname)})
  page.on('pageerror',e=>errors.push(e.message))
  const user='Cell Tester',data={username:user,password:'fixture',confirm:'fixture'}
  assert.equal((await page.request.post(base+'/api/signup',{data})).status(),201)
  return {store,page,base,user,requests,errors}
}

test('the city requires WebGL before joining a world',async t=>{
  const {page,base,requests,errors}=await fixture(t,false)
  await page.goto(base+'/chess/world.html?go=casino')
  await page.getByText(/city requires WebGL 2/).waitFor()
  assert.equal(await page.locator('#world-canvas').isVisible(),false)
  assert.equal(await page.locator('[data-world-use]').isVisible(),false)
  await page.getByRole('link',{name:'Retry'}).click()
  await page.getByText(/city requires WebGL 2/).waitFor()
  await page.getByRole('link',{name:'Back home'}).click()
  await page.waitForURL('**/lobby.html')
  assert.ok(!requests.some(path=>path.startsWith('/api/world/')))
  assert.deepEqual(errors,[])
})

test('prisoner login, world shortcuts, cell movement and saved table puzzle',{timeout:180000},async t=>{
  const {store,page,base,user,requests,errors}=await fixture(t,true)
  await page.request.post(base+'/api/logout',{data:{}})
  store.transaction(tx=>book(tx,user,5,Date.now(),true,true))
  await observeCity(page)
  await page.goto(base+'/chess/login.html')
  await page.locator('#username').fill(user);await page.locator('#password').fill('fixture')
  await page.locator('#auth-submit').click();await page.waitForURL('**/lobby.html')
  await page.getByText('Inmate 01',{exact:true}).first().waitFor()
  await page.locator('.deal-tower-face strong').first().waitFor({state:'attached'})
  await page.locator('#leaderboard table').waitFor()
  assert.ok(await page.locator('#find-game').isDisabled())
  assert.ok(await page.locator('.spin-now').isDisabled())
  assert.equal(await page.locator('.economy-nav a[aria-label=Shop]').getAttribute('href'),null)
  assert.equal(await page.locator('dialog[open]').count(),0)
  await page.locator('#find-game').evaluate(b=>b.click())
  assert.ok(!requests.includes('/api/games'))
  if(process.env.CITY_REVIEW_DIR){
    await page.setViewportSize({width:1440,height:900})
    await page.screenshot({path:process.env.CITY_REVIEW_DIR+'/custody-home.png'})
    await page.setViewportSize({width:960,height:720})
  }
  await page.getByRole('link',{name:'Casino',exact:true}).click()
  const cell=page.locator('#world-canvas[data-zone="precinct:1"]')
  await cell.waitFor({timeout:60000})
  await page.getByRole('link',{name:'GUNS',exact:true}).click()
  assert.ok(!requests.includes('/api/world/teleport'))
  assert.equal(await page.locator('dialog[open]').count(),0)
  const center=cellPosition(1),table=tablePosition(1)
  const walker=browserWalker(page)
  await walker.walk({x:center.x-.6,z:center.z+.4},table)
  assert.ok(!requests.includes('/api/custody/puzzle'))
  await cell.focus();await page.keyboard.press('e')
  const tray=page.locator('.tray button'),board=page.locator('.board button')
  await tray.first().waitFor()
  assert.equal(await board.count(),25)
  const piece=Number((await tray.first().getAttribute('aria-label')).split(' ').at(-1))-1
  const target=JSON.parse(store.accountJson(user)).cellPuzzle.tiles[piece],square=Math.floor(target/40)*5+target%40
  await tray.first().click()
  await board.nth((square+1)%25).click();await page.getByText(/does not fit/).waitFor()
  await board.nth(square).click();await page.getByText('Piece fitted and saved.').waitFor()
  await page.getByRole('button',{name:'Next section'}).click()
  assert.equal(await page.getByLabel('Puzzle section',{exact:true}).inputValue(),'1')
  await page.getByLabel('Puzzle section',{exact:true}).selectOption('29')
  if(process.env.CITY_REVIEW_DIR)await page.screenshot({path:process.env.CITY_REVIEW_DIR+'/jigsaw.png'})
  await page.keyboard.press('e');await page.locator('#cell-jigsaw').waitFor({state:'hidden'})
  await page.reload();await cell.waitFor({timeout:60000})
  assert.equal(await page.locator('dialog[open]').count(),0)
  await page.setViewportSize({width:390,height:750})
  await page.locator('[data-world-use]').tap()
  await page.getByText('1 / 1,000 pieces placed').waitFor()
  assert.ok(await page.locator('#cell-jigsaw').evaluate(d=>d.scrollWidth<=d.clientWidth))
  const mobilePiece=Number((await tray.first().getAttribute('aria-label')).split(' ').at(-1))-1
  const mobileTarget=JSON.parse(store.accountJson(user)).cellPuzzle.tiles[mobilePiece]
  await tray.first().tap()
  assert.ok(!(await tray.first().isVisible()))
  assert.ok(await page.locator('.puzzle-selection canvas').isVisible())
  await board.nth(Math.floor(mobileTarget/40)*5+mobileTarget%40).tap()
  await page.getByText('2 / 1,000 pieces placed').waitFor()
  assert.ok(await tray.first().isVisible())
  if(process.env.CITY_REVIEW_DIR){
    await page.getByLabel('Puzzle section',{exact:true}).selectOption('29')
    await tray.first().tap()
    await page.screenshot({path:process.env.CITY_REVIEW_DIR+'/jigsaw-mobile.png'})
  }
  await page.getByRole('button',{name:'Close jigsaw'}).tap()
  await cell.focus();await page.keyboard.press('e');await tray.first().waitFor()
  await page.keyboard.press('Escape');await page.locator('#cell-jigsaw').waitFor({state:'hidden'})
  assert.ok(!(await page.locator('#world-pause').isVisible()))
  store.transaction(tx=>{release(tx,user);book(tx,user,1,Date.now())})
  await page.reload();await cell.waitFor({timeout:60000})
  assert.ok(!(await page.locator('[data-world-use]').isVisible()))
  assert.equal((await page.request.get(base+'/api/custody/puzzle')).status(),403)
  await page.evaluate(()=>window.walkObservation.renderer.getContext().getExtension('WEBGL_lose_context').loseContext())
  await page.getByText(/lost its 3D graphics connection/).waitFor()
  assert.ok(!(await cell.isVisible()))
  await page.getByRole('link',{name:'Back home'}).click()
  await page.getByRole('button',{name:'Account menu'}).click();await page.locator('#logout').click()
  await page.waitForURL('**/chess/')
  assert.deepEqual(errors,[])
})
