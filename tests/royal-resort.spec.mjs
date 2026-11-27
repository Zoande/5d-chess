import {observeWire} from './live-wire.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {pack,carry} from '../server/city-inventory.ts'
import {createApplication} from '../server/application.ts'
import {site} from '../src/world/model.ts'

test('a guest books at reception, rides the lift and plays the arcade through the city UI',{timeout:180_000},async()=>{
  const db=new ChessStore('.',{memory:true}),app=createApplication(db),server=app.createServer()
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const base='http://127.0.0.1:'+server.address().port
  let browser
  try{
    browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
    const context=await browser.newContext({viewport:{width:800,height:600},reducedMotion:'reduce'})
    assert.equal((await context.request.post(base+'/api/signup',{data:{username:'ResortGuest',password:'fixture',confirm:'fixture'}})).status(),201)
    async function world(action,data={}){
      const response=await context.request.post(base+'/api/world/'+action,{data:{scene:true,...data}})
      assert.ok(response.ok(),await response.text())
      return response.json()
    }
    db.transaction(u=>carry(pack(u.users.get('ResortGuest')),'cash',12))
    let v=await world('teleport',{to:'casino'})
    // Walk using real server movement before opening the page at each counter.
    async function walk(x,z){
      const goal=site(v.you.zone,x,z)
      for(let i=0;i<80&&Math.hypot(v.you.x-goal.x,v.you.z-goal.z)>.07;i++){
        await new Promise(r=>setTimeout(r,130))
        v=await world('presence',{world:v.id,...goal,yaw:0})
      }
      assert.ok(Math.hypot(v.you.x-goal.x,v.you.z-goal.z)<.09)
    }
    const errors=[]
    async function visit(label){
      const page=await context.newPage();observeWire(page)
      page.on('pageerror',e=>errors.push(e.message))
      await page.goto(base+'/chess/world.html')
      await page.getByRole('button',{name:label}).click({timeout:45000})
      await page.getByRole('dialog').waitFor()
      return page
    }
    await walk(-6.25,-4.96)
    let page=await visit(/Book a room/)
    await page.getByRole('button',{name:'305 · Book'}).click()
    await page.getByText(/Your key opens room 305/).waitFor()
    await page.close()
    v=await world('presence');await walk(2.9,5.85)
    page=await visit(/Hotel lift/)
    await page.getByRole('button',{name:/02 Gallery/}).click()
    await page.locator('#city-world[data-zone="hotel:2"]').waitFor()
    await page.close()
    v=await world('presence')
    await walk(0,5.85);await walk(0,-18);await walk(7.45,-18)
    page=await visit(/Play Starlight Slots/)
    await page.getByRole('button',{name:'Spin reels'}).click()
    await page.locator('.royal-service [role=status]').getByText(/No payout|Paid/).waitFor()
    assert.equal(await page.locator('.royal-reels b').count(),3)
    await page.close()
    v=await world('teleport',{to:'casino'});await walk(2.9,5.85)
    await world('use',{target:'resort:lift'});v=await world('resort-floor',{floor:'hotel:3'})
    await walk(0,4.78);await walk(-5.6,4.78)
    page=await visit(/Play three-ball pool/)
    await page.getByRole('button',{name:'Shoot',exact:true}).click()
    await page.getByText(/balls left|Table cleared/).waitFor()
    await page.close()
    v=await world('presence')
    await walk(0,4.78);await walk(0,-16.5);await walk(-2.45,-16.5)
    await walk(-2.45,-14.7);await walk(-4.75,-14.7);await walk(-4.75,-11.43)
    page=await visit(/Open dresser drawer/)
    await page.getByLabel('Quantity').fill('4')
    await page.getByRole('button',{name:'Put away Cash (×12)'}).click()
    await page.getByRole('button',{name:'Take Cash (×4)'}).click()
    await page.getByRole('button',{name:'Take Cash (×3)'}).waitFor()
    await page.getByRole('button',{name:'Put away Cash (×9)'}).waitFor()
    assert.deepEqual(errors,[])
  }finally{
    await browser?.close();app.drain();server.closeAllConnections()
    await new Promise(resolve=>server.close(resolve));db.close()
  }
})


test('two browser guests draw and check through the same poker hand',{timeout:90_000},async()=>{
  const clock=Date.now
  let elapsed=0
  Date.now=()=>clock()+elapsed
  const db=new ChessStore('.',{memory:true}),app=createApplication(db),server=app.createServer()
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  let browser
  try{
    const base='http://127.0.0.1:'+server.address().port
    browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
    async function seat(name,width){
      const context=await browser.newContext({viewport:{width,height:700}})
      assert.equal((await context.request.post(base+'/api/signup',{data:{username:name,password:'fixture',confirm:'fixture'}})).status(),201)
      let view
      async function act(action,data={}){
        const res=await context.request.post(base+'/api/world/'+action,{data:{scene:true,...data}})
        assert.ok(res.ok(),await res.text());view=await res.json()
      }
      async function move(x,z){
        const goal=site(view.you.zone,x,z)
        for(let i=0;i<16&&Math.hypot(view.you.x-goal.x,view.you.z-goal.z)>.08;i++){
          elapsed+=900;await act('presence',{world:view.id,...goal,yaw:0})
        }
      }
      await act('teleport',{to:'casino'});await move(2.9,5.85)
      await act('use',{target:'resort:lift'});await act('resort-floor',{floor:'hotel:2'})
      await move(0,5.85);await move(0,-18);await move(-3.2,-18);await move(-4.65,-15.1)
      const page=await context.newPage();observeWire(page)
      await page.goto(base+'/chess/world.html')
      await page.getByRole('button',{name:/Five-card draw/}).click()
      return page
    }
    const a=await seat('RoyalNorth',880),b=await seat('RoyalSouth',390)
    await a.getByRole('button',{name:/Take a seat/}).click()
    await b.getByText(/Waiting for a second player/).waitFor()
    await b.getByRole('button',{name:/Take a seat/}).click()
    await a.getByRole('button',{name:'Finish draw'}).waitFor()
    assert.equal(await a.locator('.royal-card.back').count(),5)
    assert.equal(await b.locator('.royal-card.back').count(),5)
    await a.locator('.royal-discard').first().click()
    await a.getByRole('button',{name:'Finish draw'}).click()
    await a.getByText('Waiting for the other player.').waitFor()
    // The peer must receive the newer table revision before submitting its draw.
    await new Promise(r=>observeWire(b).once('frame',r))
    await b.getByRole('button',{name:'Finish draw'}).click()
    await a.getByRole('button',{name:'Check',exact:true}).click()
    await b.getByRole('button',{name:'Check',exact:true}).click()
    for(const page of [a,b])await page.locator('.royal-status').getByText(/wins the pot|Split pot/).waitFor()
  }finally{
    Date.now=clock;await browser?.close();app.drain();server.closeAllConnections()
    await new Promise(r=>server.close(r));db.close()
  }
})
