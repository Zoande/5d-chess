export const HOUSE_EDGE=0.02
export const PROFIT_TAX=0.01
export const CASINO_OWNER='CasinoOwner'
export const MAX_CASINO_STAKE=100000
export type CasinoGame='roulette'|'dice'
export type RouletteChoice=number|'white'|'black'|'odd'|'even'|'low'|'high'
export const ROULETTE_ORDER=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]
const ivory=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
export const pocketColor=(pocket:number)=>pocket===0?'rift':ivory.has(pocket)?'white':'black'
export function rouletteWins(choice:RouletteChoice,result:number){
 if(typeof choice==='number')return choice===result
 if(result===0)return false
 if(choice==='white'||choice==='black')return pocketColor(result)===choice
 return choice==='odd'?result%2===1:choice==='even'?result%2===0:choice==='low'?result<=18:result>=19
}
export const grossMultiplier=(game:CasinoGame,choice:RouletteChoice)=>game==='dice'?5.88:typeof choice==='number'?choice===0?49:36:2
export const winProbability=(game:CasinoGame,choice:RouletteChoice)=>game==='dice'?1/6:typeof choice==='number'?choice===0?.02:.98/36:.49
export interface CasinoBet {currency?:'elo';quoteDay?:string;eloRating?:number;requestId:string;sequence:number;game:CasinoGame;stake:number;choice:RouletteChoice}
export interface CasinoRound extends CasinoBet {id:string;result:number;won:boolean;gross:number;profit:number;tax:number;credited:number;net:number;created:number;eloLost?:number;eloAfter?:number;coinReward?:number}
export interface CasinoState {sequence:number;recent:CasinoRound[]}
export interface CasinoView {coins:number;nextSequence:number;recent:CasinoRound[];houseEdge:number;profitTax:number;taxAccount:string;maxStake:number}
export interface CasinoReply extends CasinoView {round:CasinoRound}
export const casinoCoins=(value:number)=>new Intl.NumberFormat('en',{maximumFractionDigits:4}).format(value)

export const MIN_DICE_STAKE=1
export const MAX_ELO_STAKE=100
export const MAX_ELO_ROUNDS=5
export type EncounterReason='broke'|'marathon'|'chance'
export interface EloGamblingState {day:string;allowed:boolean;stage:'normal'|'offered'|'active';used:number;lifetimeLost:number;reason?:EncounterReason;offerId?:string}
export interface EloGamblingView extends EloGamblingState {elo:number;quotes:number[];resetAt:number;totalLost:number}
export interface EloValuation {day:string;version:1;samples:number[]}
export const cycleEloStake=(current:number,increment:number,max=100)=>max<1?0:((current+increment-1)%max)+1
