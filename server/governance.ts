import {advancePrison} from './prison-company.ts'
import {randomUUID} from 'node:crypto'
import {policies,rescueStages,rescuedPolicies,type BallotView,type CompanyView} from '../src/equity-v2.ts'
import {fromStockUnits,type EquitySymbol} from '../src/stock-model.ts'
import type {UnitOfWork} from './storage.ts'
import {DAY,income,updateCredit} from './credit.ts'
import {wallet} from './economy.ts'
import {portfolio} from './cas-shares.ts'
import {residentHolder,PE,BUYBACK,postCreditCollections,dictionary,holderLabel,cashUnits,assets,liabilities,shortfall,lendable,cashForDistribution,safetyReserve,coverOperatingCosts,eligible,sharesOf,ratio,journal,operating,repayCorporate,debt,companies,saveCompanies,setHolding,amsterdamDay,nextAmsterdamMidnight,type Ballot,type Company,type Companies} from './corporate.ts'
import {book,orderBookView,cancelOrders,maintainOrders,offerInventory,submit} from './order-book.ts'
import {fail} from './http.ts'
import {notify} from './accounts.ts'

const options=(c:Company)=>Object.entries(policies[c.symbol])
const proposalKeys=(c:Company)=>options(c).flatMap(([p,{options}])=>(options as readonly number[]).map(v=>[p,v] as const))
const key=(policy:string,value:number)=>policy+':'+value
const noon=(now:number)=>Math.floor((now-DAY/2)/DAY)
const locked=(c:Company,now:number)=>!!c.bankruptcy||c.recoveryUntil>now
const tally=(b:Ballot)=>Object.entries(b.snapshot).reduce((r,[name,n])=>{
  if(b.votes[name])r[b.votes[name]]+=n
  r.eligible+=n
  return r
},{yes:0,no:0,eligible:0})
function ballot(c:Company,policy:string,value:number,ends:number):Ballot{
  return {id:randomUUID(),symbol:c.symbol,policy,value,ends,snapshot:dictionary(c.holders),votes:dictionary()}
}
export function markSupport(c:Company,now:number){
  const voting=eligible(c)
  for(const [policy,value] of proposalKeys(c)){
    const k=key(policy,value)
    let weight=0
    for(const [holder,support] of Object.entries(c.supports[policy]??{}))if(Object.hasOwn(support.options,String(value)))weight+=sharesOf(c,holder)
    if(weight!==c.marks[k]?.shares||voting!==c.marks[k]?.eligible)c.marks[k]={shares:weight,eligible:voting,reached:now}
  }
}

function apply(unit:UnitOfWork,e:Companies,c:Company,vote:Ballot,now:number){
  const {policy,value}=vote
  if(locked(c,now))return false
  if(policy==='issue'){
    const recent=c.issuance.filter(i=>i.at>now-30*DAY)
    const basis=recent[0]?.basis??c.issued
    const quantity=Math.min(ratio(c.issued,value),ratio(basis,5)-recent.reduce((s,i)=>s+i.shares,0))
    if(quantity<=0)return false
    c.issuance=[...recent,{at:now,shares:quantity,basis}]
    c.issued+=quantity;c.inventory+=quantity
    journal(c,'Share issuance',0,now,quantity)
    unit.economyUsage(undefined,'/api/stocks/vote',{action:'share_issuance',symbol:c.symbol,shares:quantity},now)
    offerInventory(unit,e,c,now)
  }else if(policy==='buyback'){
    const budget=ratio(cashForDistribution(c,now),value)
    const count=Math.min(Math.floor(budget/c.price),eligible(c))
    if(!count)return false
    unit.economyUsage(undefined,'/api/stocks/vote',{action:'buyback',symbol:c.symbol,shares:count,coins:fromStockUnits(budget)},now)
    for(let left=count;left>0;left-=100_000){
      submit(unit,e,c,{id:randomUUID(),holder:BUYBACK,side:'buy',price:c.price,shares:Math.min(left,100_000)},now)
    }
  }else c.policy[policy]=value
  if(policy!=='open')c.cooldowns[policy]=now+(policy==='issue'||policy==='buyback'?30:7)*DAY
  for(const support of Object.values(c.supports[policy]??{}))delete support.options[String(value)]
  markSupport(c,now)
  return true
}
function closeOrdinary(unit:UnitOfWork,e:Companies,now:number){
  const b=e.ballot
  if(!b)return
  const {yes,no,eligible}=tally(b)
  const c=e[b.symbol]
  if(b.ends>now&&yes*2<=eligible&&no*2<=eligible&&!locked(c,now))return
  const passed=yes*2>eligible&&apply(unit,e,c,b,Math.min(now,b.ends))
  c.lastBallot={policy:b.policy,value:b.value,passed,at:Math.min(now,b.ends)}
  unit.economyUsage(undefined,'/api/stocks/vote',{action:'ballot_closed',reference:b.id,symbol:b.symbol,policy:b.policy,value:b.value,status:passed?'approved':'rejected'},now)
  delete e.ballot
}

