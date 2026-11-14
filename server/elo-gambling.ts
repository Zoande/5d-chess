import {randomBytes,randomInt} from 'node:crypto'
import {dayKey,nextReset} from '../src/collection.ts'
import {MAX_ELO_ROUNDS,MAX_ELO_STAKE,MIN_DICE_STAKE,type EloValuation,type EloGamblingView,type EncounterReason,type CasinoState,type CasinoRound} from '../src/casino-model.ts'
import {ensureAccount,profile,type Account} from './accounts.ts'
import {wallet} from './economy.ts'
import {casinoView} from './casino.ts'
import type {ChessStore,UnitOfWork} from './storage.ts'
import type {Reply} from './model.ts'
import {fail} from './http.ts'

const sigmoid=(n:number)=>1/(1+Math.exp(-n))
export function makeValuation(ratings:number[],now=Date.now()):EloValuation {
 const sorted=ratings.filter(Number.isFinite).sort((a,b)=>a-b)
 // Bounded, evenly spaced empirical quantiles keep quotes cheap at any population.
 const count=Math.min(201,sorted.length),samples=Array.from({length:count},(_,i)=>sorted[Math.floor((i+.5)*sorted.length/count)])
 return {day:dayKey(now),version:1,samples}
}
export function dailyValuation(unit:UnitOfWork,store:ChessStore,now=Date.now()):EloValuation {
 const old=unit.metadata<EloValuation>('eloGamblingValuation')
 if(old?.day===dayKey(now))return old
 const ranks=store.leaderboard(),played=ranks.filter(p=>p.games>0),snapshot=makeValuation((played.length?played:ranks).map(p=>p.rating),now)
 unit.putMetadata('eloGamblingValuation',snapshot);return snapshot
}
export function eloUnitPrice(elo:number,snapshot:EloValuation):number {
 const percentile=(snapshot.samples.reduce((sum,r)=>sum+sigmoid((elo-r)/90),0)+2*sigmoid((elo-1200)/220))/(snapshot.samples.length+2)
 const skill=Math.max(0,Math.min(5,(elo-600)/600))
 return Math.min(1000,.01+8*skill**3*(.5+percentile))
}
export function eloReward(elo:number,stake:number,snapshot:EloValuation):number {
 // Exactly `stake` points: 1800 staking 50 prices 1800 through 1751.
 let sum=0;for(let i=0;i<stake;i++)sum+=eloUnitPrice(Math.floor(elo)-i,snapshot)
 return Math.round(sum*10000)/10000
}
function dailyState(account:Account,now:number){
 const day=dayKey(now),old=account.eloGambling
 if(!old||old.day!==day)account.eloGambling={day,allowed:true,stage:'normal',used:0,lifetimeLost:old?.lifetimeLost??0}
 const state=account.eloGambling!;if(state.used>=MAX_ELO_ROUNDS){state.allowed=false;state.stage='normal'}
 return state
}
export function eloView(unit:UnitOfWork,account:Account,valuation:EloValuation,now=Date.now()):EloGamblingView {
 const s=dailyState(account,now),elo=ensureAccount(account).rating.value,max=Math.max(0,Math.min(MAX_ELO_STAKE,Math.floor(elo)))
 let total=0;const quotes=[0];for(let i=0;i<max;i++){total+=eloUnitPrice(Math.floor(elo)-i,valuation);quotes.push(Math.round(total*10000)/10000)}
 return {...s,elo,quotes,resetAt:nextReset(now),totalLost:unit.metadata<number>('eloGamblingLifetimeLost')??0}
}
function consentDay(data:Record<string,unknown>,s:ReturnType<typeof dailyState>){if(data.day!==s.day)fail(409,'The table has changed for a new day. Refresh your offer.')}
export function eloApi(unit:UnitOfWork,store:ChessStore,source:Account,path:string,method:string,data:Record<string,unknown>,now=Date.now(),draw?:number):Reply|undefined {
 if(!path.startsWith('/api/casino/elo'))return
 const account=ensureAccount(source),valuation=dailyValuation(unit,store,now),s=dailyState(account,now)
 const view=()=>eloView(unit,account,valuation,now)
 if(path==='/api/casino/elo'&&method==='GET')return {status:200,value:view()}
 if(method!=='POST')return
 if(path==='/api/casino/elo/trigger'){
  if(!['broke','marathon','chance'].includes(data.reason as string))fail(400,'Unknown encounter')
  let accepted=s.allowed&&s.used<MAX_ELO_ROUNDS&&account.rating.value>=1
  if(data.reason==='broke'){
   const recent=casinoView(account).recent.find(r=>r.game==='dice'&&!r.currency)
   accepted=accepted&&wallet(account).coins<MIN_DICE_STAKE&&!!recent&&!recent.won
  }
  if(accepted&&s.stage==='normal'){s.stage='offered';s.reason=data.reason as EncounterReason;s.offerId=randomBytes(12).toString('hex')}
  return {status:200,value:{accepted,...view()}}
 }
 if(path==='/api/casino/elo/decision'){
  consentDay(data,s)
  if(typeof data.accept!=='boolean'||data.offerId!==s.offerId||!s.offerId)fail(409,'This offer is no longer available.')
  if(!data.accept){s.allowed=false;s.stage='normal'}
  else if(s.allowed&&s.used<MAX_ELO_ROUNDS&&['offered','active'].includes(s.stage))s.stage='active'
  else fail(409,'This offer is no longer available.')
  return {status:200,value:view()}
 }
 if(path!=='/api/casino/elo/bet')return
 const b=data,casino=(account as Account&{casino?:CasinoState}).casino??={sequence:0,recent:[]}
 if(typeof b.requestId!=='string'||! /^[a-zA-Z0-9-]{12,80}$/.test(b.requestId))fail(400,'A valid request ID is required')
 const old=casino.recent.find(r=>r.requestId===b.requestId)
 if(old){
  if(b.currency!=='elo'||b.game!=='dice'||old.currency!=='elo'||old.stake!==b.stake||old.choice!==b.choice||old.sequence!==b.sequence||old.quoteDay!==b.quoteDay||old.eloRating!==b.eloRating)fail(409,'This request ID already belongs to a different bet')
  return {status:200,value:{...casinoView(account),round:old,profile:profile(account),eloGambling:view()}}
 }
 if(b.game!=='dice'||b.currency!=='elo'||!Number.isSafeInteger(b.stake)||Number(b.stake)<1||Number(b.stake)>MAX_ELO_STAKE||!Number.isInteger(b.choice)||Number(b.choice)<1||Number(b.choice)>6)fail(400,'Choose 1–100 Elo and a die face from 1 to 6')
 if(!Number.isSafeInteger(b.sequence)||b.sequence!==casino.sequence+1)fail(409,'The round sequence changed. Refresh the table.')
 if(!s.allowed||s.stage!=='active'||s.used>=MAX_ELO_ROUNDS)fail(409,'Elo wagers are closed until the next Dutch midnight.')
 if(b.quoteDay!==valuation.day||b.eloRating!==account.rating.value)fail(409,'Your Elo or the daily valuation changed. Review a new quote.')
 const stake=Number(b.stake);if(stake>Math.floor(account.rating.value))fail(409,'You cannot stake more Elo than you have.')
 const result=draw??randomInt(1,7);if(!Number.isInteger(result)||result<1||result>6)throw Error('Invalid dice draw')
 const reward=eloReward(account.rating.value,stake,valuation),won=result===b.choice,grossUnits=won?Math.round(reward*10000):0,taxUnits=0,creditedUnits=grossUnits
 const balance=Math.round(wallet(account).coins*10000)
 if(balance<0||!Number.isSafeInteger(balance)||!Number.isSafeInteger(balance+creditedUnits))fail(409,'This payout exceeds supported balance precision')
 const lost=won?0:stake,eloBefore=account.rating.value
 if(lost){account.rating.value-=lost;s.lifetimeLost+=lost;unit.putMetadata('eloGamblingLifetimeLost',(unit.metadata<number>('eloGamblingLifetimeLost')??0)+lost)}
 wallet(account).coins=(balance+creditedUnits)/10000
 const round:CasinoRound={currency:'elo',game:'dice',choice:Number(b.choice),stake,sequence:Number(b.sequence),requestId:b.requestId,quoteDay:valuation.day,eloRating:eloBefore,id:randomBytes(12).toString('hex'),result,won,gross:grossUnits/10000,profit:grossUnits/10000,tax:taxUnits/10000,credited:creditedUnits/10000,net:creditedUnits/10000,eloLost:lost,eloAfter:account.rating.value,coinReward:reward,created:now}
 s.used++;if(s.used>=MAX_ELO_ROUNDS){s.allowed=false;s.stage='normal'}else if(account.rating.value<1)s.stage='normal'
 casino.sequence=round.sequence;casino.recent.unshift(round);casino.recent.length=Math.min(100,casino.recent.length)
 return {status:200,value:{...casinoView(account),round,profile:profile(account),eloGambling:view()}}
}
