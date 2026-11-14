import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp,rm,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:net'
import {chromium} from 'playwright'

async function fixture(t,args=[]){
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r))
 const dir=await mkdtemp(join(tmpdir(),'chess-casino-ui-')),base=`http://127.0.0.1:${port}`
 const child=spawn(process.execPath,['dist/server.mjs'],{env:{...process.env,DATA_DIR:dir,PORT:String(port)},stdio:'ignore'})
 t.after(async()=>{if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done}await rm(dir,{recursive:true,force:true})})
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,40))}
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage',...args]});t.after(()=>browser.close())
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 const signup=await page.request.post(base+'/api/signup',{data:{username:'CasinoQA',password:'fixture',confirm:'fixture'}});assert.equal(signup.status(),201)
 return {page,base,errors,view:async()=>(await page.request.get(base+'/api/casino')).json()}
}

test('dice fallback restores the same settled throw after reload; lost replies reconcile without another debit',async t=>{
 const {page,base,view,errors}=await fixture(t,['--disable-webgl'])
 await page.goto(base+'/chess/dice.html');await page.locator('.webgl-unavailable').waitFor()
 await page.locator('#stake').fill('25');await page.getByRole('button',{name:'Choose face 3',exact:true}).click()
 // The server commits, then the browser loses that response.
 await page.route('**/api/casino/bet',async route=>{await route.fetch();await route.abort('failed');await page.unroute('**/api/casino/bet')})
 await page.locator('#place-bet').click();await page.locator('[data-phase="ready"]').waitFor()
 const before=await view();assert.equal(before.nextSequence,2);assert.equal(before.recent.length,1)
 await page.reload();await page.locator('[data-phase="ready"]').waitFor()
 assert.deepEqual(await view(),before)
 await page.locator('#roll-die').click();await page.locator('[data-phase="result"]').waitFor()
 assert.deepEqual(await view(),before);assert.match(await page.locator('#round-result').textContent(),new RegExp('Face '+before.recent[0].result))
 await page.reload();await page.locator('[data-phase="idle"]').waitFor();assert.deepEqual(await view(),before)
 // Invalid and unauthenticated requests cannot mutate a wallet.
 const invalid=await page.request.post(base+'/api/casino/bet',{data:{game:'dice',stake:1.5,choice:1,sequence:2,requestId:'invalid-stake-fixture'}});assert.equal(invalid.status(),400)
 assert.deepEqual(await view(),before);assert.deepEqual(errors,[])
})

test('physical dice controls, bounded camera and saved throw work with WebGL on desktop and mobile',async t=>{
 const {page,base,view,errors}=await fixture(t,['--use-angle=swiftshader','--enable-webgl'])
 await page.goto(base+'/chess/dice.html');await page.locator('.scene-ready').waitFor({timeout:45000})
 await page.getByRole('button',{name:'Rules',exact:true}).click();assert.equal(await page.locator('#table-rules .casino-rules p').first().isVisible(),true);assert.match(await page.locator('#table-rules').textContent(),/1% of positive profit/);await page.getByRole('button',{name:'Close table information'}).click()
 await page.locator('#dice-canvas').focus();await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>Number(document.querySelector('canvas').dataset.pitch)>.02,{timeout:30000})
 await page.getByRole('button',{name:'Center view',exact:true}).click()
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500)
 for(const id of ['offer','stake-25','face-6','amount']){const box=await page.locator(`[data-control="${id}"]`).boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=391,`${id} fits the portrait table`)}
 await page.getByRole('button',{name:'Stake 25 coins',exact:true}).click();await page.getByRole('button',{name:'Choose face 3',exact:true}).click();await page.getByRole('button',{name:'Offer coins',exact:true}).click()
 await page.locator('[data-phase="ready"]').waitFor({timeout:30000});const settled=await view()
 await page.mouse.move(0,0);await page.waitForTimeout(200);assert.equal(await page.locator('.silent-room').getAttribute('data-phase'),'ready')
 assert.equal(await page.locator('#dice-canvas').getAttribute('data-camera-locked'),'true');await page.locator('#dice-canvas').focus();await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#dice-canvas').getAttribute('data-pitch'),'0.000');await page.mouse.move(190,260);await page.mouse.down();await page.mouse.move(240,310);await page.mouse.up();await page.locator('[data-phase="result"]').waitFor({timeout:30000});assert.equal(await page.locator('#dice-canvas').getAttribute('data-camera-locked'),'false');assert.deepEqual(await view(),settled);assert.deepEqual(errors,[])
})