export function supportPolicy(c:Company,name:string,data:Record<string,unknown>,now:number){
  const {policy,value,on}=data
  if(typeof policy!=='string'||typeof value!=='number'||!proposalKeys(c).some(([p,v])=>p===policy&&v===value)||typeof on!=='boolean')fail(400,'Choose a policy option')
  if(!sharesOf(c,name))fail(403,'Own voting shares to support a policy')
  const holders=c.supports[policy]??=dictionary()
  const record=holders[name]??={at:now,options:{}}
  const had=Object.hasOwn(record.options,String(value))
  if(on)record.options[value]??=now
  else delete record.options[value]
  markSupport(c,now)
  return had!==on
}
function rescueTally(c:Company){
  const b=c.bankruptcy!,totals:Record<string,number>={}
  for(const [name,choices] of Object.entries(b.support))for(const value of choices)totals[value]=(totals[value]??0)+(b.snapshot[name]??0)
  return totals
}
export function rescueSupport(c:Company,name:string,data:Record<string,unknown>){
  const b=c.bankruptcy,stage=b&&rescueStages[b.stage],value=data.value
  if(!b||!stage||typeof value!=='number'||!(stage.options as readonly number[]).includes(value)||typeof data.on!=='boolean')fail(400,'Choose an option for the current rescue stage')
  if(!b.snapshot[name])fail(403,'You do not have voting shares in this stage')
  const choices=new Set(b.support[name]??[])
  const had=choices.has(value)
  if(data.on)choices.add(value)
  else choices.delete(value)
  b.support[name]=[...choices]
  return had!==data.on
}
export function castVote(e:Companies,name:string,id:unknown,choice:unknown,now:number,symbol?:Company['symbol']){
  const b=[e.ballot,e.CAS.bankruptcy?.offer].find(b=>b&&b.id===id&&(!symbol||b.symbol===symbol))
  if(!b||now>=b.ends)fail(409,'This ballot has closed')
  if(choice!=='yes'&&choice!=='no')fail(400,'Select Yes or No')
  if(!b.snapshot[name])fail(403,'You had no eligible shares when voting opened')
  if(b.votes[name]&&b.votes[name]!==choice)fail(409,'Your shares have already voted')
  if(b.votes[name]===choice)return
  b.votes[name]=choice
  return b
}
function declare(unit:UnitOfWork,c:Company,now:number){
  const need=shortfall(c,now)
  if(!need||c.bankruptcy)return
  c.bankruptcy={at:now,need:Math.max(need,safetyReserve(c)+c.obligations-c.cash),stage:0,selected:[],support:dictionary(),snapshot:dictionary(c.holders)}
  journal(c,'Bankruptcy declared',0,now)
  unit.economyUsage(undefined,'/api/stocks',{action:'bankruptcy',symbol:c.symbol,coins:fromStockUnits(c.bankruptcy.need)},now)
}
function cure(unit:UnitOfWork,c:Company,now:number,kind:string){
  delete c.bankruptcy
  journal(c,kind,0,now)
  unit.economyUsage(undefined,'/api/stocks',{action:'company_recovered',symbol:c.symbol},now)
}
function tryRescue(unit:UnitOfWork,e:Companies,now:number){
  const c=e.CAS,b=e.BNK,p=c.bankruptcy!
  const principal=ratio(p.need,p.selected[0])
  if(!principal||c.loan||principal>lendable(b,now)||
      principal>ratio(assets(b),b.policy.exposure)||principal>ratio(assets(c)+principal,c.policy.debt))
    return 'The bank could not fund the proposed contract within company risk limits'
  if(assets(c)<=liabilities(c,now)||principal<Math.max(shortfall(c,now),safetyReserve(c)+c.obligations-c.cash))
    return 'The loan could not restore solvency and liquidity'
  c.cash+=principal;b.cash-=principal;b.receivables+=principal
  c.loan={principal,rate:p.selected[2],opened:now,due:now+p.selected[1]*DAY}
  journal(c,'Rescue loan received',principal,now);journal(b,'Rescue loan issued',-principal,now)
  cure(unit,c,now,'Bankruptcy ended by rescue loan')
  return undefined
}
function rescueVote(unit:UnitOfWork,e:Companies,now:number){
  const c=e.CAS,b=c.bankruptcy
  if(!b)return
  while(b.stage<3&&now>=b.at+(b.stage+1)*DAY){
    if(b.snapshot[PE])b.support[PE]??=[[125],[14],[15]][b.stage]
    const totals=rescueTally(c),stage=rescueStages[b.stage]
    const winner=stage.options.reduce((best,v)=>(totals[v]??0)>(totals[best]??0)?v:best)
    unit.economyUsage(undefined,'/api/stocks/rescue',{action:'rescue_stage',symbol:c.symbol,policy:stage.key,value:winner},b.at+(b.stage+1)*DAY)
    b.selected.push(winner);b.stage++;b.support=dictionary();b.snapshot=dictionary(c.holders)
    if(b.stage===3)b.offer=ballot(e.BNK,'rescue',winner,b.at+4*DAY)
  }
  if(!b.offer||b.outcome)return
  if(b.offer.snapshot[PE]&&now<b.offer.ends){
    const principal=ratio(b.need,b.selected[0]),bank=e.BNK
    b.offer.votes[PE]??=principal<=lendable(bank,now)&&principal<=ratio(assets(bank),bank.policy.exposure)&&assets(c)>liabilities(c,now)&&b.selected[2]>=10?'yes':'no'
  }
  const {eligible,yes,no}=tally(b.offer)
  if(yes*2<=eligible&&no*2<=eligible&&now<b.offer.ends)return
  const at=Math.min(now,b.offer.ends),selected=yes*2>eligible
  b.outcome=selected?tryRescue(unit,e,at):'The bank vote rejected the rescue'
  unit.economyUsage(undefined,'/api/stocks/rescue',{action:'rescue_decision',symbol:c.symbol,status:b.outcome?'rejected':'approved',
    coins:!b.outcome&&c.loan?fromStockUnits(c.loan.principal):undefined,days:b.selected[1],value:b.selected[2]/100},at)
  delete b.offer
}
function recapitalize(unit:UnitOfWork,e:Companies,c:Company,now:number){
  const b=c.bankruptcy
  if(!b||now<b.at+7*DAY)return
  const at=b.at+7*DAY
  cancelOrders(unit,e,c,o=>o.holder===BUYBACK,at)
  c.policy={...rescuedPolicies[c.symbol]}
  const due=debt(c,at)+c.obligations
  const target=c.symbol==='CAS'
    ?cashUnits(75_000)+ratio(c.pending,c.policy.coverage)
    :Math.max(cashUnits(120_000),Math.ceil(ratio(c.receivables,100,c.policy.lending))-(c.receivables-c.nonperforming),
      Math.ceil(ratio(Math.max(0,c.receivables-c.nonperforming),c.policy.reserve,100-c.policy.reserve))+cashUnits(5000))
  const injection=Math.max(0,due+target+Math.max(0,c.loss-c.profit)-c.cash)
  c.cash+=injection
  journal(c,'Private equity recapitalization',injection,at)
  if(c.symbol==='CAS'&&c.loan)repayCorporate(unit,e,at)
  if(c.obligations){c.cash-=c.obligations;journal(c,'Obligations settled',-c.obligations,at);c.obligations=0}
  c.loss=0;c.profit=0
  const shares=ratio(c.issued,30)
  c.issued+=shares;setHolding(c,PE,shares)
  journal(c,'Recapitalization share issuance',0,at,shares)
  unit.economyUsage(undefined,'/api/stocks',{action:'recapitalization',symbol:c.symbol,shares,coins:fromStockUnits(injection)},at)
  c.recoveryUntil=at+14*DAY
  cure(unit,c,at,'Bankruptcy ended by recapitalization')
  markSupport(c,at)
}
export function dividendPool(c:Company,now:number,cutoff=c.nextDividend){
  if(locked(c,cutoff)||!eligible(c))return 0
  return Math.min(ratio(Math.max(0,c.profit-c.loss),c.policy.dividends),cashForDistribution(c,now))
}
function distribute(unit:UnitOfWork,e:Companies,c:Company,now:number){
  if(now<c.nextDividend)return
  const at=c.nextDividend,first=at
  c.nextDividend=nextAmsterdamMidnight(now)
  const pool=dividendPool(c,now,first)
  const clear=c.profit-c.loss
  c.loss=Math.max(0,-clear);c.profit=0
  const owners=eligible(c)
  let paid=0
  const day=amsterdamDay(at)
  if(pool)for(const [name,shares] of Object.entries(c.holders)){
    const units=ratio(pool,shares,owners)
    if(!units)continue
    if(residentHolder(name))e.residents[name]+=units
    else if(name===PE)e.peCash+=units
    else{
      const account=unit.users.get(name)
      if(!account)continue
      wallet(account);income(account,units,now)
      const p=portfolio(account),field=c.symbol==='CAS'?'dividendsPaid':'bankDividendsPaid',amount=fromStockUnits(units)
      p.dividends.unshift({at,day,shares,amount,symbol:c.symbol})
      notify(account,{kind:'casino',title:`${c.symbol} dividend received`,detail:`You got ${amount} coins from ${c.symbol} dividends.`,code:c.symbol})
      unit.economyUsage(account.name,'/api/stocks',{action:'dividend',symbol:c.symbol,shares,coins:amount},at)
      p[field]=fromStockUnits(cashUnits(p[field]??0)+units)
    }
    paid+=units
  }
  c.cash-=paid
  c.lastDividend={day,pool:fromStockUnits(pool),paid:fromStockUnits(paid)}
  if(paid){
    journal(c,'Shareholder dividends',-paid,at)
    unit.economyUsage(undefined,'/api/stocks',{action:'dividend',symbol:c.symbol,coins:fromStockUnits(paid)},at)
  }
}

