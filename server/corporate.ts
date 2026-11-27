import {LOT_SHARES,SHARE_PRICE} from '../src/world/resort.ts'
import {startingPolicies} from '../src/equity-v2.ts'
import {BNK,CAS,equityPrice,fromStockUnits,toStockUnits,type EquitySymbol,type PricePoint,type StockSide} from '../src/stock-model.ts'
import {CASINO_OWNER} from '../src/casino-model.ts'
import type {Account} from './accounts.ts'
import type {UnitOfWork} from './storage.ts'
import {CAS_META,portfolio} from './cas-shares.ts'
import {collections,creditAccount,DAY,loansFor,migrateLoan} from './credit.ts'
const amsterdamDate=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'})
export function amsterdamDay(at:number):string{
  const parts=Object.fromEntries(amsterdamDate.formatToParts(at).map(part=>[part.type,part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function nextAmsterdamMidnight(after:number):number{
  const day=amsterdamDay(after)
  let low=after,high=after+36*60*60_000
  while(amsterdamDay(high)===day)high+=12*60*60_000
  while(high-low>1){const middle=Math.floor((low+high)/2);if(amsterdamDay(middle)===day)low=middle;else high=middle}
  return high
}

export const BANK_META='bankExchange'
export const COMPANIES='economyV2'
export const ESCROW='rouletteHallEscrow'
export const PE='\u0000pe'
export const INVENTORY='\u0000inventory'
export const BUYBACK='\u0000buyback'
const residentFunds=()=>Object.fromEntries(['Amira','Bram','Inez'].map(name=>['\u0000resident:'+name,toStockUnits(250)]))
export const residentHolder=(id:string)=>id.startsWith('\u0000resident:')
export const holderLabel=(id:string)=>residentHolder(id)?id.slice(10)+' (resident)':id===PE?'Private equity':id===INVENTORY?'Company inventory':id===BUYBACK?'Company buyback':id
export const dictionary=<T>(contents:Record<string,T>={}):Record<string,T>=>Object.assign(Object.create(null),contents)
export const symbols=[CAS,BNK] as const
export type Order={id:string;holder:string;side:StockSide;price:number;shares:number;at:number;seq:number;initial:number;market?:{quote:number;total:number}}
export type Trade={id:string;buy:string;sell:string;price:number;shares:number;at:number}
type LedgerEntry={at:number;kind:string;units:number;shares?:number;operating?:true;profitToday?:number}
export type Ballot={id:string;symbol:EquitySymbol;policy:string;value:number;ends:number;snapshot:Record<string,number>;votes:Record<string,'yes'|'no'>}
export type Support={at:number;options:Record<string,number>}
type Insolvency={at:number;need:number;stage:number;selected:number[];support:Record<string,number[]>;snapshot:Record<string,number>;outcome?:string;offer?:Ballot}
interface Listing {
  issued:number;inventory:number;holders:Record<string,number>;cash:number
  price:number;quotes:PricePoint[];orders:Order[];trades:Trade[];nextOrder:number
  ledger:LedgerEntry[];buybackCash:number;lastDividend?:{day:string;pool:number;paid:number}
}
export interface Company extends Listing {
  symbol:EquitySymbol
  policy:Record<string,number>;cooldowns:Record<string,number>;supports:Record<string,Record<string,Support>>
  marks:Record<string,{shares:number;eligible:number;reached:number}>;lastBallot?:{policy:string;value:number;passed:boolean;at:number}
  loss:number;profit:number;nextDividend:number;nextOperatingCost?:number
  issuance:{at:number;shares:number;basis:number}[]
  pending:number;receivables:number;nonperforming:number;obligations:number
  loan?:{principal:number;rate:number;opened:number;due:number}
  bankruptcy?:Insolvency;recoveryUntil:number
}
export interface LotteryCompany extends Listing {symbol:'LOT'}
export interface PrisonCompany extends Listing {
  symbol:'PRI';nextDividend:number;carry:number
  terms:{user:string;start:number;end:number|null;earned:number}[]
}
export type ListedCompany=Company|LotteryCompany|PrisonCompany
export interface Companies {
  residents:Record<string,number>; LOT:LotteryCompany;PRI:PrisonCompany;
  CAS:Company;BNK:Company;peCash:number;nextPE:number;peLadder?:true;lastSlot:number;ballot?:Ballot;reversals:Record<string,{buyer:string;at:number}>;dividendCadence?:'daily-amsterdam-v1'|'daily-amsterdam-v2'
}
export const cashUnits=toStockUnits
export function ratio(amount:number,numerator:number,denominator=100){
  return Number(BigInt(amount)*BigInt(numerator)/BigInt(denominator))
}
export function journal(c:ListedCompany,kind:string,units:number,at:number,shares?:number){
  const entry:LedgerEntry={kind,units,at,shares}
  c.ledger.push(entry)
  return entry
}
export function operating(c:Company,kind:string,units:number,at:number){
  c.profit+=units
  journal(c,kind,units,at).operating=true
}
export const saveCompanies=(u:UnitOfWork,e:Companies)=>u.putMetadata(COMPANIES,e)
export const sharesOf=(c:ListedCompany,name:string)=>c.holders[name]??0
export const eligible=(c:Company)=>c.issued-c.inventory
export function equityPosition(c:ListedCompany,account:Account,delta:number,paid:number){
  const p=portfolio(account),old=p.positions[c.symbol]??{shares:0,cost:0},shares=old.shares+delta
  if(shares<0)throw new Error('Negative share holding')
  if(shares)p.positions[c.symbol]={shares,cost:fromStockUnits(delta>0?toStockUnits(old.cost)+paid:ratio(toStockUnits(old.cost),shares,old.shares))}
  else delete p.positions[c.symbol]
}
export function setHolding(c:ListedCompany,name:string,delta:number){
  const after=sharesOf(c,name)+delta
  if(after<0)throw new Error('Negative share holding')
  if(after)c.holders[name]=after
  else delete c.holders[name]
}

type Legacy={
  float:number;available:number;equity?:number;cash?:number;reserve?:number;marketCash?:number
  margin?:number;collectedInterest?:number;history?:PricePoint[];holders?:Record<string,number>
}
function openingCompany(symbol:EquitySymbol,old:Legacy|undefined,now:number):Company{
  const issued=symbol===CAS?1_000_000:500_000
  const price=toStockUnits((old?equityPrice(symbol,old):symbol===CAS?20:16)/100)
  return {symbol,issued,inventory:issued,holders:dictionary(),cash:symbol===CAS?old?.cash??cashUnits(60_000):
    (old?.reserve??cashUnits(120_000))+(old?.marketCash??cashUnits(50_000))+(old?.collectedInterest??0),
    price,quotes:old?.history?.map(p=>({...p,price:p.price/100}))??[{at:now,price:fromStockUnits(price)}],
    orders:[],trades:[],nextOrder:0,policy:{...startingPolicies[symbol]},cooldowns:{},supports:{},marks:{},
    loss:0,profit:symbol===CAS?old?.margin??0:old?.collectedInterest??0,nextDividend:nextAmsterdamMidnight(now),nextOperatingCost:now+DAY,ledger:[],issuance:[],
    buybackCash:0,pending:0,receivables:0,nonperforming:0,obligations:0,recoveryUntil:0}
}
function openingLottery(unit:UnitOfWork,now:number):LotteryCompany{
  const draw=unit.metadata<{holders?:{name:string;count:number}[];principal?:number}>('royalWeeklyLottery')
  const holders=dictionary<number>(),price=toStockUnits(SHARE_PRICE)
  let inventory=LOT_SHARES
  for(const h of draw?.holders??[]){holders[h.name]=h.count;inventory-=h.count}
  if(draw?.holders){
    const {holders:oldHolders,principal,...tickets}=draw
    unit.putMetadata('royalWeeklyLottery',tickets)
  }
  // The old stand always traded at par, including the day before migration.
  const firstQuote=draw?.holders?now-DAY:now
  return {symbol:'LOT',issued:LOT_SHARES,inventory,holders,cash:draw?.principal??0,buybackCash:0,
    price,quotes:[{at:firstQuote,price:SHARE_PRICE}],orders:[],trades:[],nextOrder:0,ledger:[]}
}
function openingPrison(now:number):PrisonCompany{
  const price=25
  return {symbol:'PRI',issued:1000,inventory:1000,holders:dictionary(),cash:0,buybackCash:0,
    price:toStockUnits(price),quotes:[{at:now,price}],orders:[],trades:[],nextOrder:0,ledger:[],
    nextDividend:now+DAY,carry:0,terms:[]}
}
export function companies(unit:UnitOfWork,now=Date.now()):Companies{
  const existing=unit.metadata<Companies>(COMPANIES)
  if(existing){
    existing.residents??=residentFunds()
    if(!existing.LOT){existing.LOT=openingLottery(unit,now);saveCompanies(unit,existing)}
    if(!existing.PRI){existing.PRI=openingPrison(now);saveCompanies(unit,existing)}
    existing.PRI.holders=dictionary(existing.PRI.holders)
    existing.LOT.holders=dictionary(existing.LOT.holders)
    for(const c of [existing.CAS,existing.BNK]){
      c.holders=dictionary(c.holders)
      for(const policy of Object.keys(c.supports))c.supports[policy]=dictionary(c.supports[policy])
      if(c.bankruptcy){
        c.bankruptcy.support=dictionary(c.bankruptcy.support);c.bankruptcy.snapshot=dictionary(c.bankruptcy.snapshot)
        if(c.bankruptcy.offer){c.bankruptcy.offer.snapshot=dictionary(c.bankruptcy.offer.snapshot);c.bankruptcy.offer.votes=dictionary(c.bankruptcy.offer.votes)}
      }
    }
    if(existing.ballot){existing.ballot.snapshot=dictionary(existing.ballot.snapshot);existing.ballot.votes=dictionary(existing.ballot.votes)}
    if(existing.dividendCadence!=='daily-amsterdam-v2'){
      const next=nextAmsterdamMidnight(now)
      for(const c of [existing.CAS,existing.BNK])c.nextDividend=Math.min(c.nextDividend??next,next)
      existing.dividendCadence='daily-amsterdam-v2'
      saveCompanies(unit,existing)
    }
    return existing
  }
  const oldCAS=unit.metadata<Legacy>(CAS_META),oldBank=unit.metadata<Legacy>(BANK_META)
  const cas=openingCompany(CAS,oldCAS,now),bank=openingCompany(BNK,oldBank,now)
  const owner=unit.findAccount(CASINO_OWNER)
  cas.holders[owner?.name??CASINO_OWNER]=300_000
  cas.holders[PE]=(oldCAS?.equity??3000)*100
  for(const name of unit.accountNames()){
    const player=unit.users.get(name)!
    for(const c of [cas,bank]){
      const p=player.stocks?.positions[c.symbol]
      if(p){p.shares*=100;setHolding(c,name,p.shares)}
    }
    creditAccount(player)
    for(const loan of loansFor(player.bank)){
      migrateLoan(loan)
      bank.receivables+=loan.principal
      if(loan.defaulted)bank.nonperforming+=loan.principal
    }
  }
  if(owner){
    const p=portfolio(owner)
    p.positions[CAS]??={shares:0,cost:0}
    p.positions[CAS].shares+=300_000
  }
  for(const c of [cas,bank]){
    c.inventory=c.issued-Object.values(c.holders).reduce((s,n)=>s+n,0)
    if(c.inventory<0)throw new Error('Opening equity holdings exceed issued shares')
    journal(c,'Opening cash',c.cash,now)
  }
  for(const round of unit.metadata<{tickets:{payoutUnits?:number;bet:{game:string;choice:string|number;stake:number}}[]}[]>(ESCROW)??[]){
    for(const {bet,payoutUnits} of round.tickets){
      const multiplier=bet.game==='dice'?5.88:typeof bet.choice==='number'?bet.choice===0?49:36:2
      cas.pending+=payoutUnits??toStockUnits(bet.stake*multiplier)
      cas.cash+=toStockUnits(bet.stake)
      cas.profit+=toStockUnits(bet.stake)
    }
  }
  const result={residents:residentFunds(),LOT:openingLottery(unit,now),PRI:openingPrison(now),CAS:cas,BNK:bank,peCash:cashUnits(50_000),nextPE:now+DAY,lastSlot:Math.floor((now-DAY/2)/DAY)-1,reversals:{},dividendCadence:'daily-amsterdam-v2' as const}
  saveCompanies(unit,result)
  return result
}

export const corporateInterest=(c:Company,now:number)=>c.loan?ratio(c.loan.principal,Math.max(0,Math.floor((now-c.loan.opened)/DAY))*c.loan.rate,10000):0
export const debt=(c:Company,now:number)=>(c.loan?.principal??0)+corporateInterest(c,now)
export const assets=(c:Company)=>c.cash+c.buybackCash+c.receivables-c.nonperforming
export const liabilities=(c:Company,now:number)=>c.obligations+c.pending+debt(c,now)
export function safetyReserve(c:Company){
  return c.symbol===CAS?cashUnits(5_000)+ratio(c.pending,c.policy.coverage):
    Math.max(cashUnits(5_000),ratio(Math.max(0,assets(c)),c.policy.reserve))
}
export function shortfall(c:Company,now:number){
  const due=c.loan&&now>=c.loan.due?debt(c,now):0
  return Math.max(0,liabilities(c,now)-assets(c)+1,cashUnits(5_000)+c.pending+c.obligations+due-c.cash)
}
export function lendable(bank:Company,now:number){
  if(!bank.policy.open||bank.bankruptcy||shortfall(bank,now)>0)return 0
  return Math.max(0,Math.min(bank.cash-safetyReserve(bank)-bank.obligations,
    ratio(assets(bank),bank.policy.lending)-bank.receivables))
}
export function cashForDistribution(c:Company,now:number){
  return Math.max(0,Math.min(c.cash-safetyReserve(c)-c.obligations-debt(c,now),assets(c)-liabilities(c,now)))
}
export function repayCorporate(unit:UnitOfWork,e:Companies,now:number){
  const c=e.CAS,b=e.BNK,l=c.loan
  if(!l)return
  const interest=corporateInterest(c,now),total=l.principal+interest
  c.cash-=total;b.cash+=total;b.receivables-=l.principal
  operating(c,'Corporate interest paid',-interest,now);bankInterest(b,'Corporate interest collected',interest,now)
  journal(c,'Corporate principal repaid',-l.principal,now);journal(b,'Corporate principal received',l.principal,now)
  unit.economyUsage(undefined,'/api/stocks',{action:'corporate_payment',symbol:CAS,coins:fromStockUnits(total),interest:fromStockUnits(interest)},now)
  delete c.loan
}

export function coverOperatingCosts(c:Company,now:number){
  c.nextOperatingCost??=now+DAY
  if(now<c.nextOperatingCost)return
  const at=c.nextOperatingCost,days=1+Math.floor((now-at)/DAY)
  const expense=cashUnits(c.symbol===CAS?25:10)*days
  c.nextOperatingCost+=days*DAY
  const paid=Math.min(expense,Math.max(0,c.cash-c.pending))
  c.cash-=paid;c.obligations+=expense-paid
  operating(c,'Daily operating expenses',-expense,at)
}

export function postCreditCollections(unit:UnitOfWork,accounts:Account[],now=Date.now(),existing?:Companies){
  const entries=accounts.flatMap(account=>{const record=collections(account);return record?[{...record,name:account.name}]:[]})
  if(!entries.length)return
  const e=existing??companies(unit,now),bank=e.BNK
  for(const {principal,interest,loss,recovered,events,name} of entries){
    for(const {at,details} of events)unit.economyUsage(name,'/api/bank',details,at)
    bank.receivables-=principal
    bank.nonperforming+=loss-recovered
    bank.cash+=principal+interest
    if(principal)journal(bank,'Personal principal received',principal,now)
    if(interest)bankInterest(bank,'Personal interest collected',interest,now)
    if(loss)operating(bank,'Credit loss recognized',-loss,now)
    if(recovered)operating(bank,'Credit loss recovered',recovered,now)
  }
  if(!existing)saveCompanies(unit,e)
}
export function bankInterest(bank:Company,kind:string,interest:number,now:number){
  operating(bank,kind,interest,now)
  const cost=ratio(interest,5)
  bank.cash-=cost
  if(cost)operating(bank,'Loan servicing expenses',-cost,now)
}
