import {prisonDue,prisonWakeKey,settlePrisonDue} from './prison-company.ts'
import {stat} from 'node:fs/promises'
import {dirname,join} from 'node:path'
import {advanceResidentStocks} from './resident-stocks.ts'
import mapRelease from '../.meridian/manifest.json' with {type:'json'}
import {advanceLottery} from './weekly-lottery.ts'
import {advanceTable} from './card-salon.ts'
import {roster,custodyView,puzzleAction,publicView} from './custody.ts'
import {UsageStore,usagePath,usageApi,serverUsage,drainEconomyUsage,worldEconomyUsage} from './telemetry.ts'
import {puzzleApi} from './puzzles.ts'
import {AiScheduler} from './ai-scheduler.ts'
import type {IncomingMessage, ServerResponse} from 'node:http'
import type {ChessStore} from './storage.ts'
import {body, checkOrigin, fail, json} from './http.ts'
import {LoginLimiter, user} from './security.ts'
import {authApi} from './auth-api.ts'
import {playerProfileApi} from './player-profile.ts'
import {accountApi} from './account-api.ts'
import {economyApi} from './economy-api.ts'
import {gameApi} from './game-api.ts'
import {eloApi} from './elo-gambling.ts'
import {CityWorlds} from './world.ts'
import {RouletteHall} from './roulette-hall.ts'
import {StockHistory} from './stock-history.ts'
import {bankApi} from './bank.ts'
import {floorReport} from './floor-report.ts'
import {stockApi} from './stock-api.ts'
import {casinoApi} from './casino-api.ts'
import {ensureAccount,profile,pruneNotices} from './accounts.ts'
import {staticFile} from './static.ts'
import {STORAGE_SCHEMA} from './storage.ts'

