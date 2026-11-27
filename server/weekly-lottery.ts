import {randomInt} from 'node:crypto'
import {RESIDENT_NAMES} from '../src/world/city-residents.ts'
import {nextWeek} from '../src/collection.ts'
import {TICKET_PRICE,type LotteryView} from '../src/world/resort.ts'
import {fromStockUnits,toStockUnits} from '../src/stock-model.ts'
import {income} from './credit.ts'
import {notify,type Account} from './accounts.ts'
import {companies,amsterdamDay,residentHolder,saveCompanies} from './corporate.ts'
import {portfolio} from './cas-shares.ts'
import type {UnitOfWork} from './storage.ts'
import {fail} from './http.ts'
import {debit,quantity,resortAccount} from './resort-ledger.ts'

const KEY='royalWeeklyLottery',interval=30*60_000
type Entry={name:string;count:number}
interface Draw {until:number;nextSale:number;npc:number;residents:{name:string;coins:number;tickets:number}[];entries:Entry[];carry:number;last?:LotteryView['last']}
const sum=(rows:Entry[])=>rows.reduce((n,r)=>n+r.count,0)
export const drawProfit=(d:Draw)=>Math.floor(toStockUnits((sum(d.entries)+d.npc)*TICKET_PRICE)/100)
function change(rows:Entry[],name:string,delta:number){
  const row=rows.find(r=>r.name===name)
  if(!row)rows.push({name,count:delta})
  else if((row.count+=delta)===0)rows.splice(rows.indexOf(row),1)
}
function closeDraw(unit:UnitOfWork,d:Draw,now:number){
  const sold=sum(d.entries)+d.npc
  if(!sold)return
  const revenue=toStockUnits(sold*TICKET_PRICE),profit=drawProfit(d)
  const prize=fromStockUnits(revenue-profit)
  let ticket=randomInt(sold)
  const winner=d.entries.find(entry=>(ticket-=entry.count)<0)?.name
  const resident=winner?undefined:d.residents.find(r=>(ticket-=r.tickets)<0)
  if(resident)resident.coins+=prize
  if(winner){
    const account=resortAccount(unit,winner)
    income(account,revenue-profit,now)
    notify(account,{kind:'casino',title:'Weekly lottery winner',detail:'Your ticket won '+prize+' coins.',code:'LOT'})
  }
  const e=companies(unit,now),c=e.LOT,shares=c.issued-c.inventory,fund=profit+d.carry
  const perShare=shares?Math.floor(fund/shares):0
  d.carry=fund-perShare*shares
  for(const [name,count] of Object.entries(c.holders)){
    const amount=perShare*count
    if(residentHolder(name)){e.residents[name]+=amount;continue}
    const account=resortAccount(unit,name)
    if(amount){
      portfolio(account).dividends.unshift({symbol:'LOT',at:now,shares:count,amount:fromStockUnits(amount),day:amsterdamDay(now)})
      unit.economyUsage(account.name,'/api/stocks',{action:'dividend',symbol:'LOT',shares:count,coins:fromStockUnits(amount)},now)
    }
    income(account,amount,now)
    const record=account.resort??={sequence:0}
    record.dividends=fromStockUnits(toStockUnits(record.dividends??0)+amount)
    if(amount)notify(account,{kind:'casino',title:'Lottery dividend',detail:count+' LOT shares earned '+fromStockUnits(amount)+' coins.',code:'LOT'})
  }
  c.lastDividend={day:amsterdamDay(now),pool:fromStockUnits(fund),paid:fromStockUnits(perShare*shares)}
  if(perShare)unit.economyUsage(undefined,'/api/stocks',{action:'dividend',symbol:'LOT',coins:c.lastDividend.paid},now)
  saveCompanies(unit,e)
  d.last={winner:winner??(resident?.name??'City resident')+' (resident)',prize,dividend:fromStockUnits(perShare)}
}
export function advanceLottery(unit:UnitOfWork,now:number){
  let old=unit.metadata<Draw & {holders?:Entry[]}>(KEY)
  if(old?.holders){companies(unit,now);old=unit.metadata<Draw>(KEY)}
  const d=old??{until:nextWeek(now),nextSale:now+interval,npc:0,residents:RESIDENT_NAMES.map(name=>({name,coins:1000,tickets:0})),entries:[],carry:0}
  if(old&&d.nextSale>now&&d.until>now)return d
  for(;;){
    while(d.nextSale<=now&&d.nextSale<d.until){
      const buyer=d.residents[randomInt(d.residents.length)]
      const count=Math.min(randomInt(1,10),Math.floor(buyer.coins/TICKET_PRICE))
      buyer.coins-=count*TICKET_PRICE;buyer.tickets+=count;d.npc+=count
      d.nextSale+=interval
    }
    if(now<d.until)break
    closeDraw(unit,d,d.until)
    for(const resident of d.residents){resident.tickets=0;resident.coins=Math.max(resident.coins,1000)}
    d.nextSale=d.until+interval;d.until=nextWeek(d.until+1000);d.entries=[];d.npc=0
  }
  unit.putMetadata(KEY,d)
  return d
}
export function lottery(unit:UnitOfWork,account:Account,now:number,command?:Record<string,unknown>):LotteryView{
  const d=advanceLottery(unit,now)
  if(command){
    const count=quantity(command.count,100),kind=command.kind
    if(kind==='ticket'){
      if(command.draw!==d.until)fail(409,'A new draw has opened')
      debit(account,count*TICKET_PRICE,now);change(d.entries,account.name,count)
    }else fail(400,'Trade LOT shares at the Exchange Tower')
    unit.putMetadata(KEY,d)
  }
  const tickets=sum(d.entries)+d.npc
  return {until:d.until,pool:fromStockUnits(toStockUnits(tickets*TICKET_PRICE)*.99),npc:d.npc,tickets,
    mine:d.entries.find(r=>r.name===account.name)?.count??0,shares:account.stocks?.positions.LOT?.shares??0,
    last:d.last,dividends:account.resort?.dividends??0}
}