function invest(unit:UnitOfWork,e:Companies,now:number){
  if(now<e.nextPE&&(e.peLadder||e.nextPE>now+DAY))return
  e.nextPE=now+DAY;e.peLadder=true
  for(const c of [e.CAS,e.BNK]){
    cancelOrders(unit,e,c,o=>o.holder===PE,now)
    const balance=Math.max(0,assets(c)-liabilities(c,now)),earnings=Math.max(0,c.profit-c.loss)
    const value=Math.floor((balance*(c.symbol==='CAS'?3.6:1)+Math.min(balance,earnings*4))/c.issued)
    const held=sharesOf(c,PE),bestAsk=book(c,'sell')[0]?.price??Infinity,bestBid=book(c,'buy')[0]?.price??0
    const budget=Math.floor(e.peCash*.055)
    let buyRoom=Math.max(0,Math.floor(c.issued*.45)-held),sellRoom=held
    for(const [index,discount] of [.91,.83,.72].entries()){
      // Place backed standing orders on both sides without setting the market mark.
      const bid=Math.min(bestAsk-1,Math.floor(c.price*discount),Math.max(1,Math.floor(value*(discount-.15))))
      const ask=Math.max(bestBid+1,Math.ceil(c.price*(1+(index+1)*.08)),Math.ceil(value*(1.19+index*.11)))
      const buy=Math.min(1500*(index+1),buyRoom,bid>0?Math.floor(budget/bid):0)
      const sell=Math.min(1500*(index+1),sellRoom)
      if(buy>0){submit(unit,e,c,{id:randomUUID(),holder:PE,side:'buy',price:bid,shares:buy},now);buyRoom-=buy}
      if(sell>0){submit(unit,e,c,{id:randomUUID(),holder:PE,side:'sell',price:ask,shares:sell},now);sellRoom-=sell}
    }
  }
}

