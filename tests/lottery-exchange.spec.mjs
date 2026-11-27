import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {createApplication} from '../server/application.ts'
import {DISPLAY_X,DISPLAY_Z} from '../src/floor-report.ts'
import {advanceLottery,lottery} from '../server/weekly-lottery.ts'
import {book} from '../server/custody.ts'
import {stockApi} from '../server/stock-api.ts'
import {STOCK_QUOTES} from '../server/stock-quotes.ts'
import {boardFloor,site,FINANCIAL_ADVISOR,LIFT} from '../src/world/model.ts'

function exchangeWalk(context,base,advance){
  let view
  async function act(action,data={}){
    const response=await context.request.post(base+'/api/world/'+action,{data:{scene:true,...data}})
    assert.ok(response.ok(),await response.text())
    view=await response.json()
  }
  async function walk(x,z){
    const goal=site(view.you.zone,x,z)
    for(let i=0;i<24&&Math.hypot(view.you.x-goal.x,view.you.z-goal.z)>.1;i++){
      advance(550);await act('presence',{world:view.id,...goal,yaw:0})
    }
    assert.ok(Math.hypot(view.you.x-goal.x,view.you.z-goal.z)<.12,'walk to '+[x,z])
  }
  async function elevator(){
    await act('teleport',{to:'stocks'})
    await walk(-2.45,2);await walk(-2.45,-3.52);await walk(0,-3.52);await walk(LIFT.x,LIFT.z)
  }
  return {act,walk,elevator,get view(){return view}}
}

for(const ticker of ['LOT','PRI'])test(ticker+' floor brokers take orders and the reception advisor confirms a full sale on a phone',{timeout:200000},async()=>{
  const clock=Date.now
  let elapsed=0
  Date.now=()=>clock()+elapsed
  const db=new ChessStore('.',{memory:true}),app=createApplication(db),server=createServer(app.handle)
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
      const investor={name:'CityInvestor',hash:'',salt:'',wallet:{...a.wallet,coins:5000}}
      u.users.add(investor.name,investor)
      stockApi(u,investor,'/api/stocks/order','POST',{symbol:ticker,side:'buy',shares:15,price:25,id:crypto.randomUUID()},now)
      if(ticker==='LOT')lottery(u,investor,now,{kind:'ticket',count:100,draw:advanceLottery(u,now).until})
      else book(u,investor.name,5,now-6*3600_000,true)
      const quote=(at,price,change)=>({price,change,percent:100*change/(price-change),updated:at,history:[{at:prior,price:80},{at:now,price}]})
      u.putMetadata(STOCK_QUOTES,{AAPL:quote(prior,80,0)})
      stockApi(u,a,'/api/stocks/trade','POST',{symbol:'AAPL',side:'buy',shares:2,sequence:1,total:160,id:crypto.randomUUID()},prior)
      u.putMetadata(STOCK_QUOTES,{AAPL:quote(now,87.25,7.25)})
    })
    const route=exchangeWalk(context,base,ms=>elapsed+=ms),{act,walk}=route
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
    await route.elevator()
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
    // Walk from the broker to both wall displays and read as the new shareholder.
    for(const [side,action,heading] of [[1,'Read share register','Share register'],[-1,'Read financial report','Financial report']]){
      await act('presence')
      await walk(0,.35);await walk(0,DISPLAY_Z);await walk(side*(DISPLAY_X-3.45),DISPLAY_Z)
      await act('presence',{world:route.view.id,x:route.view.you.x,z:route.view.you.z,yaw:-side*Math.PI/2})
      page=await open()
      await page.locator('#world-connection').waitFor({state:'hidden',timeout:60000})
      const button=page.getByRole('button',{name:new RegExp(action)})
      await button.waitFor()
      await snapshot(page,ticker+(side===1?'-register-wall':'-finance-wall'))
      await button.click()
      const panel=page.locator('dialog[open]')
      await panel.getByRole('heading',{name:heading,exact:true}).waitFor()
      if(side===1){
        await panel.getByText(username,{exact:true}).waitFor()
        await panel.getByText('Unsold shares',{exact:true}).waitFor()
      }else{
        await panel.getByText(ticker==='LOT'?'Profit this week':'Profit today',{exact:true}).waitFor()
        await panel.getByText('Your estimated dividend',{exact:true}).waitFor()
        await page.setViewportSize({width:390,height:760})
        assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
        await snapshot(page,ticker+'-report-mobile')
      }
      await page.close()
    }
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

test('the bank and casino boardrooms offer both readable reports',{timeout:200000},async()=>{
  const clock=Date.now
  let elapsed=0
  Date.now=()=>clock()+elapsed
  const db=new ChessStore('.',{memory:true}),app=createApplication(db),server=createServer(app.handle)
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  let browser
  try{
    const base='http://127.0.0.1:'+server.address().port
    browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
    const context=await browser.newContext({viewport:{width:900,height:700},reducedMotion:'reduce'})
    assert.equal((await context.request.post(base+'/api/signup',{data:{username:'Board Visitor',password:'fixture',confirm:'fixture'}})).status(),201)
    const route=exchangeWalk(context,base,ms=>elapsed+=ms),{act,walk}=route
    for(const symbol of ['CAS','BNK']){
      await route.elevator()
      await act('floor',{symbol});elapsed+=7000;await act('presence')
      assert.equal(route.view.you.zone,'floor:'+symbol)
      await walk(0,0);await walk(4.9,0);await walk(4.9,6.1)
      // Approach along the front aisle and around the ends of the board table.
      for(const [side,label,heading] of [[1,'Read share register','Share register'],[-1,'Read financial report','Financial report']]){
        await walk(side*4.9,6.1)
        await walk(side*4.9,DISPLAY_Z)
        const page=await context.newPage()
        await page.goto(base+'/chess/world.html')
        await page.getByRole('button',{name:new RegExp(label)}).click({timeout:60000})
        const panel=page.locator('dialog[open]')
        await panel.getByRole('heading',{name:heading,exact:true}).waitFor()
        if(side===-1)await panel.getByText('Profit today',{exact:true}).waitFor()
        await page.close();await act('presence')
        await walk(side*4.9,6.1)
      }
    }
  }finally{
    Date.now=clock;await browser?.close();app.drain();server.closeAllConnections();await new Promise(r=>server.close(r));db.close()
  }
})
