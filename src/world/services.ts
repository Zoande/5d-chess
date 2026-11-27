import {financeFigures,reportTime,type FloorReport} from '../floor-report.ts'
import {portfolioPerformance} from './portfolio-performance.ts'
import {DRINKS,type BarService} from './bar-menu.ts'
import {companyContent} from './company-desk.ts'
import {api,ApiError} from '../shell.ts'
import {casinoCoins} from '../casino-model.ts'
import {BANK_MIN_LOAN,BANK_TERMS,type BankReceipt,type BankView} from '../bank-model.ts'
import {EQUITY_ORDER_LIMIT} from '../equity-v2.ts'
import {bookQuote,cityQuote,fromStockUnits,CAS,MAX_STOCK_ORDER,QUOTE_MAX_AGE,isExchangeStock,isEquity,type EquitySymbol,type PricePoint,type StockOrder,type StockTrade,type StockView} from '../stock-model.ts'
import {StockChart} from '../stock-chart.ts'
import type {WorldUse} from './model.ts'
import {FLOOR_LIST} from './exchange-floors.ts'

export const coins=(n:number)=>casinoCoins(n)+' coins'
const escapeMap:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}
export const safeText=(text:string)=>text.replace(/[&<>"']/g,c=>escapeMap[c])
export const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'Europe/Amsterdam'})
const stockName=(ticker:string)=>ticker==='LOT'?'Royal Weekly Lottery':FLOOR_LIST.find(s=>s.symbol===ticker)?.name??ticker
type BankOrder={id:string;sequence:number;amount:number|null;days?:number;loanId?:string;kind:'borrow'|'repay'}