export function createApplication(store: ChessStore, updateFlag = store.path === ':memory:' ? undefined : join(dirname(store.path),'update-in-progress')) {
  const usage=new UsageStore(usagePath(store))
  let telemetryWarning=false
  const collectEconomy=()=>{try{drainEconomyUsage(usage,store)}catch{
    if(!telemetryWarning){console.error('Economy telemetry delivery deferred');telemetryWarning=true}
  }}
  const economyUsageTimer=setInterval(collectEconomy,2000);economyUsageTimer.unref()
  const settleResort=()=>store.transaction(unit=>{
    const now=Date.now()
    settlePrisonDue(unit,now)
    advanceLottery(unit,now)
    advanceResidentStocks(unit,now)
    for(const game of ['poker','blackjack'] as const)advanceTable(unit,game,now)
  })
  settleResort()
  const resortTimer=setInterval(()=>{try{settleResort()}catch(error){console.error('Resort settlement deferred',error)}},10_000)
  resortTimer.unref()
  const ai=new AiScheduler(store)
  const roulette=new RouletteHall(store)
  const city=new CityWorlds(store,roulette)
  const stockHistory=new StockHistory()
  ai.kick()
  const limiter = new LoginLimiter()
  const cleanNotices=()=>{for(const row of store.leaderboard())store.transaction(unit=>{const account=unit.users.get(row.name);if(account)pruneNotices(account)})}
  cleanNotices()
  const noticeTimer=setInterval(cleanNotices,60*1000);noticeTimer.unref()
  let draining = false
  return {
    drain: () => {draining = true;clearInterval(resortTimer);ai.stop();roulette.stop();stockHistory.close();clearInterval(noticeTimer);clearInterval(economyUsageTimer);collectEconomy();usage.close()},
    handle: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      const started=Date.now();let actor:string|undefined,pathForUsage='',methodForUsage=req.method??'GET',beforeUsage:{coins?:number;elo?:number}|undefined
      const logUsage=(status:number)=>{try{serverUsage(usage,store,actor,pathForUsage,methodForUsage,status,started,typeof req.headers['x-client-trace']==='string'?req.headers['x-client-trace']:undefined,typeof req.headers['x-ui-action']==='string'?req.headers['x-ui-action']:undefined,beforeUsage)}catch{/* Diagnostics must not change an API response. */}}
      try {
        if (draining) {json(res, 503, {error: 'Server restarting. Please try again.'}, {'retry-after': '1'}); return}
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`), path = url.pathname
        if (!path.startsWith('/api/')) {await staticFile(req,res,path); return}
        pathForUsage=path
        checkOrigin(req)
        const method = req.method || 'GET'
        if (path === '/api/health' && method === 'GET') {
          store.ready()
          const updating = updateFlag && await stat(updateFlag).then(file=>file.isFile(),error=>{
            if(error.code==='ENOENT')return false
            throw error
          })
          json(res,200,{ok:true,storageSchema:STORAGE_SCHEMA,...(updating?{updating:true}:{})})
          return
        }
        const settlementTime=Date.now()
        if(prisonDue(store.metadataValue(prisonWakeKey),settlementTime))store.transaction(unit=>settlePrisonDue(unit,settlementTime))
        const authorize=(track=true)=>{
          const now=Date.now(),name=user(store,req),bookings=roster(store,now)
          const booking=bookings.find(b=>b.user===name)
          const homeRead=method==='GET'&&['/api/leaderboard','/api/notifications','/api/economy'].includes(path)
          if(booking&&!homeRead&&!['/api/login','/api/logout','/api/me','/api/custody','/api/custody/puzzle','/api/world/presence','/api/world/map-version'].includes(path))
            fail(423,'In custody at Meridian Police')
          if(track&&name&&!path.startsWith('/api/world/'))city.arcade.active(name,now)
          return {name,booking,bookings}
        }
        if(method==='GET'&&['/api/stocks/trends','/api/stocks/history'].includes(path))authorize()
        if (path === '/api/stocks/trends' && method === 'GET'){
          actor=user(store,req)??fail(401,'Log in first')
          const symbols=[...new Set((url.searchParams.get('symbols')??'').split(','))]
          if(symbols.length>3)fail(400,'Choose up to three stocks')
          const data=await Promise.allSettled(symbols.map(async symbol=>[symbol,(await stockHistory.get(symbol)).slice(-22)] as const))
          const trends=Object.fromEntries(data.flatMap(item=>item.status==='fulfilled'?[item.value]:[]))
          authorize(false);json(res,200,{trends})
          return
        }
        if (path === '/api/stocks/history' && method === 'GET'){
          actor=user(store,req)??fail(401,'Log in first')
          const points=await stockHistory.get(url.searchParams.get('symbol')??'')
          authorize(false);json(res,200,{points});logUsage(200)
          return
        }
        // Never hold the writer lock while awaiting a network request body.
        const data = method === 'POST' && path !== '/api/logout' ? await body(req) : {}
        const {name,booking}=authorize()
        const project=(value:unknown)=>publicView(value,roster(store,Date.now()))
        if(path==='/api/custody'&&method==='GET'){
          if(!name)fail(401,'Log in first')
          json(res,200,{custody:booking?custodyView(booking):null});return
        }
        if(path==='/api/custody/puzzle'&&(method==='GET'||method==='POST')){
          if(!booking)fail(403,'No active sentence')
          const result=store.transaction(tx=>puzzleAction(tx,booking,method==='POST'?data:undefined))
          json(res,200,result);return
        }
        if(path==='/api/world/map-version'&&method==='GET'){
          if(!name)fail(401,'Log in first')
          json(res,200,{version:mapRelease.version});return
        }
        if(path.startsWith('/api/world/')&&method==='POST'){
          actor=user(store,req)??fail(401,'Log in first')
          if((req.headers.origin||data.mapVersion!==undefined)&&data.mapVersion!==mapRelease.version)fail(412,'Meridian map version changed. Reload the city.')
          const action=path.slice('/api/world/'.length)
          const view=store.withWriteCheck(()=>{
            const fresh=authorize(false).booking
            if(fresh&&!booking)fail(423,'In custody at Meridian Police')
          },()=>city.update(name!,action,data))
          json(res,200,project({...view,mapVersion:mapRelease.version}))
          if(action==='use'||action==='floor')worldEconomyUsage(usage,store,actor,action,view)
          if(action!=='presence')logUsage(200)
          return
        }
        if(path.startsWith('/api/roulette-hall/')&&method==='POST'){
          actor=user(store,req)??fail(401,'Log in first')
          const action=path.slice('/api/roulette-hall/'.length)
          const result=store.withWriteCheck(()=>authorize(false),()=>roulette.update(name!,action,data))
          json(res,200,project(result))
          if(action!=='presence')logUsage(200)
          return
        }
        const reply = store.transaction(unit => {
          const {booking}=authorize(false)
          unit.usageTrace(req.headers['x-client-trace'],req.headers['x-ui-action'])
          actor=user(unit,req)
          if(booking&&path==='/api/me'&&method==='GET')return {status:200,value:{user:booking.name,profile:profile(unit.users.get(booking.user)!),custody:custodyView(booking)},headers:undefined}
          if(name&&path==='/api/logout')city.disconnect(name)
          const auth = authApi(unit,req,path,data,limiter)
          if (auth){const named=(auth.value as {user?:unknown}).user;if(typeof named==='string')actor=named;return auth}
          const me = user(unit,req) ?? fail(401,'Log in first')
          const account = ensureAccount(unit.users.get(me) ?? fail(401,'Log in first'));actor=me;beforeUsage={coins:account.wallet?.coins,elo:account.rating?.value}
          if(method==='POST'&&['/api/stocks/trade','/api/stocks/market','/api/stocks/order'].includes(path)){
            const advisorSale=path!=='/api/stocks/order'&&data.side==='sell'&&data.sellAll===true&&city.atFinancialAdvisor(me)
            if(!advisorSale&&!city.canTrade(me,data.symbol))fail(403,'Talk to the trader on that stock floor')
          }
          if(method==='POST'&&['support','rescue','vote'].some(action=>path==='/api/stocks/'+action)&&!city.canVote(me,data.symbol))fail(403,'Visit the company board table')
          if(method==='POST'&&(path==='/api/bank/borrow'||path==='/api/bank/repay')&&!city.canBank(me,path.split('/').at(-1)!))fail(403,'Visit the appropriate bank counter')
          if(path==='/api/stocks/floor'&&method==='GET')return {status:200,value:floorReport(unit,me,url.searchParams.get('symbol'))}
          return usageApi(usage,store,me,path,method,data)
            ?? puzzleApi(account,path,method,data)
            ?? playerProfileApi(store,unit,account,url,method,data)
            ?? accountApi(store,account,path,method,data)
            ?? economyApi(unit,account,path,method,data)
            ?? (path.startsWith('/api/casino/elo')&&!account.cave?.active?fail(403,'Enter the cave from the city'):eloApi(unit,store,account,path,method,data))
            ?? casinoApi(unit,account,path,method,data)
            ?? stockApi(unit,account,path,method,data)
            ?? bankApi(unit,account,path,method,data)
            ?? gameApi(store,unit,me,path,method,data)
            ?? fail(404,'Not found')
        })
        // Send success only after the SQL commit succeeds.
        json(res,reply.status,project(reply.value),reply.headers);logUsage(reply.status)
        ai.kick()
      } catch (error) {
        const code = (error as {code?: string}).code
        const busy = code === 'ERR_SQLITE_ERROR' && /locked|busy/i.test((error as Error).message)
        const status = busy ? 503 : (error as {status?: number}).status || 500
        logUsage(status)
        json(res,status,{error: status === 500 ? 'Internal server error' : busy ? 'Storage busy. Please try again.' : (error as Error).message})
        if (status === 500) console.error(error)
      }
    },
  }
}
