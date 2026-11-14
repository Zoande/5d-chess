import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:net'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {ensureAccount} from '../server/accounts.ts'
import {KINDS} from '../src/model.ts'

test('rotating cases, collection completion, whole-Set sale, owned cases and the 25-slot wheel work through the real server',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'chess-cases-ui-')),store=new ChessStore(dir)
 store.transaction(u=>{for(const name of ['Seller','Buyer']){u.users.add(name,ensureAccount({name,salt:'fixture',hash:'fixture',wallet:{coins:200000,starterGranted:true,shopSeen:true,inventory:name==='Seller'?KINDS.filter(k=>k!=='B').map((kind,i)=>({uid:String(i).padStart(24,'0'),itemId:'skin-neon',kind,pending:false,acquired:1})):[],cases:name==='Seller'?[{uid:'owned-case-browser-fixture',caseId:'sets-grandmaster',acquired:1}]:[],loadout:{icon:'default',pieces:{}}}}));u.putSession(createHash('sha256').update(name+'-case-token').digest('hex'),{user:name,expires:Date.now()+600000})}});store.close()
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const base=`http://127.0.0.1:${port}`,child=spawn(process.execPath,['dist/server.mjs'],{env:{...process.env,DATA_DIR:dir,PORT:String(port)},stdio:'ignore'})
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});t.after(async()=>{await browser.close();if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done}await rm(dir,{recursive:true,force:true})})
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,40))}
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'multiverse_session',value:'Seller-case-token',domain:'127.0.0.1',path:'/'}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/chess/collection.html#shop');await page.locator('#weekly-cases [data-crate-card]').first().waitFor()
 for(const [selector,count]of [['#weekly-cases [data-crate-card]',6],['#general-crates [data-crate-card]',3],['#monthly-crates [data-crate-card]',3],['#daily-case [data-crate-card]',1],['#featured-items article',4],['#daily-deal-items article',4],['#seasonal-items article',3]])assert.equal(await page.locator(selector).count(),count,selector)
 assert.doesNotMatch(await page.locator('#shop').innerText(),/\b(crates|boxes|chests)\b/i)
 if(process.env.CASES_SCREENSHOT_DIR){await mkdir(process.env.CASES_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.CASES_SCREENSHOT_DIR+'/shop.png',fullPage:true})}
 await page.goto(base+'/chess/collection.html#inventory');await page.getByRole('button',{name:'Collections / Sets',exact:true}).click();await page.getByLabel('Find a Set').fill('Night District');assert.match(await page.locator('#set-grid').textContent(),/5 \/ 6/);assert.equal(await page.locator('[data-sell-set="set-skin-neon"]').isDisabled(),true)
 await page.goto(base+'/chess/collection.html#shop');await page.locator('[data-buy-set="set-skin-etc"]').click();await page.getByRole('button',{name:'Buy complete Set',exact:true}).click();await page.locator('.transaction-dialog').waitFor({state:'hidden'})
 await page.goto(base+'/chess/collection.html#inventory');await page.getByRole('button',{name:'Collections / Sets',exact:true}).click();await page.getByLabel('Find a Set').fill('Eternal Court');assert.match(await page.locator('#set-grid').textContent(),/12 \/ 12/)
 if(process.env.CASES_SCREENSHOT_DIR)await page.screenshot({path:process.env.CASES_SCREENSHOT_DIR+'/sets.png',fullPage:true})
 await page.locator('[data-sell-set="set-skin-etc"]').click();await page.getByLabel('Set price in coins').fill('9000');await page.locator('#set-description').fill('A complete mythic court.');await page.getByRole('button',{name:'List complete Set',exact:true}).click();await page.locator('.transaction-dialog').waitFor({state:'hidden'})
 const buyer=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});await buyer.addCookies([{name:'multiverse_session',value:'Buyer-case-token',domain:'127.0.0.1',path:'/'}]);const b=await buyer.newPage();b.on('pageerror',e=>errors.push(e.message));await b.goto(base+'/chess/collection.html#market');await b.locator('.market-card').waitFor();assert.match(await b.locator('.market-card').textContent(),/COMPLETE SET/);await b.locator('[data-listing]').click();await b.getByRole('button',{name:'Buy copy',exact:true}).last().click();await b.locator('.transaction-dialog').waitFor({state:'hidden'})
 const bState=await(await buyer.request.get(base+'/api/economy')).json();assert.equal(bState.wallet.coins,191000);assert.equal(bState.wallet.inventory.length,12);assert.equal((await(await context.request.get(base+'/api/economy')).json()).wallet.coins,124000)
 await page.getByRole('button',{name:'Cases',exact:true}).click();await page.locator('[data-open-owned]').click();await page.getByRole('button',{name:'Open owned case',exact:true}).click();await page.locator('.reward-result:not([hidden])').waitFor();assert.match(await page.locator('.reward-set-note').textContent(),/Complete Set/);await page.getByRole('button',{name:'Continue',exact:true}).click();assert.equal((await(await context.request.get(base+'/api/economy')).json()).wallet.cases.length,0)
 await page.goto(base+'/chess/lobby.html');await page.locator('.spin-thumb .wheel-segment').first().waitFor();assert.equal(await page.locator('.spin-thumb .wheel-segment').count(),25);await page.getByRole('button',{name:'Preview daily wheel',exact:true}).click();await page.locator('.wheel-preview-dialog').waitFor();if(process.env.CASES_SCREENSHOT_DIR)await page.screenshot({path:process.env.CASES_SCREENSHOT_DIR+'/wheel-preview.png'});await page.getByRole('button',{name:'Maybe later',exact:true}).click();await page.locator('.spin-now').click();await page.locator('.reward-result:not([hidden])').waitFor();await page.getByText('Reward odds',{exact:true}).click();assert.equal(await page.locator('.wheel-odds>div>span').count(),25)
 if(process.env.CASES_SCREENSHOT_DIR)await page.screenshot({path:process.env.CASES_SCREENSHOT_DIR+'/wheel.png'})
 await page.keyboard.press('Escape')
 for(const width of [768,390,320]){await page.setViewportSize({width,height:900});await page.goto(base+'/chess/collection.html#shop');await page.locator('#weekly-cases article').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'shop fits '+width)}
 assert.deepEqual(errors,[])
})
