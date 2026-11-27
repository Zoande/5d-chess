import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {createApplication} from '../server/application.ts'
import {stockApi} from '../server/stock-api.ts'
import {STOCK_QUOTES} from '../server/stock-quotes.ts'
import {boardFloor,site,FINANCIAL_ADVISOR,LIFT} from '../src/world/model.ts'

for(const ticker of ['LOT','PRI'])test(ticker+' floor brokers take orders and the reception advisor confirms a full sale on a phone',{timeout:200000},async()=>{
  const clock=Date.now
  let elapsed=0
  Date.now=()=>clock()+elapsed
  const db=new ChessStore('.',{memory:true}),app=createApplication(db),server=app.createServer()
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const base='http://127.0.0.1:'+server.address().port
  let browser
  try{
    browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
    const context=await browser.newContext({viewport:{width:1100,height:780},reducedMotion:'reduce'})
    const username='ExchangeGuest',errors=[]
    assert.equal((await context.request.post(base+'/api/signup',{data:{username,password:'fixture',confirm:'fixture'}})).status(),201)
    db.transaction(u=>{
      const a=u.users.get(username),now=Date.now(),prior=now-86400_000
      a.wallet.coins=1000
      const quote=(at,price,change)=>({price,change,percent:100*change/(price-change),updated:at,history:[{at:prior,price:80},{at:now,price}]})
      u.putMetadata(STOCK_QUOTES,{AAPL:quote(prior,80,0)})
      stockApi(u,a,'/api/stocks/trade','POST',{symbol:'AAPL',side:'buy',shares:2,sequence:1,total:160,id:crypto.randomUUID()},prior)
      u.putMetadata(STOCK_QUOTES,{AAPL:quote(now,87.25,7.25)})
    })
    let v
    async function act(action,data={}){
      const response=await context.request.post(base+'/api/world/'+action,{data:{scene:true,...data}})
      assert.ok(response.ok(),await response.text());v=await response.json()
    }
    async function walk(x,z){
      const goal=site(v.you.zone,x,z)
      for(let i=0;i<24&&Math.hypot(v.you.x-goal.x,v.you.z-goal.z)>.1;i++){
        elapsed+=550;await act('presence',{world:v.id,...goal,yaw:0})
      }
      assert.ok(Math.hypot(v.you.x-goal.x,v.you.z-goal.z)<.12,'walk to '+[x,z])
    }
    async function open(){
      const page=await context.newPage()
      page.on('pageerror',e=>errors.push(e.message))
      await page.goto(base+'/chess/world.html')
      return page
    }
    async function snapshot(page,name){
      const folder=process.env.EXCHANGE_SCREENSHOTS
      if(folder){await mkdir(folder,{recursive:true});await page.screenshot({path:join(folder,name+'.jpg'),quality:83})}
    }
    await act('teleport',{to:'stocks'})
    await walk(-2.45,2);await walk(-2.45,-3.52);await walk(0,-3.52);await walk(LIFT.x,LIFT.z)
    let page=await open()
    await page.getByRole('searchbox',{name:'Search stocks'}).fill(ticker)
    await page.locator(`[data-floor="${ticker}"]`).click()
    await page.locator(`#city-world[data-zone="floor:${ticker}"]`).waitFor({timeout:45000})
    assert.equal(boardFloor('floor:'+ticker),false)
    await page.close()
    await act('presence');await walk(0,5.05)
    page=await open()
    await page.locator(`#city-world[data-zone="floor:${ticker}"]`).waitFor()
    await page.locator('#world-connection').waitFor({state:'hidden',timeout:60000})
    await snapshot(page,ticker+'-floor')
    await page.close()
    await act('presence');await walk(0,-.42);await walk(-2.7,-.42)
    page=await open()
    await page.getByLabel('Shares',{exact:true}).fill('3')
    await page.getByRole('button',{name:'Buy '+ticker,exact:true}).click()
    await page.getByRole('status').filter({hasText:`Bought 3 ${ticker}.`}).waitFor()
    await page.close()
    await act('teleport',{to:'stocks'});await walk(-2.45,2.42);await walk(FINANCIAL_ADVISOR.x,FINANCIAL_ADVISOR.z)
    page=await open()
    await page.getByRole('button',{name:/Review your portfolio/}).click()
    await page.getByText('All-time gain',{exact:true}).waitFor()
    await snapshot(page,'financial-advisor')
    await page.setViewportSize({width:390,height:760})
    const sell=page.getByRole('button',{name:`Sell all ${ticker} shares`})
    await sell.click()
    await page.getByRole('button',{name:'Keep shares'}).click()
    const dialog=page.locator('dialog[open]')
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
    await sell.click()
    await snapshot(page,'advisor-sale-mobile')
    // Buying at the reception desk and using a partial sale disguised as Sell all are rejected.
    const post=body=>context.request.post(base+'/api/stocks/market',{data:{id:crypto.randomUUID(),symbol:ticker,...body}})
    assert.equal((await post({side:'buy',shares:1,total:25,sellAll:true})).status(),403)
    assert.equal((await post({side:'sell',shares:1,total:24.75,sellAll:true})).status(),409)
    await page.getByRole('button',{name:'Confirm sale'}).click()
    await page.getByRole('status').filter({hasText:`Sold 3 ${ticker} for 74.25 coins.`}).waitFor()
    assert.equal(await sell.count(),0)
    await page.getByRole('button',{name:'Sell all AAPL shares'}).waitFor()
    assert.equal(JSON.parse(db.accountJson(username)).wallet.coins,839.25)
    assert.deepEqual(errors,[])
  }finally{
    Date.now=clock;await browser?.close();app.drain();server.closeAllConnections()
    await new Promise(r=>server.close(r));db.close()
  }
})
