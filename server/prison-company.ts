import {dayKey,midnight} from '../src/collection.ts'
import {fromStockUnits,toStockUnits} from '../src/stock-model.ts'
import {notify,type Account} from './accounts.ts'
import {portfolio} from './cas-shares.ts'
import {amsterdamDay,bankInterest,companies,journal,postCreditCollections,ratio,residentHolder,saveCompanies,type Companies,type PrisonCompany} from './corporate.ts'
import {collect,DAY,income,loansFor,updateCredit} from './credit.ts'
import {wallet} from './economy.ts'
import type {UnitOfWork} from './storage.ts'

const WAKE='nextPrisonSettlement'
type Term=PrisonCompany['terms'][number]
const dailyUnits=toStockUnits(100)

function schedule(unit:UnitOfWork,e:Companies){
  const times=e.PRI.terms.flatMap(t=>t.end===null?[]:[t.end])
  unit.putMetadata(WAKE,Math.min(e.PRI.nextDividend,...times))
  saveCompanies(unit,e)
}
function enroll(unit:UnitOfWork,e:Companies,user:string,end:number|null,now:number){
  const account=unit.users.get(user)
  if(!account)return
  const bank=updateCredit(account,now)
  const balance=loansFor(bank).reduce((sum,l)=>sum+l.principal+l.interest,0)
  if(balance)bank.prisonHold={from:now,premium:Math.round(balance/2)}
  postCreditCollections(unit,[account],now,e)
  e.PRI.terms.push({user,start:now,end,earned:0})
}
const earnedThrough=(term:Term,at:number)=>Number(BigInt(Math.max(0,at-term.start))*BigInt(dailyUnits)/BigInt(DAY))
export function unsettledPrisonProfit(unit:UnitOfWork,term:Term,at:number){
  const earned=earnedThrough(term,Math.min(at,term.end??at))-term.earned
  if(earned<=0)return 0
  const bank=unit.users.get(term.user)?.bank
  const owed=bank?.prisonHold?loansFor(bank).reduce((sum,l)=>sum+l.principal+l.interest,bank.prisonHold.premium):0
  return Math.max(0,earned-owed)
}
function earn(unit:UnitOfWork,e:Companies,term:Term,at:number){
  const total=earnedThrough(term,at)
  let units=total-term.earned
  if(units<=0)return
  term.earned=total
  const receipt=journal(e.PRI,'Custody earnings',units,at)
  const account=unit.users.get(term.user),hold=account?.bank?.prisonHold
  if(account&&hold){
    // Settle the original contracts first. collect posts principal, interest and
    // default recoveries through the same bank ledger as an ordinary repayment.
    for(const loan of loansFor(account.bank)){
      const payment=Math.min(units,loan.principal+loan.interest)
      if(!payment)continue
      collect(account,payment,at,true,loan.id)
      units-=payment
      journal(e.PRI,'Personal loan payment to BNK',-payment,at)
    }
    postCreditCollections(unit,[account],at,e)
    const premium=Math.min(hold.premium,units)
    if(premium){
      hold.premium-=premium;units-=premium
      e.BNK.cash+=premium
      bankInterest(e.BNK,'PRI locked interest collected',premium,at)
      journal(e.PRI,'Locked interest paid to BNK',-premium,at)
    }
  }
  // Share-sale cash remains available to the order book. Only operating
  // earnings enter this separate dividend reserve.
  receipt.profitToday=Math.min(units,total-earnedThrough(term,midnight(dayKey(at))))
  e.PRI.carry+=units
}
function resumeLoans(account:Account|undefined,at:number){
  const bank=account?.bank,hold=bank?.prisonHold
  if(!bank||!hold)return
  const elapsed=at-hold.from,days=(Date.parse(dayKey(at))-Date.parse(dayKey(hold.from)))/DAY
  for(const loan of loansFor(bank)){
    loan.due!+=elapsed;loan.lastAccrual!+=elapsed
    if(loan.lastDay!==undefined)loan.lastDay+=days
    if(loan.dueDay!==undefined)loan.dueDay+=days
  }
  delete bank.prisonHold
}
function settleTerms(unit:UnitOfWork,e:Companies,at:number,all:boolean){
  for(const t of e.PRI.terms){
    const released=t.end!==null&&t.end<=at
    if(all||released)earn(unit,e,t,released?t.end!:at)
    if(released)resumeLoans(unit.users.get(t.user),t.end!)
  }
  e.PRI.terms=e.PRI.terms.filter(t=>t.end===null||t.end>at)
}
function dividend(unit:UnitOfWork,e:Companies,at:number){
  const c=e.PRI,pool=c.carry,owners=c.issued-c.inventory,day=amsterdamDay(at)
  let paid=0
  if(pool&&owners)for(const [name,shares] of Object.entries(c.holders)){
    const units=ratio(pool,shares,owners)
    if(!units)continue
    if(residentHolder(name))e.residents[name]+=units
    else{
      const a=unit.users.get(name)
      if(!a)continue
      wallet(a);income(a,units,at)
      postCreditCollections(unit,[a],at,e)
      const p=portfolio(a),amount=fromStockUnits(units)
      p.dividends.unshift({symbol:'PRI',at,day,shares,amount})
      p.prisonDividendsPaid=fromStockUnits(toStockUnits(p.prisonDividendsPaid??0)+units)
      notify(a,{kind:'casino',title:'PRI dividend received',detail:`Your ${shares} PRI shares earned ${amount} coins.`,code:'PRI'})
      unit.economyUsage(name,'/api/stocks',{action:'dividend',symbol:'PRI',shares,coins:amount},at)
    }
    paid+=units
  }
  c.carry-=paid;c.lastDividend={day,pool:fromStockUnits(pool),paid:fromStockUnits(paid)}
  if(paid)journal(c,'Shareholder dividends',-paid,at)
}

export function advancePrison(unit:UnitOfWork,e:Companies,now:number){
  const wake=unit.metadata<number>(WAKE)
  if(wake!==undefined&&now<wake)return
  if(wake===undefined){
    // Existing active bookings begin earning at installation, without a windfall.
    for(const b of unit.metadata<{user:string;ends:number|null}[]>('meridianBookings')??[])
      if(b.ends===null||b.ends>now)enroll(unit,e,b.user,b.ends,now)
  }
  const c=e.PRI
  while(c.nextDividend<=now){
    const at=c.nextDividend
    settleTerms(unit,e,at,true);dividend(unit,e,at);c.nextDividend+=DAY
    if(!c.terms.length&&(!c.carry||c.inventory===c.issued)&&c.nextDividend<=now)
      c.nextDividend+=(1+Math.floor((now-c.nextDividend)/DAY))*DAY
  }
  settleTerms(unit,e,now,false)
  schedule(unit,e)
}
export const prisonDue=(wake:unknown,now:number)=>typeof wake!=='number'||now>=wake
export function settlePrisonDue(unit:UnitOfWork,now:number){
  if(prisonDue(unit.metadata(WAKE),now))advancePrison(unit,companies(unit,now),now)
}
export const prisonWakeKey=WAKE
export function setPrisonTerm(unit:UnitOfWork,user:string,end:number|null,now:number){
  const e=companies(unit,now)
  const term=e.PRI.terms.find(t=>t.user===user)
  if(term)term.end=end
  else enroll(unit,e,user,end,now)
  settleTerms(unit,e,now,false)
  schedule(unit,e)
}
