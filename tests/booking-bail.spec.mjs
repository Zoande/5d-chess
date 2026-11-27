import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {chromium} from 'playwright'
import {createApplication} from '../server/application.ts'
import {ChessStore} from '../server/storage.ts'
import {book} from '../server/custody.ts'
import {at} from '../src/world/civic-venues.ts'
import {observeCity,browserWalker} from './civic-controls.mjs'

test('a visitor uses the booking officer to bail out another player',{timeout:150000},async()=>{
  const store=new ChessStore('.',{memory:true}),app=createApplication(store),server=createServer(app.handle)
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  let browser
  try{
    const base='http://127.0.0.1:'+server.address().port
    browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
    const page=await browser.newPage({viewport:{width:940,height:700}}),errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await observeCity(page)
    assert.equal((await page.request.post(base+'/api/signup',{data:{username:'Bail Visitor',password:'local-test',confirm:'local-test'}})).status(),201)
    store.transaction(tx=>{
      tx.users.get('Bail Visitor').wallet.coins=1500
      for(const [i,name] of ['Timed Guest','Puzzle Guest','Locked Guest'].entries()){
        tx.users.add(name,{name,hash:'',salt:''})
        book(tx,name,4,Date.now(),i>0,i===2)
      }
    })
    await page.goto(base+'/chess/world.html?go=prison')
    await page.locator('#city-world[data-zone=station]').waitFor({timeout:60000})
    await page.locator('#world-connection').waitFor({state:'hidden',timeout:60000})
    const walker=browserWalker(page)
    await walker.walk(at('station',4.65,.68));await walker.use('booking')
    const dialog=page.locator('dialog[open]')
    await dialog.getByRole('heading',{name:'Booking & bail'}).waitFor()
    await dialog.getByText('Moderation release only',{exact:true}).waitFor()
    assert.equal(await dialog.getByRole('button',{name:/^Bail /}).count(),2)
    assert.ok(!(await dialog.innerText()).includes('Puzzle Guest'))
    if(process.env.BAIL_SCREENSHOT)await page.screenshot({path:process.env.BAIL_SCREENSHOT})
    await dialog.getByRole('button',{name:'Bail (1,000 coins)'}).click()
    await dialog.getByRole('status').filter({hasText:'Inmate 02 was released on bail.'}).waitFor()
    await dialog.getByText('Your banked balance · 500 coins',{exact:true}).waitFor()
    assert.equal(await dialog.getByRole('button',{name:/^Bail /}).count(),1)
    assert.ok(!store.metadataValue('meridianBookings').some(b=>b.user==='Puzzle Guest'))
    assert.deepEqual(errors,[])
  }finally{
    await browser?.close();app.drain();server.closeAllConnections();await new Promise(r=>server.close(r));store.close()
  }
})
