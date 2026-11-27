import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createApplication} from '../server/application.ts'
import {ChessStore} from '../server/storage.ts'
import {pack} from '../server/city-inventory.ts'
import {storefront} from '../src/world/storefronts.ts'
import {observeCity,browserWalker} from './civic-controls.mjs'

test('buy an apple at the market, eat it from the hotbar and recover health after the bite', {timeout:105000},async t=>{
  const db=new ChessStore('.',{memory:true}),app=createApplication(db),server=app.createServer()
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  t.after(async()=>{app.drain();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close()})
  const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  t.after(()=>browser.close())
  const page=await browser.newPage({viewport:{width:720,height:480}})
  const url='http://127.0.0.1:'+server.address().port,name='Orchard visitor',errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  const signup=await page.request.post(url+'/api/signup',{data:{username:name,password:'fixture',confirm:'fixture'}})
  assert.equal(signup.status(),201)
  db.transaction(tx=>{pack(tx.users.get(name)).hp=42})
  await observeCity(page);await page.goto(url+'/chess/world.html')
  await page.waitForFunction(()=>window.walkObservation?.graphicsReady)
  const stall=storefront('front:stall-0'),walker=browserWalker(page)
  await walker.walk({x:0,z:11},{x:stall.x,z:11},{x:stall.x,z:stall.z})
  await walker.use('front:stall-0')
  const service=page.getByRole('dialog')
  await service.locator('[data-order=apple]').click()
  await service.getByText('Added to your inventory.').waitFor()
  await service.getByRole('button',{name:'Close'}).click()
  await page.evaluate(()=>{
    const host=document.querySelector('#city-world')
    const observer=new MutationObserver(()=>{
      if(!host.hasAttribute('data-eating'))return
      const stage=window.walkObservation
      window.biteFrame={
        held:stage.snacks.get('apple')?.visible&&stage.snackHand?.parent===stage.camera,
        inventory:getComputedStyle(document.querySelector('#city-pack')).visibility,
        dialog:!!document.querySelector('dialog[open]'),hp:stage.view.arcade.hp,
      }
      observer.disconnect()
    })
    observer.observe(host,{attributes:true,attributeFilter:['data-eating']})
  })
  await page.locator('.arcade-slots').getByRole('button',{name:/Orchard apple/}).click()
  await page.waitForFunction(()=>window.biteFrame)
  assert.deepEqual(await page.evaluate(()=>window.biteFrame),{held:true,inventory:'hidden',dialog:false,hp:42})
  await page.getByText('HP 62/100',{exact:true}).waitFor()
  assert.equal(await page.locator('#city-pack').isVisible(),true)
  assert.deepEqual(errors,[])
})
