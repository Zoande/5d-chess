import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {scryptSync} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:net'
import {chromium} from 'playwright'
import {ITEMS,CRATES,itemById} from '../src/collection.ts'

test('earned collection flow: Dutch daily spin, crate landing, duplicates, equipment and a market sale',async t=>{
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r))
 const data=await mkdtemp(join(tmpdir(),'chess-collection-')),base=`http://127.0.0.1:${port}`
 // Fixtures only: production has no coin minting endpoint or free collectible grants.
 const users=['Alice','Bob'].map(name=>({name,salt:'fixture',hash:scryptSync('test','fixture',64).toString('hex'),wallet:{starterGranted:true,coins:5000,inventory:name==='Alice'?ITEMS.map((i,n)=>({uid:n.toString(16).padStart(24,'0'),itemId:i.id,acquired:Date.now()-n,pending:false})):[],loadout:{icon:'default',pieces:{}}}}))
 await writeFile(join(data,'multiplayer.json'),JSON.stringify({users,rooms:[],logins:{},listings:[]}))
 const child=spawn(process.execPath,['dist/server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:data},stdio:'ignore'})
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']})
 t.after(async()=>{await browser.close();child.kill();await new Promise(r=>child.once('exit',r));await rm(data,{recursive:true,force:true})})
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/me')).ok)break}catch{}await new Promise(r=>setTimeout(r,30))}
 const context=await browser.newContext({viewport:{width:1440,height:950}}),page=await context.newPage(),errors=[]
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 await context.request.post(base+'/api/login',{data:{username:'Alice',password:'test'}})
 await page.goto(base+'/chess/lobby.html');await page.locator('.spin-now').waitFor()
 assert.match(await page.locator('[data-coins]').textContent(),/5,000/)
 await page.locator('.spin-now').click();await page.locator('.reward-dialog[open]').waitFor()
 await page.getByText('Reward odds',{exact:true}).click()
 await page.getByText('Wheel segments are visual. Rewards use these exact odds.').waitFor()
 await page.locator('.reward-result').waitFor({state:'visible'})
 const afterSpin=(await (await context.request.get(base+'/api/economy')).json())
 assert.equal(afterSpin.spinReady,false);assert.equal(afterSpin.recent.length,1)
 assert.equal(await page.locator('.reward-dialog.revealed').count(),1)
 await page.keyboard.press('Escape');await page.reload();await page.locator('.spin-now.used').waitFor()
 assert.match(await page.locator('.spin-now').textContent(),/Next free spin · \d\d:\d\d:\d\d/)
 await page.locator('.economy-nav').getByRole('link',{name:'Shop',exact:true}).click()
 await page.locator('[data-crate-pool=skin-bronze]').click()
 await page.locator('.crate-reward-catalog [data-inspect="skin-cathedral"]').click()
 assert.equal(await page.locator('.inspect-roster svg').count(),6)
 await page.getByRole('button',{name:'Inspect blue variant',exact:true}).click()
 assert.equal(await page.getByRole('button',{name:'Inspect blue variant',exact:true}).getAttribute('aria-pressed'),'true')
 await page.getByRole('button',{name:'Close preview'}).click()
 await page.locator('.crate-catalog-dialog [data-close]').click()
 await page.locator('[data-crate-filter=icon]').click()
 await page.locator('[data-crate-pool=icon-bronze]').click()
 assert.match(await page.locator('.crate-catalog-dialog .odds-grid').textContent(),/0.0001%/)
 await page.locator('.crate-catalog-dialog [data-close]').click()
 for(const tier of [1,2,0]){const crate=CRATES.find(c=>c.type==='icon'&&c.tier===tier);assert.match(await page.locator(`[data-crate-buy="${crate.id}"]`).textContent(),new RegExp(crate.price.toLocaleString()))}
 const beforeBox=(await (await context.request.get(base+'/api/economy')).json()).wallet
 await page.locator('[data-crate-buy=icon-bronze]').click();await page.getByRole('button',{name:'Buy & open'}).click()
 await page.locator('.reel-window.visible').waitFor()
 await page.locator('.reward-result').waitFor({state:'visible'})
 const afterBox=await (await context.request.get(base+'/api/economy')).json(),drop=afterBox.recent[0]
 assert.equal(afterBox.wallet.coins,beforeBox.coins-120);assert.equal(drop.duplicate,true)
 assert.equal(await page.locator('.reel-card').nth(34).getAttribute('data-item'),drop.itemId)
 assert.equal(await page.locator('.reel-strip').evaluate(e=>e.style.transform),`translateX(${-34*160-80}px)`)
 await page.getByRole('button',{name:'Keep copy',exact:true}).click();await page.locator('.reward-dialog').waitFor({state:'hidden'})
 const kept=await (await context.request.get(base+'/api/economy')).json();assert.equal(kept.wallet.inventory.find(o=>o.uid===drop.uid).pending,false)
 // Reload during a later reveal preserves the bought copy and exposes its pending choice.
 await page.locator('[data-crate-buy=icon-bronze]').click();await page.getByRole('button',{name:'Buy & open'}).click();await page.locator('.reward-dialog[open]').waitFor();await page.reload()
 const interrupted=await (await context.request.get(base+'/api/economy')).json(),pending=interrupted.recent[0]
 await page.locator('.collection-tabs').getByRole('link',{name:'Inventory',exact:true}).click();await page.locator('[data-slot=icon]').click()
 await page.locator(`[data-manage="${pending.itemId}"]`).first().click()
 await page.locator(`[data-refund="${pending.uid}"]`).click()
 await page.waitForFunction(uid=>!document.querySelector(`[data-refund="${uid}"]`),pending.uid)
 await page.locator('.copies-dialog [data-close]').click()
 const refunded=await (await context.request.get(base+'/api/economy')).json();assert.equal(refunded.wallet.coins,interrupted.wallet.coins+pending.refund)
 // Equip a collected icon and preview all faction variants of an equipped skin.
 const uid=users[0].wallet.inventory.find(o=>o.itemId==='icon-dragon').uid
 await page.locator(`[data-preview="${uid}"]`).click();await page.locator('#equip-preview').click()
 await page.waitForFunction(()=>document.querySelector('#equip-preview')?.textContent==='Equipped')
 assert.equal((await (await context.request.get(base+'/api/me')).json()).profile.loadout.icon,'icon-dragon')
 await page.locator('[data-slot=K]').click()
 await page.getByLabel('Search inventory').fill('mosaic')
 assert.equal(await page.locator('#inventory-grid .owned-card').count(),2)
 const skin=users[0].wallet.inventory.find(o=>o.itemId==='skin-mosaic').uid
 await page.locator(`[data-preview="${skin}"]`).click()
 for(const p of ['red','blue','yellow','green']){await page.getByRole('button',{name:p+' variant',exact:true}).click();assert.equal(await page.getByRole('button',{name:p+' variant',exact:true}).getAttribute('aria-pressed'),'true')}
 await page.locator('#equip-preview').click();await page.waitForFunction(()=>document.querySelector('#equip-preview')?.textContent==='Equipped')
 await page.locator('#equip-set').click();await page.waitForFunction(()=>document.querySelector('#equip-set')?.textContent==='Full set equipped')
 assert.equal(Object.keys((await (await context.request.get(base+'/api/me')).json()).profile.loadout.pieces).length,6)
 assert.ok(Object.values((await (await context.request.get(base+'/api/me')).json()).profile.loadout.pieces).every(id=>id==='skin-mosaic'))
 await page.getByLabel('Search inventory').fill('')
 await page.goto(base+'/chess/?local=1&players=4');await page.locator('#account-name').waitFor()
 assert.equal(await page.locator('#scene').isVisible(),true)
 // List the kept crate copy; Bob buys it through the real market page.
 await page.goto(base+'/chess/collection.html#inventory');await page.locator('[data-slot=icon]').click()
 await page.locator(`[data-manage="${drop.itemId}"]`).first().click();await page.locator(`[data-sell-copy="${drop.uid}"]`).click();await page.getByLabel('Price in coins').fill('75');const sellerNote='Collector’s copy <img src=x onerror=alert(1)> & ready to play.';await page.locator('#listing-description').fill(sellerNote);assert.equal(await page.locator('#listing-description').getAttribute('maxlength'),'240');assert.equal(await page.locator('#listing-note-count').textContent(),sellerNote.length+' / 240');await page.getByRole('button',{name:'List for sale'}).click();await page.locator('.transaction-dialog').waitFor({state:'hidden'})
 const bobContext=await browser.newContext(),bob=await bobContext.newPage();await bobContext.request.post(base+'/api/login',{data:{username:'Bob',password:'test'}})
 await bob.goto(base+'/chess/collection.html#market');await bob.locator('.market-card').first().waitFor();await bob.locator('#market-search').fill('Collector’s');assert.equal(await bob.locator('.market-seller-note').textContent(),sellerNote);assert.equal(await bob.locator('.market-seller-note img').count(),0);await bob.locator('.market-card button').click();assert.match(await bob.locator('.transaction-dialog .market-seller-note').textContent(),/Collector’s copy/);await bob.getByRole('button',{name:'Buy copy',exact:true}).last().click()
 await bob.locator('.transaction-dialog').waitFor({state:'hidden'});assert.equal((await (await bobContext.request.get(base+'/api/economy')).json()).wallet.coins,4925)
 assert.ok((await (await bobContext.request.get(base+'/api/economy')).json()).wallet.inventory.some(i=>i.uid===drop.uid))
 await bob.emulateMedia({reducedMotion:'reduce'})
 await bob.goto(base+'/chess/lobby.html');await bob.locator('.spin-now').waitFor();await bob.locator('.spin-now').click()
 await bob.locator('.reward-result').waitFor({state:'visible',timeout:2000});await bob.keyboard.press('Escape')
 const beforeEncore=await (await bobContext.request.get(base+'/api/economy')).json()
 await bob.locator('.spin-again').click();await bob.locator('[data-spin-confirm]').click()
 await bob.locator('.reward-result').waitFor({state:'visible',timeout:2000})
 const afterEncore=await (await bobContext.request.get(base+'/api/economy')).json()
 assert.equal(afterEncore.wallet.coins,beforeEncore.wallet.coins-200+(afterEncore.recent[0].coins??0));assert.equal(afterEncore.reset,beforeEncore.reset)
 await bob.keyboard.press('Escape')
 // Mobile collection pages and menus do not create horizontal scrolling.
 for(const width of [768,393,320]){await page.setViewportSize({width,height:850});for(const view of ['shop','inventory','market']){await page.goto(base+'/chess/collection.html#'+view);await page.locator('.economy-nav').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width)}}
 assert.deepEqual(errors,[])
})
