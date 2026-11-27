import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {createApplication} from '../server/application.ts'
import {wallet} from '../server/economy.ts'
import {CASE_DESCRIPTIONS,caseOdds} from '../src/case-presentation.ts'
import {CRATES} from '../src/collection.ts'
test('case archive descriptions are unique and odds round without rounding tiny probabilities to zero',()=>{assert.equal(new Set(CRATES.map(c=>CASE_DESCRIPTIONS[c.id])).size,CRATES.length);assert.ok(CRATES.every(c=>CASE_DESCRIPTIONS[c.id]?.length>30));assert.equal(caseOdds(123456),'12.35%');assert.equal(caseOdds(1),'＜0.01%');assert.equal(caseOdds(0),'0%')})
test('desktop and phone players share a table and see the same draw',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'roulette-room-'))
 const store=new ChessStore(dir),app=createApplication(store),server=app.createServer()
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const base='http://127.0.0.1:'+server.address().port
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 t.after(async()=>{app.drain();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();await rm(dir,{recursive:true,force:true})})
 const desktop=await browser.newContext({viewport:{width:1280,height:900}})
 const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'})
 const errors=[]
 for(const [context,username] of [[desktop,'IvoryGuest'],[mobile,'RiftGuest']]){
  const signup=await context.request.post(base+'/api/signup',{data:{username,password:'p',confirm:'p'}})
  assert.equal(signup.status(),201)
  store.transaction(u=>wallet(u.users.get(username)).coins=1000)
 }
 const page=await desktop.newPage(),phone=await mobile.newPage()
 for(const p of [page,phone]){
  p.on('pageerror',error=>errors.push(error.message))
  await p.goto(base+'/chess/world.html?go=casino')
  await p.locator('#world-canvas[data-zone=hotel]').waitFor({timeout:45000})
  await p.keyboard.down('w')
  try{await p.getByRole('button',{name:/The Rift/}).waitFor()}finally{await p.keyboard.up('w')}
  await p.getByRole('button',{name:/The Rift/}).click()
 }
 await page.locator('.world-seats').getByText('RiftGuest').waitFor()
 await phone.getByRole('button',{name:'Pocket 17',exact:true}).click()
 assert.equal(await phone.locator('[data-face="17"]').getAttribute('aria-pressed'),'true')
 assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await phone.getByRole('button',{name:'Lock bet',exact:true}).click()
 await phone.getByText('Your bet is locked. Waiting for the table.').waitFor()
 await page.getByRole('button',{name:'Lock bet',exact:true}).click()
 await page.getByText('Bets are closed. Watch the table.').waitFor()
 await page.locator('.world-result strong').waitFor()
 await phone.locator('.world-result strong').waitFor()
 assert.equal(await page.locator('.world-result strong').textContent(),await phone.locator('.world-result strong').textContent())
 assert.equal(await page.locator('.world-result li').count(),2)
 const a=await(await desktop.request.get(base+'/api/casino')).json(),b=await(await mobile.request.get(base+'/api/casino')).json()
 assert.equal(a.recent.length,1)
 assert.equal(b.recent.length,1)
 assert.equal(a.recent[0].result,b.recent[0].result)
 assert.deepEqual(errors,[])
})
