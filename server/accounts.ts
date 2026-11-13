import {randomBytes} from 'node:crypto'
import {type Resolution,type State,type Player,playerCount,players,survivors} from '../src/model.ts'
import {type Notice,type Preferences,type Profile,type Rating,type RatingPool,POOLS,poolFor} from '../src/account-model.ts'
export interface Account {name: string; salt: string; hash: string; settings?: Preferences; ratings?: Record<RatingPool,Rating>; notifications?: Notice[]}
export interface RatingChange {before: number; after: number; delta: number; pool: RatingPool}
export interface RatedRoom {code: string; title: string; seats: Partial<Record<Player,string>>; state: State; results: Resolution[]; rated?: boolean; ratingStart?: Partial<Record<Player,number>>; ratingSettled?: boolean; ratingChanges?: Partial<Record<Player,RatingChange>>}
export function ensureAccount(account: Account) {
  account.settings ??= {avatar:'person',movement:'live',players:2,moveNotifications:true}
  account.ratings ??= Object.fromEntries(POOLS.map(pool=>[pool,{value:1200,games:0}])) as Record<RatingPool,Rating>
  account.notifications ??= []
  return account as Account & {settings:Preferences;ratings:Record<RatingPool,Rating>;notifications:Notice[]}
}
export function profile(account: Account): Profile {
  const u=ensureAccount(account)
  return {name:u.name,settings:{...u.settings},ratings:structuredClone(u.ratings)}
}
export function notify(account: Account, notice: Omit<Notice,'id'|'created'|'read'>) {
  const u=ensureAccount(account)
  if (!u.settings.moveNotifications && !['rating','result'].includes(notice.kind)) return
  u.notifications.unshift({...notice,id:randomBytes(12).toString('hex'),created:Date.now(),read:false})
  u.notifications.length=Math.min(u.notifications.length,100)
}
export function startRatings(room: RatedRoom, accounts: Account[]) {
  if (!room.rated || room.ratingStart || Object.keys(room.seats).length!==playerCount(room.state)) return
  const pool=poolFor(room.state.movement,playerCount(room.state))
  room.ratingStart=Object.fromEntries(players(room.state).map(p=>[p,ensureAccount(accounts.find(a=>a.name===room.seats[p])!).ratings[pool].value]))
}
/** Equal K for all seats, normalized by opponents, with balanced integer rounding. */
export function eloChanges(ratings: readonly number[], placements: readonly number[], k=32): number[] {
  if (ratings.length<2 || ratings.length!==placements.length || !ratings.every(Number.isFinite) || !placements.every(Number.isFinite)) throw new Error('Invalid rating contest')
  const deltas=ratings.map(()=>0)
  for(let a=0;a<ratings.length;a++)for(let b=a+1;b<ratings.length;b++){
    const actual=placements[a]===placements[b] ? .5 : placements[a]>placements[b] ? 1 : 0
    const expected=1/(1+10**((ratings[b]-ratings[a])/400))
    const change=k/(ratings.length-1)*(actual-expected)
    deltas[a]+=change;deltas[b]-=change
  }
  const rounded=deltas.map(Math.round)
  let balance=-rounded.reduce((a,b)=>a+b,0)
  while(balance){
    const direction=Math.sign(balance)
    const seat=deltas.map((value,i)=>({i,error:(value-rounded[i])*direction})).sort((a,b)=>b.error-a.error||a.i-b.i)[0].i
    rounded[seat]+=direction;balance-=direction
  }
  return rounded
}
export function settleRatings(room: RatedRoom, accounts: Account[]): boolean {
  if (!room.rated || room.ratingSettled || !room.ratingStart || !room.results.length || survivors(room.state).length>1) return false
  const seats=players(room.state),pool=poolFor(room.state.movement,playerCount(room.state))
  if (seats.some(p=>room.ratingStart![p]===undefined || !accounts.some(a=>a.name===room.seats[p]))) return false
  const placements=seats.map(p=>{const eliminated=room.results.findIndex(r=>r.eliminated.includes(p));return eliminated<0?room.results.length:eliminated})
  const deltas=eloChanges(seats.map(p=>room.ratingStart![p]!),placements)
  room.ratingChanges={}
  for(const [i,p]of seats.entries()){
    const account=ensureAccount(accounts.find(a=>a.name===room.seats[p])!),rating=account.ratings[pool]
    const before=rating.value
    rating.value+=deltas[i];rating.games++
    room.ratingChanges[p]={before,after:rating.value,delta:deltas[i],pool}
    notify(account,{kind:'rating',code:room.code,title:`Rating ${deltas[i]>=0?'+':''}${deltas[i]}`,detail:`${room.title}: ${Math.round(before)} → ${Math.round(rating.value)} Elo.`})
  }
  room.ratingSettled=true
  return true
}
export function gameNotices(room: RatedRoom, accounts: Account[], actor: string, resolved: boolean) {
  const finished=survivors(room.state).length<=1
  for(const name of Object.values(room.seats)){
    const account=accounts.find(a=>a.name===name)
    if (!account || (!resolved&&name===actor)) continue
    const seat=players(room.state).find(p=>room.seats[p]===name)!
    const yourTurn=resolved&&!finished&&!room.state.eliminated.includes(seat)&&(room.state.movement!=='classic'||room.state.turn===seat)
    notify(account,{kind:finished?'result':yourTurn?'turn':'move',code:room.code,
      title:finished?'Game finished':yourTurn?'Your move':resolved?'Round resolved':`${actor} submitted moves`,
      detail:finished?`${room.title} has ended.`:yourTurn?`Play your Present boards in ${room.title}.`:resolved?`${room.title}: round ${room.state.round-1} is ready to review.`:`${room.title} is waiting for the remaining plans.`})
  }
}
