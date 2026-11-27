import type {ShareRegister} from '../floor-report.ts'
import {policies,rescueStages,type CompanyView} from '../equity-v2.ts'
import {casinoCoins} from '../casino-model.ts'
import type {EquitySymbol,StockView} from '../stock-model.ts'
import {coins,safeText} from './services.ts'

const fmt=(n:number)=>casinoCoins(n)
const when=(n:number)=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(n)
const pct=(n:number,total:number)=>new Intl.NumberFormat(undefined,{style:'percent',maximumFractionDigits:2}).format(total?n/total:0)
const colors=['#e5bb75','#90b9d4','#a8d29d','#ba9bce','#e99e94','#74b6ac','#d0cb9b','#c8a572']
export function ownershipSegments(c:ShareRegister):[string,number,string][]{
  const major=c.ownership.filter(h=>h.shares>=c.issued*.01).slice(0,8)
  const small=c.issued-c.inventory-major.reduce((n,h)=>n+h.shares,0)
  const list:[string,number,string][]=major.map((h,i)=>[h.name,h.shares,colors[i]])
  if(small)list.push(['Other investors',small,'#8b9b76'])
  if(c.inventory)list.push(['Unsold shares',c.inventory,'#677282'])
  return list
}
const optionLabel=(policy:string,value:number)=>{
  if(policy==='open')return value?'Open':'Paused'
  if(policy==='stake')return coins(value)
  if(policy==='edge'||policy==='rates'||policy==='interest')return fmt(value/100)+'%'
  if(policy==='term')return value+' days'
  return value+'%'
}
function voting(c:CompanyView,data:StockView){
  const ballots=[c.ballot,...(c.rescueBallot?.id!==c.ballot?.id?[c.rescueBallot]:[])].filter(b=>b!==undefined),cas=data.companies.CAS.bankruptcy
  const stage=c.bankruptcy?.stage,step=stage&&rescueStages[stage.index]
  const options=policies[c.symbol] as Record<string,{label:string;options:readonly number[]}>
  return `<div class="world-board-mast"><div><small>Your voting power</small><b>${pct(c.votingShares,c.eligible)}</b><span>${fmt(c.votingShares)} eligible shares</span></div><div><small>Current ballots</small><b>${ballots.length}</b><span>Daily selection at 12:00 UTC</span></div><button type="button" data-equity-refresh aria-label="Refresh board">↻</button></div>
    ${ballots.length?ballots.map(active=>`<section class="world-ballot"><h3>${active.policy==='rescue'?'CAS rescue loan':safeText(options[active.policy]?.label??active.policy)+' · '+optionLabel(active.policy,active.value)}</h3>
    ${active.policy==='rescue'&&cas?.stage?`<p>${coins(cas.need*cas.stage.selected[0]/100)} · ${cas.stage.selected[1]} days · ${optionLabel('interest',cas.stage.selected[2])} daily</p>`:''}
    <div class="world-ballot-track" style="--yes:${active.eligible?active.yes/active.eligible*100:0}%;--no:${active.eligible?active.no/active.eligible*100:0}%"></div>
    <div class="world-vote-tallies"><span>Yes <b>${pct(active.yes,active.eligible)}</b></span><span>No <b>${pct(active.no,active.eligible)}</b></span><span>Abstaining <b>${pct(active.eligible-active.yes-active.no,active.eligible)}</b></span></div>
    <p class="world-muted">Closes ${when(active.ends)} · Your ballot weight ${fmt(active.weight)} shares</p>
    ${active.choice?`<p>You voted ${active.choice}.</p>`:active.weight?`<div class="world-button-row"><button data-vote="yes" data-ballot="${active.id}">Vote yes</button><button data-vote="no" data-ballot="${active.id}">Vote no</button></div>`:'<p>No voting shares at ballot opening.</p>'}</section>`).join(''):'<section class="world-ballot"><h3>No active ballot</h3><p>Support a policy below to help put it on the next ballot.</p></section>'}
    ${step&&stage?`<section class="world-ballot"><h3>Rescue loan · ${step.label}</h3><p>Closes ${when(stage.ends)}</p><div class="world-policy-buttons">${step.options.map(v=>`<button type="button" data-rescue="${v}" data-on="${!stage.mine?.includes(v)}" aria-pressed="${!!stage.mine?.includes(v)}"><b>${optionLabel(step.key,v)}</b><small>${fmt(stage.support[v]??0)} shares</small></button>`).join('')}</div></section>`:''}
    ${c.lastBallot?`<p class="world-muted">Last vote · ${safeText(options[c.lastBallot.policy]?.label??c.lastBallot.policy)} ${c.lastBallot.passed?'passed':'closed without approval'}.</p>`:''}
    <h3>Policy proposals</h3><p class="world-muted">You can support several options. An option needs more than 5% support to qualify.</p>
    ${Object.entries(options).map(([policy,{label,options:values}])=>`<details class="world-policy"><summary>${label}<small>${c.policies[policy]===undefined?'':optionLabel(policy,c.policies[policy])}</small></summary>
      ${c.cooldowns[policy]>data.now?`<p>Available again ${when(c.cooldowns[policy])}</p>`:''}
      <div class="world-policy-buttons">${values.map(value=>{const on=c.supported.includes(policy+':'+value);return `<button type="button" data-policy="${policy}" data-value="${value}" data-on="${!on}" aria-pressed="${on}" ${c.votingShares?'':'disabled'}><b>${optionLabel(policy,value)}</b><small>${pct(c.supports[policy+':'+value]??0,c.eligible)} support</small></button>`}).join('')}</div></details>`).join('')}`
}
export function companyContent(symbol:EquitySymbol,data:StockView){
  const c=data.companies[symbol]
  const status=c.bankruptcy?`<p class="world-equity-status"><strong>Bankruptcy</strong> · Recapitalization due ${when(c.bankruptcy.day7)}. ${safeText(c.bankruptcy.outcome??'')}</p>`:
    c.recoveryUntil>data.now?`<p class="world-equity-status"><strong>In recovery</strong> · Policy changes resume ${when(c.recoveryUntil)}.</p>`:''
  return `<div class="world-equity-body">${status}${voting(c,data)}</div>`
}
