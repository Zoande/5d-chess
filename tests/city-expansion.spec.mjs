import {observeCity,browserWalker} from './civic-controls.mjs'
import {at,insideDoor,entrances} from '../src/world/civic-venues.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {createApplication} from '../server/application.ts'
import {book} from '../server/custody.ts'

test('play the expansion from signup through the 3D city hotbar', {timeout:240000},async()=>{
  const store=new ChessStore('.',{memory:true}),app=createApplication(store),server=app.createServer()
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  let browser
  try{
    const base='http://127.0.0.1:'+server.address().port
    browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})
    const page=await browser.newPage({viewport:{width:820,height:580}}),errors=[]
    await observeCity(page)
    page.on('pageerror',e=>errors.push(e.message))
    await page.goto(base+'/chess/login.html')
    await page.getByRole('button',{name:'Create an account'}).click()
    await page.locator('#username').fill('Map Walker');await page.locator('#password').fill('fixture')
    await page.locator('#confirm').fill('fixture');await page.locator('#auth-submit').click()
    await page.waitForURL('**/chess/lobby.html')
    await page.getByRole('link',{name:'City',exact:true}).first().click()
    await page.locator('#world-canvas[data-zone=city]').waitFor()
    const walker=browserWalker(page)
    const start=await page.evaluate(()=>window.walkObservation.view.you)
    assert.deepEqual([start.x,start.z],[0,8])
    await walker.outside({x:-24,z:5.67})
    await walker.walk({x:-24,z:4.16})
    await page.locator('#city-world[data-zone=bank]').waitFor()
    await walker.walk({x:-24,z:-2.10});await walker.use('cash')
    await page.getByLabel('Quantity').fill('50')
    await page.getByRole('button',{name:'Withdraw',exact:true}).click()
    await page.getByText(/Carried cash 50/).waitFor()
    await page.getByLabel('Quantity').fill('10')
    await page.getByRole('button',{name:'Deposit',exact:true}).click()
    await page.getByText(/Carried cash 40/).waitFor()
    await page.getByRole('button',{name:'Close',exact:true}).click()
    assert.equal(await page.locator('.arcade-slots button').count(),9)
    await walker.walk({x:-24,z:5.66})
    await walker.outside(entrances.gunshop)
    await walker.walk(at('gunshop',insideDoor('gunshop').x,insideDoor('gunshop').z))
    await page.locator('#city-world[data-zone=gunshop]').waitFor()
    await walker.walk(at('gunshop',0,-1.22));await walker.use('counter')
    await page.getByRole('button',{name:/Buy Pistol for 25 cash/}).click()
    await page.locator('.arcade-slots button').filter({hasText:'Pistol'}).waitFor()
    await page.getByRole('button',{name:'Close',exact:true}).click()
    await page.locator('.arcade-slots button').filter({hasText:'Pistol'}).click()
    await page.getByRole('button',{name:'Fire',exact:true}).click()
    await page.getByText(/HP 100\/100 · ★/).waitFor()
    const visitor=await browser.newContext()
    const signup=await visitor.request.post(base+'/api/signup',{data:{username:'Visitor',password:'local',confirm:'local'}})
    assert.equal(signup.status(),201)
    const match=await (await page.request.post(base+'/api/games',{data:{playerCount:2}})).json()
    assert.equal((await visitor.request.post(base+'/api/games/'+match.code+'/join',{data:{}})).status(),200)
    store.transaction(tx=>book(tx,'Map Walker',5,Date.now(),true,true))
    await page.locator('#world-canvas[data-zone="precinct:1"]').waitFor()
    assert.equal(await page.locator('dialog[open]').count(),0)
    const observer=await visitor.newPage()
    for(const url of ['/chess/leaderboard.html','/chess/online.html?code='+match.code]){
      await observer.goto(base+url)
      const link=observer.getByRole('link',{name:'Inmate 01',exact:true}).first()
      await link.waitFor()
      assert.ok(!(await observer.locator('body').innerText()).includes('Map Walker'))
      assert.equal(await link.getAttribute('href'),'/chess/profile.html?user=Inmate%2001')
      await link.click();await observer.getByRole('heading',{name:'Inmate 01',exact:true}).waitFor()
    }
    await visitor.close();assert.deepEqual(errors,[])
  }finally{
    await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));app.drain();store.close()
  }
})
