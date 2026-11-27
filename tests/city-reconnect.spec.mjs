import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {createApplication} from '../server/application.ts'
import {observeCity} from './civic-controls.mjs'

test('two browsers keep the same city through a delayed update and a lost command receipt',{timeout:120000},async()=>{
  const store=new ChessStore('.',{memory:true}),app=createApplication(store),server=app.createServer()
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const base='http://127.0.0.1:'+server.address().port
  let browser
  try{
    browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
    async function pageFor(username){
      const page=await browser.newPage({viewport:{width:600,height:420},reducedMotion:'reduce'})
      const r=await page.request.post(base+'/api/signup',{data:{username,password:'fixture',confirm:'fixture'}})
      assert.equal(r.status(),201)
      await observeCity(page)
      return page
    }
    const sender=await pageFor('Oak walker'),observer=await pageFor('Elm walker')
    let dropped=false,connections=0
    await sender.routeWebSocket('**/api/world/live?**',client=>{
      const upstream=client.connectToServer();connections++
      let commandId,closed=false
      client.onClose(()=>{closed=true;upstream.close()})
      client.onMessage(raw=>{
        const message=JSON.parse(raw)
        if(message.type==='command'&&message.action==='chat')commandId=message.id
        upstream.send(raw)
      })
      upstream.onMessage(raw=>{
        const message=JSON.parse(raw)
        if(!dropped&&message.type==='ack'&&message.id===commandId){
          closed=true;dropped=true;client.close({code:4000});upstream.close();return
        }
        // Fixed one-way delay also preserves the order of WebSocket frames.
        setTimeout(()=>{if(!closed)client.send(raw)},65)
      })
    })
    await Promise.all([sender.goto(base+'/chess/world.html?debug=1'),observer.goto(base+'/chess/world.html')])
    for(const page of [sender,observer])await page.waitForFunction(()=>window.walkObservation?.graphicsReady,null,{timeout:60000})
    const from=await sender.evaluate(()=>window.walkObservation.view.you.z)
    await sender.keyboard.down('w')
    try{
      await observer.waitForFunction(z=>window.walkObservation.view.players.some(p=>p.name==='Oak walker'&&Math.abs(p.z-z)>.2),from)
    }finally{await sender.keyboard.up('w')}
    const message='Meet by the square'
    await sender.getByRole('textbox',{name:'Message'}).fill(message)
    await sender.locator('#world-chat-form button').click()
    await observer.locator('#world-messages li').filter({hasText:message}).waitFor()
    await sender.waitForFunction(()=>document.querySelector('#world-chat-form input').value==='')
    assert.ok(dropped&&connections>=2)
    assert.equal(await sender.locator('#world-messages li').filter({hasText:message}).count(),1)
    assert.equal(await observer.locator('#world-messages li').filter({hasText:message}).count(),1)
    assert.equal(await sender.evaluate(()=>window.walkObservation.view.id),await observer.evaluate(()=>window.walkObservation.view.id))
    await sender.bringToFront()
    await sender.locator('.world-diagnostics').filter({hasText:/position corrections/}).waitFor({timeout:12000}).catch(async error=>{
      const state=await sender.evaluate(()=>({panel:document.querySelector('.world-diagnostics')?.outerHTML,visible:document.visibilityState,graphics:window.walkObservation?.graphicsReady,notice:document.querySelector('#world-unavailable')?.innerText}))
      throw Error(JSON.stringify(state),{cause:error})
    })
  }finally{
    await browser?.close();app.drain();server.closeAllConnections()
    await new Promise(resolve=>server.close(resolve));store.close()
  }
})
