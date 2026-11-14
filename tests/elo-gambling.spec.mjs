import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {createServer} from 'node:net'
import {spawn} from 'node:child_process'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {ensureAccount} from '../server/accounts.ts'
import {casinoBet} from '../server/casino.ts'
import {casinoCoins} from '../src/casino-model.ts'
import {dayKey} from '../src/collection.ts'
async function fixture(t,{webgl=false,broke=false,used=0}={}){
 const dir=await mkdtemp(join(tmpdir(),'chess-elo-ui-')),store=new ChessStore(dir),token='elo-ui-session-fixture';let round
 store.transaction(u=>{
  const account=ensureAccount({name:'EloQA',salt:'fixture',hash:'fixture',rating:{value:1800,games:20},wallet:{coins:broke?1:5000,starterGranted:true,inventory:[],loadout:{icon:'default',pieces:{}}}})
  if(broke)round=casinoBet(account,[account],{requestId:'elo-ui-broke-fixture',sequence:1,game:'dice',choice:1,stake:1},Date.now(),6).round
  else account.eloGambling={day:dayKey(),allowed:true,stage:'offered',used,lifetimeLost:7,reason:'chance',offerId:'elo-ui-offer'}
  u.users.add(account.name,account);u.putSession(createHash('sha256').update(token).digest('hex'),{user:account.name,expires:Date.now()+600000})
 });store.close()
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const base=`http://127.0.0.1:${port}`
 const child=spawn(process.execPath,['dist/server.mjs'],{env:{...process.env,DATA_DIR:dir,PORT:String(port)},stdio:'ignore'})
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage',...(webgl?['--use-angle=swiftshader','--enable-webgl']:['--disable-webgl'])]})
 t.after(async()=>{await browser.close();if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done}await rm(dir,{recursive:true,force:true})})
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,40))}
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'multiverse_session',value:token,domain:'127.0.0.1',path:'/'}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 if(round)await page.addInitScript(r=>sessionStorage.setItem('5d-casino-presentation:EloQA:dice',JSON.stringify(r)),round)
 await page.goto(base+'/chess/dice.html');await page.locator(webgl?'.scene-ready':'.webgl-unavailable').waitFor({timeout:45000})
 const view=async()=>(await page.request.get(base+'/api/casino/elo')).json(),casino=async()=>(await page.request.get(base+'/api/casino')).json()
 return {page,view,casino,errors,base}
}

test('a completed broke coin throw requests the soul encounter; refusing persists across reload',async t=>{
 const {page,view,errors}=await fixture(t,{broke:true})
 await page.locator('[data-phase=ready]').waitFor();await page.locator('#roll-die').click();await page.locator('[data-table-mode=offer]').waitFor()
 assert.match(await page.locator('#encounter-question').textContent(),/deal with your soul/);assert.equal((await view()).reason,'broke')
 await page.getByRole('button',{name:'No',exact:true}).click();await page.locator('[data-table-mode=normal]').waitFor();assert.equal((await view()).allowed,false)
 await page.reload();await page.locator('.webgl-unavailable[data-table-mode=normal]').waitFor();assert.equal((await view()).allowed,false);assert.doesNotMatch(await page.locator('body').innerText(),/Keeper/i);assert.deepEqual(errors,[])
})

test('consented Elo wagers wrap increments, survive a lost reply/reload, pay no tax and close after the tenth',async t=>{
 const {page,view,casino,errors}=await fixture(t,{used:9})
 await page.locator('[data-table-mode=offer]').waitFor();assert.match(await page.locator('#encounter-question').textContent(),/try something new/)
 await page.getByRole('button',{name:'Yes',exact:true}).click();await page.locator('.silent-room[data-table-mode=elo]').waitFor();assert.equal(await page.locator('#stake').inputValue(),'0')
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'+50 Elo',exact:true}).click();assert.equal(await page.locator('#stake').inputValue(),'50')
 await page.getByRole('button',{name:'Rules',exact:true}).click();assert.match(await page.locator('#elo-rules').textContent(),/pay no tax/);await page.getByRole('button',{name:'Close table information'}).click()
 const before=await view(),coins=(await casino()).coins
 await page.route('**/api/casino/elo/bet',async route=>{await route.fetch();await route.abort('failed');await page.unroute('**/api/casino/elo/bet')})
 await page.getByRole('button',{name:'DEAL',exact:true}).click();await page.locator('[data-phase=ready]').waitFor();const settled=await casino(),round=settled.recent[0]
 assert.equal(round.currency,'elo');assert.equal(round.tax,0);assert.ok((await page.locator('#elo-fallback-quote').textContent()).includes(casinoCoins(round.coinReward)));assert.equal(round.credited,round.won?before.quotes[50]:0);assert.equal(settled.coins,coins+round.credited)
 assert.equal((await view()).used,10);assert.equal((await view()).allowed,false)
 await page.reload();await page.locator('[data-phase=ready][data-table-mode=elo]').waitFor();assert.deepEqual(await casino(),settled)
 await page.locator('#dice-canvas').focus();await page.keyboard.press(' ');await page.locator('[data-phase=result][data-table-mode=normal]').waitFor()
 assert.deepEqual(await casino(),settled);const after=await view();assert.equal(after.elo,before.elo-(round.won?0:50));assert.equal(after.lifetimeLost,7+(round.won?0:50));assert.deepEqual(errors,[])
})

test('the 3D offer has only Yes/No keys and morphs to a mobile-safe Elo table',async t=>{
 const {page,errors}=await fixture(t,{webgl:true})
 await page.locator('.scene-ready[data-table-mode=offer]').waitFor();await page.waitForTimeout(1500)
 const visible=await page.locator('[data-control]:visible').evaluateAll(bs=>bs.map(b=>b.dataset.control));assert.deepEqual(visible.sort(),['no','yes'])
 if(process.env.CASINO_SCREENSHOT_DIR){await mkdir(process.env.CASINO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.CASINO_SCREENSHOT_DIR+'/elo-offer.png'})}
 await page.getByRole('button',{name:'Yes, explore Elo wagers',exact:true}).click();await page.locator('.silent-room[data-table-mode=elo]').waitFor();await page.getByRole('button',{name:'Add 50 Elo',exact:true}).click()
 assert.equal(await page.locator('#stake').inputValue(),'50');assert.equal(await page.locator('[data-control=stake-25]').isVisible(),false)
 await page.waitForTimeout(2000)
 if(process.env.CASINO_SCREENSHOT_DIR)await page.screenshot({path:process.env.CASINO_SCREENSHOT_DIR+'/elo-table.png'})
 const beforeResize=Number(await page.locator('#dice-canvas').getAttribute('data-frame'));await page.setViewportSize({width:390,height:844});await page.waitForFunction(before=>Number(document.querySelector('#dice-canvas').dataset.frame)>before,beforeResize,{timeout:30000})
 for(const id of ['elo-plus-1','elo-plus-10','elo-plus-50','offer']){const r=await page.locator(`[data-control="${id}"]`).boundingBox();assert.ok(r&&r.x>=0&&r.x+r.width<=391&&r.height>=44,id+' fits portrait and remains tappable')}
 if(process.env.CASINO_SCREENSHOT_DIR)await page.screenshot({path:process.env.CASINO_SCREENSHOT_DIR+'/elo-mobile.png'})
 assert.deepEqual(errors,[])
})
