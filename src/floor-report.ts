import type {ExchangeSymbol,PricePoint} from './stock-model.ts'

export interface ShareRegister {
  issued:number
  inventory:number
  yourShares:number
  ownership:{name:string;shares:number}[]
}
export interface FloorReport {
  symbol:ExchangeSymbol
  register:ShareRegister
  price:number
  history:PricePoint[]
  asOf:number
  cash:number
  profit:number|null
  profitPeriod:'Today'|'This week'
  totalDividend:number
  yourDividend:number
  nextPayout:number
  lastPaid:number|null
}

// Local coordinates on opposite sides of the public floor.
export const DISPLAY_X=6.05,DISPLAY_Z=3.88

const amount=new Intl.NumberFormat('en',{maximumFractionDigits:4})
const amsterdam=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'})
export const reportTime=(at:number)=>amsterdam.format(at)
export function financeFigures(report:FloorReport):[string,string][]{
  return [
    [report.symbol==='LOT'?'Trading reserves':'Cash reserves',amount.format(report.cash)],
    [report.profitPeriod==='Today'?'Profit today':'Profit this week',report.profit===null?'Unavailable':amount.format(report.profit)],
    ['Estimated total dividend',amount.format(report.totalDividend)],
    ['Your estimated dividend',amount.format(report.yourDividend)]
  ]
}