export function advanceEconomy(unit:UnitOfWork,e:Companies,now:number){
  advancePrison(unit,e,now)
  const borrowers=unit.borrowers().map(name=>unit.users.get(name)!).filter(Boolean)
  for(const account of borrowers)updateCredit(account,now)
  postCreditCollections(unit,borrowers,now,e)
  const c=e.CAS,b=e.BNK
  if(c.loan&&now>=c.loan.due&&c.cash>=debt(c,now)+c.pending+c.obligations){
    repayCorporate(unit,e,now)
  }
  for(const company of [c,b]){
    coverOperatingCosts(company,now)
    declare(unit,company,now)
    if(company.bankruptcy&&shortfall(company,now)===0)cure(unit,company,now,'Bankruptcy ended after financial recovery')
  }
  rescueVote(unit,e,now)
  for(const company of [c,b])recapitalize(unit,e,company,now)
  maintainOrders(unit,e,now)
  invest(unit,e,now)
  for(const company of [c,b]){
    markSupport(company,now)
    distribute(unit,e,company,now)
  }
  closeOrdinary(unit,e,now)
  const slot=noon(now)
  if(slot>e.lastSlot){
    e.lastSlot=slot
    const candidates=[c,b].flatMap(company=>locked(company,now)?[]:proposalKeys(company).flatMap(([policy,value])=>{
      const mark=company.marks[key(policy,value)],voting=eligible(company)
      return mark&&mark.shares*20>voting&&(company.cooldowns[policy]??0)<=now&&company.policy[policy]!==value
        ?[{company,policy,value,mark,pct:mark.shares/voting}]:[]
    }))
    const next=candidates.sort((x,y)=>y.pct-x.pct||x.mark.reached-y.mark.reached)[0]
    if(next&&!e.ballot){
      const b=e.ballot=ballot(next.company,next.policy,next.value,slot*DAY+DAY/2+DAY)
      unit.economyUsage(undefined,'/api/stocks/vote',{action:'ballot_opened',reference:b.id,symbol:b.symbol,policy:b.policy,value:b.value},now)
      if(b.snapshot[PE]&&b.policy!=='open'){
        const target=(rescuedPolicies[next.company.symbol] as Record<string,number>)[b.policy]
        const current=next.company.policy[b.policy]
        if(target!==undefined)b.votes[PE]=Math.abs(b.value-target)<Math.abs(current-target)?'yes':'no'
      }
      closeOrdinary(unit,e,now)
    }
  }
  saveCompanies(unit,e)
}
export function maintainEconomy(unit:UnitOfWork,now=Date.now()){
  advanceEconomy(unit,companies(unit,now),now)
}

