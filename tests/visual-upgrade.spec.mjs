import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises'
import {scryptSync} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:net'
import {chromium} from 'playwright'

test('visual upgrade: code slots, notification dropdowns, daily deals and responsive motion',async t=>{
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r))
 const data=await mkdtemp(join(tmpdir(),'chess-visual-')),base=`http://127.0.0.1:${port}`
 await writeFile(join(data,'multiplayer.json'),JSON.stringify({users:[{name:'Visual',salt:'fixture',hash:scryptSync('test','fixture',64).toString('hex'),notifications:[{id:'notice-fixture',kind:'turn',title:'Your timeline is waiting',detail:'Make your next move.',code:'ABCD',created:Date.now(),read:false}],wallet:{starterGranted:true,coins:50000,inventory:[],loadout:{icon:'default',pieces:{}}}}],rooms:[],logins:{},listings:[]}))
 const server=spawn(process.execPath,['dist/server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:data},stdio:'ignore'})
 const browser=await chromium.launch({headless:true})
 t.after(async()=>{await browser.close();server.kill();await new Promise(r=>server.once('exit',r));await rm(data,{recursive:true,force:true})})
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/me')).ok)break}catch{}await new Promise(r=>setTimeout(r,30))}
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await context.request.post(base+'/api/login',{data:{username:'Visual',password:'test'}})
 await page.goto(base+'/chess/lobby.html');await page.locator('.home-deal').first().waitFor()
 await page.locator('#quick-code').fill('aBcD')
 assert.deepEqual(await page.locator('.slot-display b').allTextContents(),['A','B','C','D'])
 await page.locator('.header-bell').click();await page.locator('#notification-popover .popover-notice.unread').waitFor()
 await page.locator('[data-read-notices]').click();await page.waitForFunction(()=>!document.querySelector('.popover-notice.unread'))
 assert.equal((await (await context.request.get(base+'/api/notifications')).json()).unread,0)
 assert.equal(new URL(page.url()).hash,'')
 await page.keyboard.press('Escape');assert.equal(await page.locator('#notification-popover').isVisible(),false)
 await page.locator('.account-menu summary').click();await page.locator('.account-menu [data-open-notifications]').click()
 assert.equal(await page.locator('#notification-popover').isVisible(),true)
 await page.locator('.notice-close').click()
 await page.locator('.spin-thumb').click();await page.locator('.wheel-preview-dialog').waitFor()
 assert.equal((await (await context.request.get(base+'/api/economy')).json()).spinReady,true)
 await mkdir('.playwright',{recursive:true})
 await page.screenshot({path:'.playwright/wheel-preview.png'})
 await page.locator('.wheel-preview-dialog [data-close]').click()
 await page.screenshot({path:'.playwright/home-desktop.png',fullPage:true})
 await page.locator('.spin-now').click();await page.locator('.reward-dialog[open]').waitFor()
 await page.screenshot({path:'.playwright/wheel-spinning.png'})
 await page.getByRole('button',{name:'Skip animation'}).click();await page.locator('.reward-result').waitFor({state:'visible'});await page.keyboard.press('Escape')
 await page.goto(base+'/chess/collection.html#shop');await page.locator('[data-daily-buy]').first().waitFor()
 assert.equal(await page.locator('.daily-deal-card').count(),4)
 const economy=await (await context.request.get(base+'/api/economy')).json(),deal=economy.dailyDeals[0]
 await page.locator(`[data-daily-buy="${deal.itemId}"]`).click();await page.getByRole('button',{name:'Buy item',exact:true}).click()
 await page.locator('.transaction-dialog').waitFor({state:'hidden'})
 const after=await (await context.request.get(base+'/api/economy')).json()
 assert.equal(after.wallet.coins,economy.wallet.coins-deal.price)
 assert.ok(after.wallet.inventory.some(o=>o.itemId===deal.itemId))
 await page.screenshot({path:'.playwright/shop-desktop.png',fullPage:true})
 for(const width of [768,393,320]){
  await page.setViewportSize({width,height:900})
  for(const path of ['/chess/lobby.html','/chess/collection.html#shop']){
   await page.goto(base+path);await page.locator(path.includes('lobby')?'.home-deal':'[data-daily-buy]').first().waitFor()
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,`${path} overflows at ${width}`)
   if(width===393)await page.screenshot({path:'.playwright/'+(path.includes('lobby')?'home':'shop')+'-mobile.png',fullPage:true})
  }
 }
 await page.emulateMedia({reducedMotion:'reduce'})
 assert.equal(await page.locator('.crate-card .chess-chest').first().evaluate(e=>getComputedStyle(e).animationName),'none')
 assert.deepEqual(errors,[])
})
