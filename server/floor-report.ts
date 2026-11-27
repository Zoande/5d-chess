import {dayKey,midnight} from '../src/collection.ts'
import type {FloorReport} from '../src/floor-report.ts'
import {CASINO_OWNER} from '../src/casino-model.ts'
import {fromStockUnits,isExchangeStock} from '../src/stock-model.ts'
import {advanceLottery,drawProfit} from './weekly-lottery.ts'
import {companies,holderLabel,ratio,sharesOf} from './corporate.ts'
import {advanceEconomy,dividendPool} from './governance.ts'
import {settlePrisonDue,unsettledPrisonProfit} from './prison-company.ts'
import type {UnitOfWork} from './storage.ts'
import {fail} from './http.ts'

// Older operating entries predate the explicit ledger flag.
const legacyOperating=new Set(['Card salon rake','Corporate interest paid','Corporate interest collected',
  'Daily operating expenses','Credit loss recognized','Credit loss recovered','Personal interest collected',
  'Loan servicing expenses','Guest room sales','Casino stakes','Casino operating expenses','Casino gross payouts',
  'Bar sales','PRI locked interest collected'])

export function floorReport(unit:UnitOfWork,name:string,symbol:string|null,now=Date.now()):FloorReport{
  if(!symbol||!isExchangeStock(symbol))fail(400,'Choose a city company floor')
  settlePrisonDue(unit,now)
  const draw=symbol==='LOT'?advanceLottery(unit,now):undefined
  const market=companies(unit,now),c=market[symbol]
  if('policy' in c&&c.nextDividend<=now)advanceEconomy(unit,market,now)
  const today=midnight(dayKey(now)),owners=c.issued-c.inventory
  const mine=sharesOf(c,name)
  let cash=c.cash+c.buybackCash,profit:number|null,pool:number,nextPayout:number
  if('policy' in c){
    profit=c.ledger.reduce((sum,r)=>sum+(r.at>=today&&r.at<=now&&(r.operating||legacyOperating.has(r.kind))?r.units:0),0)
    pool=dividendPool(c,now);nextPayout=c.nextDividend
  }else if(c.symbol==='PRI'){
    const live=c.terms.reduce((n,t)=>n+unsettledPrisonProfit(unit,t,now),0)
    const pendingToday=live-c.terms.reduce((n,t)=>n+unsettledPrisonProfit(unit,t,today),0)
    const receipts=c.ledger.filter(r=>r.at>=today&&r.at<=now&&r.kind==='Custody earnings')
    profit=receipts.some(r=>r.profitToday===undefined)?null:receipts.reduce((n,r)=>n+r.profitToday!,pendingToday)
    if(profit!==null)profit+=c.ledger.reduce((sum,r)=>sum+(r.at>=today&&r.at<=now&&r.kind==='Bail income'?r.units:0),0)
    cash+=c.carry;pool=c.carry+live;nextPayout=c.nextDividend
  }else{
    const d=draw!
    profit=drawProfit(d)
    pool=profit?profit+d.carry:0
    nextPayout=d.until
    // Lottery ticket money is ring-fenced from the share trading reserve.
  }
  const allocation=(shares:number)=>!owners?0:c.symbol==='LOT'?Math.floor(pool/owners)*shares:ratio(pool,shares,owners)
  // The founding CAS block can exist before its player account is registered.
  const payable=Object.entries(c.holders).filter(([id])=>symbol!=='CAS'||id!==CASINO_OWNER||unit.users.get(id))
  return {symbol,asOf:now,price:fromStockUnits(c.price),history:c.quotes,register:{
    issued:c.issued,inventory:c.inventory,yourShares:mine,
    ownership:Object.entries(c.holders).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([id,shares])=>({name:holderLabel(id),shares}))
  },cash:fromStockUnits(cash),profit:profit===null?null:fromStockUnits(profit),profitPeriod:symbol==='LOT'?'This week':'Today',
    totalDividend:fromStockUnits(payable.reduce((sum,[,shares])=>sum+allocation(shares),0)),yourDividend:fromStockUnits(allocation(mine)),
    nextPayout,lastPaid:c.lastDividend?.paid??null}
}