export function companyView(e:Companies,c:Company,name:string,now:number):CompanyView{
  const b=c.bankruptcy,active=e.ballot?.symbol===c.symbol?e.ballot:c.symbol==='BNK'?e.CAS.bankruptcy?.offer:undefined
  const ballotFor=(active:Ballot):BallotView=>({id:active.id,symbol:active.symbol,policy:active.policy,value:active.value,ends:active.ends,
    ...tally(active),weight:active.snapshot[name]??0,choice:active.votes[name]})
  return {symbol:c.symbol,issued:c.issued,inventory:c.inventory,privateEquity:sharesOf(c,PE),
    ownership:Object.entries(c.holders).sort((a,b)=>b[1]-a[1]).map(([name,shares])=>({name:holderLabel(name),shares})),
    cash:fromStockUnits(c.cash),assets:fromStockUnits(assets(c)),liabilities:fromStockUnits(liabilities(c,now)),
    profit:fromStockUnits(c.profit),losses:fromStockUnits(c.loss),availableCapital:fromStockUnits(lendable(c.symbol==='BNK'?c:e.BNK,now)),
    policies:c.policy,cooldowns:c.cooldowns,supports:Object.fromEntries(Object.entries(c.marks).map(([k,v])=>[k,v.shares])),
    supported:Object.entries(c.supports).flatMap(([p,s])=>Object.keys(s[name]?.options??{}).map(v=>key(p,Number(v)))),
    eligible:eligible(c),votingShares:sharesOf(c,name),...orderBookView(c,name),
    trades:c.trades.slice(-35).reverse().map(t=>({...t,buy:holderLabel(t.buy),sell:holderLabel(t.sell),price:fromStockUnits(t.price)})),
    ballot:active&&ballotFor(active),rescueBallot:c.symbol==='BNK'&&e.CAS.bankruptcy?.offer?ballotFor(e.CAS.bankruptcy.offer):undefined,lastBallot:c.lastBallot,recoveryUntil:c.recoveryUntil,
    bankruptcy:b&&{at:b.at,day7:b.at+DAY*7,need:fromStockUnits(b.need),outcome:b.outcome,
      stage:c.symbol==='CAS'?{index:b.stage,ends:b.at+DAY*(b.stage+1),support:rescueTally(c),selected:b.selected,mine:b.support[name]}:undefined},
    history:c.ledger.slice(-28).reverse().map(row=>({at:row.at,kind:row.kind,coins:fromStockUnits(row.units),shares:row.shares}))}
}
