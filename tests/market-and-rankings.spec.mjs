import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {ensureAccount} from '../server/accounts.ts'
import {casinoBet} from '../server/casino.ts'

test('top 100 links to searchable complete rankings; CasinoOwner notifications open the correct table',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'chess-ranking-ui-')),store=new ChessStore(dir),token='ranking-ui-fixture'
 store.transaction(u=>{for(let i=0;i<105;i++){const name='Ranked'+String(i).padStart(3,'0');u.users.add(name,ensureAccount({name,salt:'fixture',hash:'fixture',rating:{value:1500-i,games:10}}))}u.users.add('CasinoOwner',ensureAccount({name:'CasinoOwner',salt:'fixture',hash:'fixture',rating:{value:1200,games:0}}));u.putSession(createHash('sha256').update(token).digest('hex'),{user:'CasinoOwner',expires:Date.now()+600000});casinoBet(u.users.get('Ranked000'),[u.users.get('Ranked000'),u.users.get('CasinoOwner')],{game:'roulette',choice:0,stake:1,sequence:1,requestId:'ranked-casino-notice'},Date.now(),0)})
 store.close()
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const base=`http://127.0.0.1:${port}`,child=spawn(process.execPath,['dist/server.mjs'],{env:{...process.env,DATA_DIR:dir,PORT:String(port)},stdio:'ignore'})
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});t.after(async()=>{await browser.close();if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done}await rm(dir,{recursive:true,force:true})})
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,40))}
 const context=await browser.newContext({viewport:{width:1440,height:950},reducedMotion:'reduce'});await context.addCookies([{name:'multiverse_session',value:token,domain:'127.0.0.1',path:'/'}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/chess/lobby.html');await page.locator('#leaderboard tbody tr').first().waitFor();assert.equal(await page.locator('#leaderboard tbody tr').count(),100);assert.match(await page.locator('#my-rating-summary').textContent(),/Your Elo: 1200/);assert.equal(await page.locator('#my-rating-summary a').textContent(),'Open full leaderboard')
 await page.locator('#leaderboard .full-leaderboard-link').click();await page.locator('#full-ranking-table tbody tr').first().waitFor();assert.equal(await page.locator('#full-ranking-table tbody tr').count(),100);await page.getByRole('button',{name:'Next',exact:true}).click();assert.equal(await page.locator('#full-ranking-table tbody tr').count(),6)
 await page.getByLabel('Find a player').fill('CasinoOwner');assert.equal(await page.locator('#full-ranking-table tbody tr').count(),1);assert.match(await page.locator('#full-ranking-table').textContent(),/106/)
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.goto(base+'/chess/lobby.html');await page.locator('#notification-feed .notice-row').filter({hasText:'Ranked000 won 48 coins'}).click();await page.waitForURL('**/chess/roulette.html');assert.equal((await (await context.request.get(base+'/api/notifications')).json()).unread,0);assert.deepEqual(errors,[])
})