export class CityServices {
  protected host:HTMLElement
  private token=0
  private busy=false
  private digest=''
  private orderSide:'buy'|'sell'='buy'
  private history=new Map<string,PricePoint[]>()
  private chart?:StockChart
  protected dialog:HTMLDialogElement
  private floorAction:(symbol:string)=>void
  private balance:(coins:number)=>void
  private account:string
  private refreshFloor:()=>void
  constructor(dialog:HTMLDialogElement,account:string,floorAction:(symbol:string)=>void,balance:(coins:number)=>void,refreshFloor:()=>void=()=>{}){
    this.dialog=dialog;this.host=dialog.querySelector('.world-dialog-body')!;this.account=account;this.floorAction=floorAction;this.balance=balance;this.refreshFloor=refreshFloor
    dialog.addEventListener('close',()=>{this.token++;this.chart?.dispose();this.chart=undefined;this.digest=''})
  }
  close(){if(this.dialog.open)this.dialog.close()}
  private get<T>(key:string){
    try{return JSON.parse(sessionStorage.getItem('world-service:'+this.account+':'+key)??'null') as T|null}catch{return null}
  }
  private save(key:string,value?:unknown){
    try{
      if(value===undefined)sessionStorage.removeItem('world-service:'+this.account+':'+key)
      else sessionStorage.setItem('world-service:'+this.account+':'+key,JSON.stringify(value))
    }catch{}
  }
  protected render(tag:string,title:string,body:string){
    this.host.innerHTML=`<header class="world-service-head"><div><span>${tag}</span><h2 id="world-dialog-title">${safeText(title)}</h2></div><form method="dialog"><button type="submit" aria-label="Close">×</button></form></header>${body}<p class="world-service-message" role="status" hidden></p>`
  }
  protected message(text:string){
    const p=this.host.querySelector<HTMLElement>('.world-service-message')
    if(p){p.textContent=text;p.hidden=!text}
  }
  async open(view:WorldUse,symbol?:string){
    const key=view+(symbol??'')
    if(this.digest===key&&this.dialog.open)return
    this.chart?.dispose();this.chart=undefined
    this.digest=key;const token=++this.token
    if(view==='elevator'){
      this.elevator()
      if(!this.dialog.open)this.dialog.showModal()
      return
    }
    const heading=view==='reception'?'Welcome to the Exchange':view==='advisor'?'Your portfolio':view==='board'?'Shareholder board':view==='loans'?'Loans':view==='payments'?'Payments':view==='reserve'?'Bank reserve':view==='credit'?'Credit advisor':stockName(symbol??'')
    const reading=view==='ownership-report'||view==='finance-report'
    this.render(reading||view==='trader'||view==='reception'||view==='advisor'||view==='board'?'EXCHANGE': 'FIFTH DIMENSION BANK',heading,'<p class="world-muted">Connecting…</p>')
    if(!this.dialog.open)this.dialog.showModal()
    try{
      if(reading&&symbol&&isExchangeStock(symbol)){
        const report=await api<FloorReport>('/stocks/floor?symbol='+symbol)
        if(token===this.token)this.floorReport(report,view==='finance-report')
      }else if(view==='reception')this.reception()
      else if(view==='advisor'||view==='trader'&&symbol||view==='board'&&symbol&&isEquity(symbol)){
        const data=await api<StockView>('/stocks')
        if(token!==this.token)return
        if(view==='advisor')this.advisor(data)
        else if(view==='board')this.company(symbol as EquitySymbol,data,token)
        else {this.orderSide='buy';this.stock(symbol!,data,token)}
      }else{
        const data=await api<BankView>('/bank')
        if(token===this.token)this.bank(view,data,token)
      }
    }catch(error){if(token===this.token)this.message(error instanceof Error?error.message:'Unavailable')}
  }
  private floorReport(report:FloorReport,finance:boolean){
    const {symbol,register}=report
    const tag=stockName(symbol)
    const metrics=(rows:[string,string][])=>'<div class="world-metrics">'+rows.map(([label,value])=>`<div><small>${label}</small><b>${value}</b></div>`).join('')+'</div>'
    if(finance){
      const figures=financeFigures(report).map(([label,value]):[string,string]=>[label,value==='Unavailable'?value:value+' coins'])
      this.render(tag,'Financial report',metrics(figures)+`<p>Next payout <strong>${reportTime(report.nextPayout)}</strong> (Amsterdam). Estimates use current earnings and holdings, before any personal loan deductions.</p>
        ${report.lastPaid===null?'':`<p>Last dividend paid to all holders · ${coins(report.lastPaid)}</p>`}
        <p>Reserves include cash committed to company buyback orders.${symbol==='LOT'?' Ticket proceeds are held separately until the draw.':''}</p>
        <small>Figures as of ${reportTime(report.asOf)} (Amsterdam).</small>`)
      return
    }
    const share=(n:number)=>new Intl.NumberFormat('en',{style:'percent',maximumFractionDigits:4}).format(n/register.issued)
    const rows=[...register.ownership,{name:'Unsold shares',shares:register.inventory}]
    this.render(tag,'Share register',metrics([['Shares issued',register.issued.toLocaleString('en')],['Your shares',register.yourShares.toLocaleString('en')+' · '+share(register.yourShares)]])+
      '<ul class="world-ledger">'+rows.map(h=>`<li><span>${safeText(h.name)}</span><b>${h.shares.toLocaleString('en')} · ${share(h.shares)}</b></li>`).join('')+'</ul>')
  }
  bar(order:BarService|undefined,buy:(drink:string,id:string)=>Promise<void>,stand:()=>Promise<void>,seated:boolean){
    this.render('ROYAL SALON','The bar',`<div class="world-drinks">${DRINKS.map(drink=>`<article><i style="--drink:#${drink.color.toString(16)}"></i><div><h3>${drink.name}</h3><p>${drink.note}</p></div><button type="button" data-drink="${drink.id}">${coins(drink.price)}</button></article>`).join('')}</div>${seated?'<button type="button" data-bar-stand>Leave stool</button>':''}`)
    if(!this.dialog.open)this.dialog.showModal()
    if(order)this.message('Your drink is at the counter.')
    this.host.querySelectorAll<HTMLButtonElement>('[data-drink]').forEach(button=>button.onclick=async()=>{
      button.disabled=true
      try{await buy(button.dataset.drink!,crypto.randomUUID());this.close()}
      catch(error){this.message(error instanceof Error?error.message:'Please try again')}
      finally{button.disabled=false}
    })
    const leave=this.host.querySelector<HTMLButtonElement>('[data-bar-stand]')
    if(leave)leave.onclick=()=>void stand().then(()=>this.close()).catch(()=>{})
  }
  private elevator(){
    this.render('EXCHANGE TOWER','Choose a floor','<input type="search" aria-label="Search stocks" placeholder="Company, ticker or floor" class="world-floor-search"><div class="world-floor-list"></div>')
    const search=this.host.querySelector<HTMLInputElement>('input')!,list=this.host.querySelector<HTMLElement>('.world-floor-list')!
    const render=()=>{
      const q=search.value.trim().toLowerCase()
      const matches=FLOOR_LIST.map((stock,i)=>({...stock,floor:i+1})).filter(s=>!q||s.symbol.toLowerCase().includes(q)||s.name.toLowerCase().includes(q)||String(s.floor)===q)
      const sky='exchange crown apartments'.includes(q)?'<button type="button" data-floor="residences"><b>PH</b><span><strong>Exchange Crown</strong><small>Apartment reception</small></span></button>':''
      list.innerHTML=sky+(q?'':'<button type="button" data-floor=""><b>G</b><span>Reception</span></button>')+
        matches.map(s=>`<button type="button" data-floor="${s.symbol}"><b>${s.floor}</b><span><strong>${s.symbol}</strong> ${safeText(s.name)}</span><span aria-hidden="true">›</span></button>`).join('')
      if(!matches.length&&!sky)list.innerHTML='<p class="world-muted">No matching floors.</p>'
    }
    search.oninput=render
    list.onclick=e=>{
      const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-floor]')
      if(b)this.floorAction(b.dataset.floor!)
    }
    render()
  }
  private bank(view:WorldUse,data:BankView,token:number,notice=''){
    this.balance(data.coins)
    const loans=data.loans??(data.loan?[data.loan]:[]),loan=loans.find(l=>l.defaulted)??loans.find(l=>l.overdue)??loans[0],pending=this.get<BankOrder>('bank')
    const outstanding=loans.reduce((total,l)=>total+l.total,0)
    const tiles=loans.map(l=>`<li><span>${l.defaulted?'In default':l.overdue?'Overdue':'Due '+date.format(l.due)}<small>${l.rate}% daily · ${coins(l.interest)} accrued interest</small></span><b>${coins(l.total)}</b></li>`).join('')
    if(view==='credit'){
      const status=loan?.defaulted?'In default':loan?.overdue?'Payment overdue':loan?'Loan active':
        data.blockedUntil&&data.blockedUntil>data.now?'Borrowing paused':data.score<600?'Building credit':'In good standing'
      const note=loan?.defaulted?'Visit Payments to settle your debt. Automatic repayments also apply to incoming coins.':
        loan?(`You owe ${coins(outstanding)} across ${loans.length} active ${loans.length===1?'loan':'loans'}. Make a payment at the cashier’s desk.`):
        data.blockedUntil&&data.blockedUntil>data.now?('Your borrowing hold ends '+date.format(data.blockedUntil)+'.'):
        !data.lendingOpen?'The bank has paused new loans.':data.score<600?'You need a score of at least 600 to borrow.':
        ('Visit the lender for loans of up to '+coins(data.limit)+'.')
      this.render('FIFTH DIMENSION BANK','Credit advisor',`<div class="credit-summary"><div><small>Credit score</small><strong>${data.score}</strong><span>of 850</span></div><div><strong>${status}</strong><p>${note}</p></div></div>
        <details><summary>Building your score</summary><p>Repay qualifying loans on time. To count, a loan must be at least 300 coins, last at least seven days, and stay open for at least half its term.</p><p>Late payments lower your score. If a default has been cleared, your score gradually recovers while you remain debt-free.</p></details>`)
      return
    }
    if(view==='reserve'){
      this.render('FIFTH DIMENSION BANK','Bank reserve',`<div class="world-metrics"><div><small>Lending reserve</small><b>${coins(data.reserve)}</b></div><div><small>Exchange ticker</small><b>BNK</b></div></div><p>BNK checks for distributable profit at midnight in Amsterdam and notifies shareholders when it pays. Visit the BNK floor of the Exchange Tower to trade or vote.</p>`)
      return
    }
    if(view==='loans'){
      const limit=data.limit
      this.render('LENDING DESK','Loans',`<div class="world-metrics"><div><small>Available to borrow</small><b>${coins(limit)}</b></div><div><small>Credit score</small><b>${data.score}</b></div><div><small>Outstanding</small><b>${coins(outstanding)}</b></div><div><small>Daily interest</small><b>${data.rate}%</b></div></div>${
        limit<BANK_MIN_LOAN&&!pending?`<p class="world-muted">${data.blockedUntil&&data.blockedUntil>data.now?'Borrowing resumes '+date.format(data.blockedUntil)+'.':!data.lendingOpen?'New lending is paused.':data.score<600?'A credit score of 600 is required to borrow.':'You have less than the 100-coin minimum available.'}</p>`:
        `<form class="world-service-form"><label>Loan amount<input name="amount" type="number" inputmode="numeric" min="${BANK_MIN_LOAN}" max="${Math.max(limit,BANK_MIN_LOAN)}" value="${pending?.amount??BANK_MIN_LOAN}" required></label><label>Term<select name="term">${BANK_TERMS.map(t=>`<option value="${t.days}" ${(pending?.days??7)===t.days?'selected':''}>${t.days} days</option>`).join('')}</select></label><p data-estimate></p><button type="submit" class="world-primary">${pending?'Confirm pending loan':'Take out loan'}</button></form>`
      }${tiles?`<details><summary>Active loans (${loans.length})</summary><ul class="world-ledger">${tiles}</ul></details>`:''}<details><summary>Loan terms</summary><p>Your credit score sets your rate and borrowing limit. Pay early or in parts. Overdue payments can lower your score.</p></details>`)
      const form=this.host.querySelector<HTMLFormElement>('.world-service-form')
      if(form){
        const amount=form.elements.namedItem('amount') as HTMLInputElement,term=form.elements.namedItem('term') as HTMLSelectElement
        const estimate=()=>{
          const plan=BANK_TERMS.find(t=>t.days===Number(term.value))
          if(plan)form.querySelector('[data-estimate]')!.textContent='Total at term: '+coins(Number(amount.value)*(1+plan.days*data.rate/100))
        }
        form.oninput=estimate;estimate()
        if(pending?.kind==='borrow'){amount.disabled=true;term.disabled=true}
        form.onsubmit=e=>{e.preventDefault();void this.bankTrade(view,data,'borrow',Number(amount.value),Number(term.value),token)}
      }
    }else{
      const payment=pending?.kind==='repay'?pending:undefined
      this.render('CASHIER','Payments',`<div class="world-metrics"><div><small>Total debt</small><b>${coins(outstanding)}</b></div><div><small>Available in wallet</small><b>${coins(data.coins)}</b></div></div>${tiles?`<ul class="world-ledger">${tiles}</ul>`:'<p>No active loans.</p>'}${
        loan||payment?`<form class="world-service-form"><label>Loan<select name="loan" ${payment?'disabled':''}>${loans.map((l,i)=>`<option value="${safeText(l.id)}" ${(payment?.loanId??loan?.id)===l.id?'selected':''}>Loan ${i+1} · ${coins(l.total)} · due ${date.format(l.due)}</option>`).join('')}</select></label><label>Partial payment<input name="amount" type="number" inputmode="decimal" min=".0001" step=".0001" required ${payment?'disabled':''}></label><div class="world-button-row"><button type="submit" ${payment?'disabled':''}>Pay amount</button><button type="button" class="world-primary" data-full>${payment?'Confirm pending payment':'Repay in full'}</button></div><small>Payments cover accrued interest first.</small></form>`:''
      }<details><summary>Transaction history</summary>${data.receipts.length?'<ul class="world-ledger">'+data.receipts.slice(0,15).map(r=>`<li><span>${r.kind==='borrow'?'Loan issued':r.kind==='collection'?'Automatic repayment':'Payment'} · ${date.format(r.at)}</span><b>${coins(r.amount)}</b></li>`).join('')+'</ul>':'<p class="world-muted">No transactions yet.</p>'}</details>`)
      const form=this.host.querySelector<HTMLFormElement>('.world-service-form')
      if(form){
        const select=form.elements.namedItem('loan') as HTMLSelectElement,amount=form.elements.namedItem('amount') as HTMLInputElement
        const full=form.querySelector<HTMLButtonElement>('[data-full]')!
        const refresh=()=>{
          const chosen=loans.find(l=>l.id===select.value)
          amount.max=String(Math.min(data.coins,chosen?.total??0))
          full.disabled=!payment&&(!chosen||data.coins<chosen.total)
        }
        select.onchange=refresh;refresh()
        form.onsubmit=e=>{e.preventDefault();void this.bankTrade(view,data,'repay',Number(amount.value),undefined,token,select.value)}
        full.onclick=()=>void this.bankTrade(view,data,'repay',null,undefined,token,select.value)
      }
    }
    this.host.querySelectorAll<HTMLButtonElement>('.world-service-form button').forEach(b=>{if(this.busy)b.disabled=true})
    this.message(notice)
  }
  private async bankTrade(view:WorldUse,data:BankView,kind:'borrow'|'repay',amount:number|null,days:number|undefined,token:number,loanId?:string){
    if(this.busy)return
    const prior=this.get<BankOrder>('bank')
    if(prior&&prior.kind!==kind){this.message('Confirm the pending bank transaction at its counter.');return}
    const order=prior??{id:crypto.randomUUID(),sequence:data.sequence+1,kind,amount,days,loanId}
    this.save('bank',order);this.busy=true;this.bank(view,data,token,'Recording transaction…')
    let latest=data,note=''
    try{
      const result=await api<BankView&{receipt:BankReceipt}>('/bank/'+kind,order)
      latest=result;this.save('bank');this.balance(result.coins)
      note=kind==='borrow'?coins(result.receipt.amount)+' added to your wallet.':'Paid '+coins(result.receipt.amount)+'.'
    }catch(error){
      note=error instanceof Error?error.message:'Could not confirm transaction.'
      try{
        latest=await api<BankView>('/bank')
        const receipt=latest.receipts.find(r=>r.id===order.id)
        if(receipt){this.save('bank');note='Transaction confirmed. '+coins(receipt.amount)}
        else if(error instanceof ApiError&&error.status>=400&&error.status<500&&error.status!==408)this.save('bank')
      }catch{}
    }finally{
      this.busy=false
      if(token===this.token)this.bank(view,latest,token,note)
    }
  }
  private marketPrice(symbol:string,data:StockView){return cityQuote(data,symbol)?.price??data.quotes[symbol]?.price}
  private async stockHistory(symbol:string,token:number,seed:PricePoint[],color:string,chart:StockChart){
    let points=this.history.get(symbol)??seed,range=30
    const buttons=this.host.querySelectorAll<HTMLButtonElement>('[data-range]')
    const update=()=>{
      const cutoff=Date.now()-range*86_400_000
      chart.set(points.filter(p=>p.at>=cutoff),color)
      buttons.forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.range)===range)))
    }
    buttons.forEach(button=>button.onclick=()=>{range=Number(button.dataset.range);update()})
    update()
    if(isExchangeStock(symbol)||this.history.has(symbol))return
    try{
      const result=await api<{points:PricePoint[]}>('/stocks/history?symbol='+encodeURIComponent(symbol))
      this.history.set(symbol,result.points)
      if(token===this.token&&this.chart===chart){points=result.points;update()}
    }catch{}
  }
  private reception(){
    this.render('EXCHANGE RECEPTION','Welcome to the Exchange',`<div class="world-reception">
      <article><span>FLOOR DIRECTORY</span><h3>Trade with a broker</h3><p>Enter the elevator, pick a company, and speak to a broker on its floor. Use coins to buy and sell shares.</p></article>
      <article><span>FINANCIAL ADVISOR</span><h3>Follow your investments</h3><p>Visit the desk to your left for your holdings, daily performance and available cash.</p></article>
      <article><span>CAS AND BNK</span><h3>Own a piece of the city</h3><p>Prices follow completed trades. Shareholders can earn dividends and vote on company policy at the board table.</p></article>
      <article><span>PRI</span><h3>Meridian Prison</h3><p>Trade prison shares upstairs. Income from time served repays locked bank debt first. Shareholders split the remaining income every 24 hours.</p></article>
      <article><span>LOT</span><h3>Royal Weekly Lottery</h3><p>Buy tickets at the hotel. LOT brokers trade shares upstairs. Shareholders split 1% of weekly ticket sales.</p></article>
      <article><span>REFERENCE STOCKS</span><h3>Explore real-world companies</h3><p>These virtual shares track external prices. Your holdings stay in the game and are traded with coins.</p></article>
      </div>`)
  }
  private advisor(data:StockView,notice=''){
    this.balance(data.coins)
    const report=portfolioPerformance(data),holdings=report.rows.filter(row=>row.shares>0)
    const signed=(n:number|undefined)=>n===undefined?'—':`<span class="${n<0?'world-loss':'world-gain'}">${n>0?'+':''}${casinoCoins(n)}</span>`
    const amount=(units:number|undefined)=>units===undefined?'—':signed(fromStockUnits(units))
    const orders=[...Object.values(data.companies).flatMap(c=>c.orders.map(o=>({...o,symbol:c.symbol}))),...data.lottery.orders.map(o=>({...o,symbol:'LOT'})),...data.prison.orders.map(o=>({...o,symbol:'PRI'}))]
    const cards=holdings.map(row=>{
      const ticker=safeText(row.symbol),sale=data.saleQuotes[row.symbol]
      const reason=orders.some(o=>o.symbol===row.symbol&&o.side==='sell')?'Cancel open sell orders to sell this holding.':isExchangeStock(row.symbol)?'Waiting for enough bids to fill the holding.':'Waiting for a current quote.'
      return `<li><div class="advisor-stock-title"><div><strong>${ticker}</strong><span>${safeText(stockName(row.symbol))}</span></div><b>${row.value===undefined?'—':coins(fromStockUnits(row.value))}</b></div>
        <div class="advisor-position">${casinoCoins(row.shares)} shares · ${row.mark===undefined?'Price unavailable':coins(row.mark)+' each'} · Cost ${coins(row.cost)}</div>
        <div class="advisor-actions"><div><small>Today</small>${amount(row.daily)}</div><div><small>All time</small>${amount(row.lifetime)}</div>
        <button type="button" data-sell="${ticker}" aria-label="Sell all ${ticker} shares" ${sale===undefined?'disabled':''}>Sell all</button></div>
        ${sale===undefined?`<small>${reason}</small>`:''}<div data-confirm hidden></div></li>`
    }).join('')
    this.render('FINANCIAL ADVISOR','Your portfolio',`<section class="advisor-summary" aria-label="Portfolio summary">
      <div><small>Holdings value</small><strong>${report.value===undefined?'—':coins(report.value)}</strong></div><div><small>Cash available</small><b>${coins(data.coins)}</b></div></section>
      <div class="advisor-returns"><div><small>Today’s gain</small><b>${signed(report.daily)}</b></div><div><small>All-time gain</small><b>${signed(report.lifetime)}</b></div><div><small>Dividends paid</small><b>${casinoCoins(report.dividends)}</b></div></div>
      <p class="advisor-note">Gains in coins include sales, dividends and changes in share value. Today starts at midnight in Amsterdam.${report.daily===undefined||report.lifetime===undefined?' A dash means price or trade history is incomplete.':''}</p>
      <div class="advisor-list-head"><h3>Holdings (${holdings.length})</h3><button type="button" data-refresh>Refresh</button></div>
      ${cards?`<ul class="advisor-holdings">${cards}</ul>`:'<p class="advisor-note">You hold no shares. Visit a broker upstairs to buy your first stock.</p>'}
      ${orders.length?`<details><summary>Open orders (${orders.length})</summary><ul class="world-ledger">${orders.map(o=>`<li><span>${safeText(o.symbol)} · ${o.side==='buy'?'Buy':'Sell'} ${casinoCoins(o.shares)} at ${casinoCoins(o.price)}</span><button type="button" data-cancel="${safeText(o.id)}" data-symbol="${safeText(o.symbol)}">Cancel</button></li>`).join('')}</ul></details>`:''}`)
    this.message(notice)
    const token=this.token
    const request=async(path:string,body?:StockOrder|{symbol:string;id:string},success='')=>{
      if(this.busy)return
      this.busy=true
      const buttons=this.host.querySelectorAll<HTMLButtonElement>('button:enabled:not([aria-label="Close"])')
      buttons.forEach(b=>b.disabled=true)
      try{
        const next=await api<StockView>(path,body)
        if(token===this.token)this.advisor(next,success)
      }catch(error){
        const message=error instanceof Error?error.message:'Unable to complete the request'
        try{
          const latest=await api<StockView>('/stocks')
          if(token===this.token)this.advisor(latest,message)
        }catch{if(token===this.token)this.message(message)}
      }finally{this.busy=false;buttons.forEach(b=>b.disabled=false)}
    }
    this.host.querySelector<HTMLButtonElement>('[data-refresh]')!.onclick=()=>void request('/stocks')
    this.host.querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach(b=>b.onclick=()=>void request('/stocks/cancel',{symbol:b.dataset.symbol!,id:b.dataset.cancel!},'Order canceled.'))
    this.host.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach(b=>b.onclick=()=>{
      const symbol=b.dataset.sell!,shares=data.portfolio.positions[symbol].shares,total=data.saleQuotes[symbol]
      const box=b.closest('li')!.querySelector<HTMLElement>('[data-confirm]')!
      if(!box.hidden)return
      const order:StockOrder={symbol,shares,total,side:'sell',sellAll:true,sequence:data.portfolio.sequence+1,id:crypto.randomUUID()}
      box.hidden=false
      box.innerHTML=`<p>Sell all <strong>${casinoCoins(shares)} ${safeText(symbol)}</strong> shares for ${coins(total)}?</p><button type="button" data-back>Keep shares</button> <button type="button" class="world-primary" data-execute>Confirm sale</button>`
      const back=box.querySelector<HTMLButtonElement>('[data-back]')!
      back.onclick=()=>{box.hidden=true;box.replaceChildren();b.focus()};back.focus()
      box.querySelector<HTMLButtonElement>('[data-execute]')!.onclick=()=>void request(isExchangeStock(symbol)?'/stocks/market':'/stocks/trade',order,`Sold ${casinoCoins(shares)} ${symbol} for ${coins(total)}.`)
    })
  }
  private company(symbol:EquitySymbol,data:StockView,token:number,notice=''){
    this.balance(data.coins)
    const open=[...this.host.querySelectorAll<HTMLDetailsElement>('.world-policy')].map(d=>d.open)
    this.chart?.dispose();this.chart=undefined
    this.render(symbol+' SHAREHOLDERS',stockName(symbol)+' board',companyContent(symbol,data))
    this.host.querySelectorAll<HTMLDetailsElement>('.world-policy').forEach((d,i)=>{d.open=!!open[i]})
    this.message(notice)
    const request=async(action:string,input:Record<string,unknown>,success:string)=>{
      if(this.busy)return
      this.busy=true
      const buttons=[...this.host.querySelectorAll<HTMLButtonElement>('button:not([aria-label=Close]):enabled')]
      buttons.forEach(b=>b.disabled=true)
      try{
        const next=await api<StockView>(action==='refresh'?'/stocks':'/stocks/'+action,action==='refresh'?undefined:{symbol,...input})
        if(token===this.token)this.company(symbol,next,token,success)
      }catch(error){
        if(token===this.token)this.message(error instanceof Error?error.message:'Please try again')
      }finally{this.busy=false;buttons.forEach(b=>b.disabled=false)}
    }
    this.host.querySelector<HTMLButtonElement>('[data-equity-refresh]')!.onclick=()=>void request('refresh',{},'')
    this.host.querySelectorAll<HTMLButtonElement>('[data-policy]').forEach(b=>b.onclick=()=>void request('support',{policy:b.dataset.policy,value:Number(b.dataset.value),on:b.dataset.on==='true'},'Support updated.'))
    this.host.querySelectorAll<HTMLButtonElement>('[data-rescue]').forEach(b=>b.onclick=()=>void request('rescue',{value:Number(b.dataset.rescue),on:b.dataset.on==='true'},'Rescue support updated.'))
    this.host.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach(b=>b.onclick=()=>void request('vote',{id:b.dataset.ballot,choice:b.dataset.vote},'Vote recorded.'))
  }
  private stock(symbol:string,data:StockView,token:number,notice=''){
    this.balance(data.coins)
    const holding=data.portfolio.positions[symbol],price=this.marketPrice(symbol,data),issue=cityQuote(data,symbol),saved=this.get<StockOrder>('stock')
    const company=isEquity(symbol)?data.companies[symbol]:symbol==='LOT'?data.lottery:symbol==='PRI'?data.prison:undefined,cap=company?EQUITY_ORDER_LIMIT:MAX_STOCK_ORDER
    const available=(holding?.shares??0)-(company?.orders.filter(o=>o.side==='sell').reduce((n,o)=>n+o.shares,0)??0)
    const pending=saved?.symbol===symbol?saved:undefined
    if(pending)this.orderSide=pending.side
    this.chart?.dispose();this.chart=undefined
    this.render(symbol,stockName(symbol),`<div class="world-trade-grid"><section><div class="world-price"><strong>${price===undefined?'Price unavailable':coins(price)}</strong><small>${issue?'Last traded price':'Nasdaq reference price'}</small>${issue?`<small>Best bid ${issue.bid?casinoCoins(issue.bid):'—'} · Best ask ${issue.ask?casinoCoins(issue.ask):'—'}</small>`:''}</div><div class="world-range" role="group" aria-label="Chart range"><button type="button" data-range="30">1M</button><button type="button" data-range="90">3M</button><button type="button" data-range="365">1Y</button></div><canvas data-chart tabindex="0" aria-label="Stock price history"></canvas><p data-readout class="world-muted"></p></section>
    <form class="world-service-form"><div class="world-button-row"><button type="button" data-side="buy" aria-pressed="${this.orderSide==='buy'}">Buy</button><button type="button" data-side="sell" aria-pressed="${this.orderSide==='sell'}">Sell</button></div><label>Shares<input name="shares" type="number" inputmode="numeric" min="1" max="${cap}" value="${pending?.shares??1}" required></label>${company?`<details ${pending?.price?'open':''}><summary>Set a limit price</summary><label>Price per share<input name="limit" type="number" inputmode="decimal" min=".0001" step=".0001" value="${pending?.price??''}" ${pending?'disabled':''}></label></details>`:''}<small>${coins(data.coins)} available · ${casinoCoins(available)} shares available</small><strong data-total></strong><button type="submit" class="world-primary" data-order></button></form></div>
    <details><summary>Portfolio</summary><ul class="world-ledger">${Object.entries(data.portfolio.positions).map(([ticker,h])=>`<li><span>${safeText(ticker)} · ${h.shares}</span><b>${coins((this.marketPrice(ticker,data)??0)*h.shares)}</b></li>`).join('')||'<li>No shares yet</li>'}</ul></details>
    <details><summary>Trade and dividend history</summary><ul class="world-ledger">${[...data.portfolio.trades.map(t=>({at:t.at,label:`${t.side==='buy'?'Bought':'Sold'} ${t.shares} ${t.symbol}`,amount:t.total})),...data.portfolio.dividends.map(d=>({at:Date.parse(d.day),label:(d.symbol??CAS)+' dividend',amount:d.amount}))].sort((a,b)=>b.at-a.at).slice(0,15).map(r=>`<li><span>${safeText(r.label)} · ${date.format(r.at)}</span><b>${coins(r.amount)}</b></li>`).join('')||'<li>No activity yet</li>'}</ul></details>`)
    const form=this.host.querySelector<HTMLFormElement>('.world-service-form')!,number=form.elements.namedItem('shares') as HTMLInputElement
    const limit=form.elements.namedItem('limit') as HTMLInputElement|null
    const target=()=>limit?.closest('details')?.open?Number(limit.value):0
    const estimate=()=>{
      const n=Number(number.value)
      if(!Number.isSafeInteger(n)||n<1||n>cap||price===undefined)return undefined
      if(company){
        const requested=target()
        if(limit?.closest('details')?.open)return Number.isFinite(requested)&&requested>0?{total:Math.round(requested*10_000)*n/10_000,limit:requested}:undefined
        return bookQuote(this.orderSide==='buy'?company.asks:company.bids,this.account,n)
      }
      if(data.now-data.quotes[symbol].updated>=QUOTE_MAX_AGE)return undefined
      return {total:Math.round(price*100)*n/100,limit:price}
    }
    const renderOrder=()=>{
      const total=estimate(),submit=form.querySelector<HTMLButtonElement>('[data-order]')!
      form.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.side===this.orderSide));b.disabled=!!pending||this.busy})
      form.querySelector('[data-total]')!.textContent=total===undefined?'Quote unavailable':(target()?'Limit total · ':company?'Est. total · ':'')+coins(total.total)
      submit.textContent=pending?'Confirm pending order':target()?'Place limit order':(this.orderSide==='buy'?'Buy ':'Sell ')+symbol
      submit.disabled=this.busy||!pending&&(total===undefined||(this.orderSide==='buy'?(company?total.limit*Number(number.value):total.total)>data.coins:Number(number.value)>available))
      number.disabled=!!pending||this.busy
    }
    form.oninput=renderOrder
    if(limit)limit.closest('details')!.ontoggle=renderOrder
    form.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(b=>b.onclick=()=>{this.orderSide=b.dataset.side==='sell'?'sell':'buy';renderOrder()})
    form.onsubmit=e=>{
      e.preventDefault()
      if(this.busy)return
      if(saved&&saved.symbol!==symbol){this.message('Confirm your other pending order first.');return}
      const total=estimate()
      if(total===undefined&&!pending)return
      const order=pending??{symbol,side:this.orderSide,shares:Number(number.value),id:crypto.randomUUID(),sequence:data.portfolio.sequence+1,total:total!.total,version:issue?.version,price:target()||undefined}
      void this.stockTrade(symbol,data,order,token,renderOrder)
    }
    renderOrder();this.message(notice)
    const chart=new StockChart(this.host.querySelector('canvas')!,this.host.querySelector('[data-readout]')!,!!issue)
    this.chart=chart
    void this.stockHistory(symbol,token,issue?.history??data.quotes[symbol]?.history??[],symbol===CAS?'#e6ba72':'#8ce1b2',chart)
  }
  private async stockTrade(symbol:string,data:StockView,order:StockOrder,token:number,renderOrder:()=>void){
    this.save('stock',order);this.busy=true;renderOrder()
    let latest=data,note=''
    try{
      const result=await api<StockView&{trade?:StockTrade}>(order.price?'/stocks/order':isExchangeStock(symbol)?'/stocks/market':'/stocks/trade',order)
      latest=result;this.save('stock');this.balance(result.coins);this.refreshFloor()
      note=result.trade?(result.trade.side==='buy'?'Bought ':'Sold ')+result.trade.shares+' '+symbol+'.':'Limit order received.'
    }catch(error){
      note=error instanceof Error?error.message:'Could not confirm order.'
      try{
        latest=await api<StockView>('/stocks')
        const found=latest.portfolio.trades.find(t=>t.id===order.id)
        if(found){this.save('stock');note='Order confirmed.'}
        else if(error instanceof ApiError&&error.status>=400&&error.status<500&&error.status!==408)this.save('stock')
      }catch{}
    }finally{
      this.busy=false
      if(token===this.token)this.stock(symbol,latest,token,note)
    }
  }
}
