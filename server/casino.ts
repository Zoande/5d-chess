import {randomBytes,randomInt} from 'node:crypto'
import {wallet,type EconomicAccount} from './economy.ts'
import {type Account} from './accounts.ts'
import {CASINO_OWNER,HOUSE_EDGE,PROFIT_TAX,MAX_CASINO_STAKE,grossMultiplier,rouletteWins,type CasinoBet,type CasinoRound,type CasinoState} from '../src/casino-model.ts'

type CasinoAccount=EconomicAccount&{casino?:CasinoState}
const reject=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status})}
const state=(account:CasinoAccount)=>account.casino??={sequence:0,recent:[]}
const units=(coins:number)=>Math.round(coins*10000)
const safeUnits=(coins:number)=>{const n=units(coins);if(!Number.isSafeInteger(n)||n<0)reject(409,'Balance is outside the supported range');return n}
/** 2% rift, then 36 equally likely numbered pockets. Standard outside bets return 2x. */
export function rouletteResult(ticket=randomInt(1800000)){
 if(!Number.isInteger(ticket)||ticket<0||ticket>=1800000)throw new Error('Invalid roulette draw')
 return ticket<36000?0:1+Math.floor((ticket-36000)/49000)
}
export function ensureCasinoOwner(accounts:Account[]){
 let owner=accounts.find(a=>a.name.toLowerCase()===CASINO_OWNER.toLowerCase())
 if(!owner){
  // A treasury without a usable password. Existing CasinoOwner accounts retain their login.
  owner={name:CASINO_OWNER,salt:randomBytes(16).toString('hex'),hash:'',wallet:{starterGranted:true,coins:0,inventory:[],loadout:{icon:'default',pieces:{}}}}
  accounts.push(owner)
 }
 return owner
}
export function casinoView(account:CasinoAccount){
 const s=state(account)
 return {coins:wallet(account).coins,nextSequence:s.sequence+1,recent:s.recent,houseEdge:HOUSE_EDGE,profitTax:PROFIT_TAX,taxAccount:CASINO_OWNER,maxStake:MAX_CASINO_STAKE}
}
export function validateBet(value:unknown):CasinoBet{
 if(!value||typeof value!=='object')reject(400,'A bet is required')
 const b=value as CasinoBet
 if(typeof b.requestId!=='string'||! /^[a-zA-Z0-9-]{12,80}$/.test(b.requestId))reject(400,'A valid request ID is required')
 if(!Number.isSafeInteger(b.sequence)||b.sequence<1)reject(400,'A valid round sequence is required')
 if(b.game!=='roulette'&&b.game!=='dice')reject(400,'Unknown game')
 if(!Number.isSafeInteger(b.stake)||b.stake<1||b.stake>MAX_CASINO_STAKE)reject(400,`Bet a whole number from 1 to ${MAX_CASINO_STAKE} coins`)
 if(b.game==='dice'){
  if(!Number.isInteger(b.choice)||Number(b.choice)<1||Number(b.choice)>6)reject(400,'Choose a die face from 1 to 6')
 }else if(!(Number.isInteger(b.choice)&&Number(b.choice)>=0&&Number(b.choice)<=36)&&!['white','black','odd','even','low','high'].includes(b.choice as string))reject(400,'Choose a roulette pocket or an outside bet')
 return {requestId:b.requestId,sequence:b.sequence,game:b.game,stake:b.stake,choice:b.choice}
}
/** Called inside the server's persisted mutation queue: debit, credit, tax and receipt are one save. */
export function casinoBet(account:Account,accounts:Account[],input:unknown,now=Date.now(),draw?:number){
 const bet=validateBet(input),s=state(account),old=s.recent.find(r=>r.requestId===bet.requestId)
 if(old){
  if(old.sequence!==bet.sequence||old.game!==bet.game||old.stake!==bet.stake||old.choice!==bet.choice)reject(409,'This request ID already belongs to a different bet')
  return {...casinoView(account),round:old}
 }
 if(bet.sequence!==s.sequence+1)reject(409,'This round has already settled or the sequence changed. Refresh the table.')
 const w=wallet(account),balance=safeUnits(w.coins),stake=bet.stake*10000
 if(balance<stake)reject(409,'Not enough coins')
 const result=bet.game==='roulette'?rouletteResult(draw):draw??randomInt(1,7)
 if(bet.game==='dice'&&(!Number.isInteger(result)||result<1||result>6))throw new Error('Invalid dice draw')
 const won=bet.game==='dice'?result===bet.choice:rouletteWins(bet.choice,result)
 const gross=won?Math.round(stake*grossMultiplier(bet.game,bet.choice)):0,profit=Math.max(0,gross-stake)
 const tax=profit/100,credited=gross-tax,next=balance-stake+credited
 // Integer stakes and the supported payout schedule make all amounts exact to 0.0001 coin.
 if(!Number.isSafeInteger(next)||!Number.isSafeInteger(tax))reject(409,'This bet exceeds the supported balance precision')
 let owner:Account|undefined,treasury=0
 if(tax){owner=accounts.find(a=>a.name.toLowerCase()===CASINO_OWNER.toLowerCase());treasury=owner?safeUnits(wallet(owner).coins):0;if(!Number.isSafeInteger(treasury+tax))reject(409,'Treasury balance is outside the supported range')}
 const round:CasinoRound={...bet,id:randomBytes(12).toString('hex'),result,won,gross:gross/10000,profit:profit/10000,tax:tax/10000,credited:credited/10000,net:(credited-stake)/10000,created:now}
 w.coins=next/10000
 if(tax){owner??=ensureCasinoOwner(accounts);wallet(owner).coins=owner===account?(next+tax)/10000:(treasury+tax)/10000}
 s.sequence=bet.sequence;s.recent.unshift(round);s.recent.length=Math.min(100,s.recent.length)
 return {...casinoView(account),round}
}
