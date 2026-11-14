import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {scryptSync} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:net'
import {chromium} from 'playwright'
import {ITEMS} from '../src/collection.ts'

test('expanded shop: monthly purchase, continuous animations, one-time welcome, equipment and laptop fit',async t=>{
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r))
 const data=await mkdtemp(join(tmpdir(),'chess-expanded-')),base=`http://127.0.0.1:${port}`
 const inventory=ITEMS.map((item,n)=>({uid:n.toString(16).padStart(24,'0'),itemId:item.id,acquired:Date.now(),pending:false}))
 await writeFile(join(data,'multiplayer.json'),JSON.stringify({users:[{name:'Collector',salt:'fixture',hash:scryptSync('test','fixture',64).toString('hex'),rating:{value:1700,games:30},wallet:{starterGranted:true,coins:50000,inventory,loadout:{icon:'icon-dragon',pieces:{N:'skin-neon'}}}}],rooms:[],logins:{},listings:[]}))
 const server=spawn(process.execPath,['dist/server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:data},stdio:'ignore'})
 const browser=await chromium.launch({headless:true})
 t.after(async()=>{await browser.close();if(server.exitCode===null){const exited=new Promise(r=>server.once('exit',r));server.kill();await exited}await rm(data,{recursive:true,force:true})})
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/me')).ok)break}catch{}await new Promise(r=>setTimeout(r,30))}
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.request.post(base+'/api/login',{data:{username:'Collector',password:'test'}})
 await page.goto(base+'/chess/collection.html#shop');await page.locator('#starter-note').waitFor()
 await page.waitForFunction(()=>document.querySelectorAll('[data-crate-card]').length===15)
 await page.reload();await page.locator('.monthly-grid .crate-card').first().waitFor()
 assert.equal(await page.locator('#starter-note').isVisible(),false)
 assert.equal((await (await page.request.get(base+'/api/economy')).json()).wallet.shopSeen,true)
 await page.evaluate(()=>{
  window.crateNode=document.querySelector('[data-crate-card=monthly-eclipse] .chess-chest')
  window.weeklyNode=document.querySelector('#featured-items .item-picture')
  window.crateAnimation=window.crateNode.getAnimations()[0]
 })
 await page.locator('[data-crate-card=monthly-eclipse] [data-finish="1"]').click()
 assert.equal(await page.evaluate(()=>window.crateNode===document.querySelector('[data-crate-card=monthly-eclipse] .chess-chest')),true)
 assert.equal(await page.evaluate(()=>window.crateAnimation===window.crateNode.getAnimations()[0]),true)
 const before=await (await page.request.get(base+'/api/economy')).json()
 await page.locator('[data-crate-buy=monthly-eclipse]').click()
 assert.equal(await page.locator('.purchase-crate-preview').getAttribute('data-style'),'1')
 // Evenly spaced visual draws must show the entire mixed pool, including rare items.
 // This controls only the browser preview; the server chooses the real reward independently.
 await page.evaluate(()=>{let draw=0;window.originalPreviewRandom=Math.random;Math.random=()=>((draw++%30)+.5)/30})
 await page.getByRole('button',{name:'Buy & open'}).click();await page.locator('.reward-dialog[open]').waitFor()
 assert.equal(await page.locator('.reward-dialog').getAttribute('data-style'),'1')
 await page.getByRole('button',{name:'Skip animation'}).click();await page.locator('.reward-result:not([hidden])').waitFor()
 const shown=await page.locator('.reel-card').evaluateAll(cards=>cards.map(c=>c.dataset.item))
 const exclusiveIds=ITEMS.filter(i=>i.monthly).map(i=>i.id)
 assert.ok(exclusiveIds.every(id=>shown.includes(id)))
 await page.evaluate(()=>{Math.random=window.originalPreviewRandom})
 if(await page.getByRole('button',{name:'Keep copy',exact:true}).count())await page.getByRole('button',{name:'Keep copy',exact:true}).click();else await page.getByRole('button',{name:'Continue',exact:true}).click()
 const after=await (await page.request.get(base+'/api/economy')).json(),drop=after.recent[0]
 assert.equal(after.wallet.coins,before.wallet.coins-1800)
 assert.ok(ITEMS.find(i=>i.id===drop.itemId).monthly)
 assert.equal(await page.evaluate(()=>window.crateNode===document.querySelector('[data-crate-card=monthly-eclipse] .chess-chest')),true)
 assert.equal(await page.evaluate(()=>window.weeklyNode===document.querySelector('#featured-items .item-picture')),true)
 assert.equal(await page.locator('.crate-card[data-crate-card=monthly-eclipse]').getAttribute('data-style'),'1')
 await page.locator('.collection-tabs a[href="#inventory"]').click()
 const uid=id=>inventory.find(o=>o.itemId===id).uid
 assert.equal(await page.locator('[data-slot]').count(),7)
 await page.locator('[data-slot=N]').click()
 await page.locator(`[data-preview="${uid('skin-frost')}"]`).click()
 await page.locator('[data-layer=shape]').click()
 await page.locator(`[data-preview="${uid('shape-origami')}"]`).click()
 assert.deepEqual(await page.locator('.look-summary strong').allTextContents(),['Frostglass','Origami'])
 assert.equal((await (await page.request.get(base+'/api/me')).json()).profile.loadout.pieces.N,'skin-neon')
 await page.locator('#equip-preview').click();await page.waitForFunction(()=>document.querySelector('#equip-preview')?.textContent==='Equipped')
 let profile=(await (await page.request.get(base+'/api/me')).json()).profile
 assert.equal(profile.loadout.pieces.N,'skin-frost');assert.equal(profile.loadout.shapes.N,'shape-origami');assert.equal(profile.loadout.shapes.K,undefined)
 await page.locator('[data-slot=icon]').click()
 await page.locator(`[data-preview="${uid('icon-moon-dragon')}"]`).click()
 await page.locator('[data-layer=frame]').click()
 await page.locator(`[data-preview="${uid('frame-night-garden')}"]`).click()
 assert.deepEqual(await page.locator('.look-summary strong').allTextContents(),['Moon Dragon','Night Garden'])
 assert.equal(await page.locator('.preview-canvas .frame-night-garden').count(),1)
 await page.locator('#equip-preview').click();await page.waitForFunction(()=>document.querySelector('#equip-preview')?.textContent==='Equipped')
 profile=(await (await page.request.get(base+'/api/me')).json()).profile
 assert.equal(profile.loadout.icon,'icon-moon-dragon');assert.equal(profile.loadout.frame,'frame-night-garden')
 assert.equal(await page.locator('.profile-avatar .frame-night-garden').count(),1)
 await page.reload();await page.locator('[data-slot=N]').click();await page.locator('[data-layer=shape]').click();assert.equal(await page.locator('#equip-preview').textContent(),'Equipped')
 assert.equal(await page.locator('.preview-set-roster svg').count(),6)
 await page.locator('.collection-tabs a[href="#shop"]').click()
 await page.locator('[data-crate-pool=skin-bronze]').click()
 assert.equal(await page.getByRole('button',{name:'Close rewards and odds'}).isVisible(),true)
 assert.ok(await page.locator('.crate-reward-catalog .skin-set-art svg').evaluateAll(nodes=>nodes.every(node=>{const box=node.closest('.item-picture').getBoundingClientRect(),r=node.getBoundingClientRect();return r.left>=box.left-1&&r.right<=box.right+1&&r.top>=box.top-1&&r.bottom<=box.bottom+1})))
 await page.getByRole('button',{name:'Close rewards and odds'}).click()
 for(const [width,height] of [[1366,768],[1280,720]]){
  await page.setViewportSize({width,height});await page.goto(base+'/chess/lobby.html');await page.locator('.home-deal').first().waitFor()
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),`home scrolls at ${width}x${height}`)
  const invite=await page.locator('#quick-join-form').boundingBox(),activity=await page.locator('.activity-and-deals').boundingBox()
  assert.ok(invite.y>=activity.y+activity.height)
 }
 await page.setViewportSize({width:393,height:852})
 for(const path of ['collection.html#shop','collection.html#inventory','lobby.html']){
  await page.goto(base+'/chess/'+path);await page.locator('.multiverse-backdrop').waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),393,path)
 }
 assert.deepEqual(errors,[])
})