test('roulette selections, stake, spin and receipt use the persisted casino API',async t=>{
 const {page,base,view,errors}=await fixture(t)
 await page.goto(base+'/chess/roulette.html');await page.locator('#stake').waitFor()
 await page.getByRole('button',{name:'Halve stake',exact:true}).click();assert.equal(await page.locator('#stake').inputValue(),'50')
 await page.getByRole('button',{name:'Double stake',exact:true}).click();assert.equal(await page.locator('#stake').inputValue(),'100')
 await page.getByRole('button',{name:'Maximum affordable stake',exact:true}).click();assert.equal(await page.locator('#stake').inputValue(),'480')
 await page.locator('[data-outside=black]').hover();assert.equal(await page.locator('[data-wheel-pocket].pocket-preview').count(),18)
 await page.getByRole('button',{name:'Bet on 17',exact:true}).click();assert.equal(await page.locator('[data-wheel-pocket].pocket-preview').count(),1);assert.equal(await page.locator('[data-pocket="17"]').getAttribute('aria-pressed'),'true')
 await page.locator('#stake').fill('25')
 if(process.env.CASINO_SCREENSHOT_DIR){await mkdir(process.env.CASINO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.CASINO_SCREENSHOT_DIR+'/roulette-desktop.png',fullPage:true})}
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#place-bet').click();await page.locator('.spinning').waitFor()
 assert.equal(await page.locator('#stake').isDisabled(),true);assert.equal(await page.locator('#repeat-wager').isDisabled(),true);assert.equal(await page.locator('[data-pocket="17"]').isDisabled(),true)
 await page.locator('#round-result:not([hidden])').waitFor()
 const state=await view();assert.equal(state.nextSequence,2);assert.equal(state.recent[0].choice,17);assert.equal(state.recent[0].stake,25)
 assert.equal(await page.locator('#pocket-readout').textContent(),state.recent[0].result===0?'The rift':String(state.recent[0].result))
 assert.equal(await page.locator(`[data-wheel-pocket="${state.recent[0].result}"].pocket-landed`).count(),1)
 assert.equal(await page.locator('.roulette-ball').evaluate(b=>b.style.top),'16.2%')
 await page.locator('[data-outside=black]').click();await page.locator('#stake').fill('100');await page.getByRole('button',{name:'Repeat last',exact:true}).click();assert.equal(await page.locator('#stake').inputValue(),'25');assert.equal(await page.locator('[data-pocket="17"]').getAttribute('aria-pressed'),'true');assert.deepEqual(await view(),state)
 if(process.env.CASINO_SCREENSHOT_DIR)await page.screenshot({path:process.env.CASINO_SCREENSHOT_DIR+'/roulette-result.png',fullPage:true})
 await page.setViewportSize({width:390,height:844});await page.locator('.roulette-betting').scrollIntoViewIfNeeded()
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'phone has no horizontal overflow')
 for(const b of await page.locator('.number-grid button').all()){const r=await b.boundingBox();assert.ok(r.width>=38&&r.height>=43,'phone number keys remain tappable')}
 if(process.env.CASINO_SCREENSHOT_DIR){await page.screenshot({path:process.env.CASINO_SCREENSHOT_DIR+'/roulette-mobile.png',fullPage:true});await page.locator('.roulette-betting').screenshot({path:process.env.CASINO_SCREENSHOT_DIR+'/roulette-mobile-board.png'})}
 await page.reload();await page.getByRole('button',{name:'View history',exact:true}).click();await page.locator('.history-round').waitFor();assert.deepEqual(await view(),state);await page.getByRole('button',{name:'Close roulette history'}).click()
 await page.getByRole('button',{name:'Repeat last',exact:true}).click();await page.locator('#place-bet').click();await page.locator('.spinning').waitFor();await page.waitForFunction(()=>document.querySelector('.roulette-display').getBoundingClientRect().y<60)
 await page.locator('#round-result:not([hidden])').waitFor();assert.equal((await view()).nextSequence,3);assert.match(await page.locator('#spin-caption').textContent(),/coins/);assert.equal(await page.locator('#roulette-next').isVisible(),true);assert.deepEqual(errors,[])
})
