import {type Kind,type Player} from './model.ts'
import {api,renderAccount} from './shell.ts'
import {type Profile} from './account-model.ts'
import {type Wallet,type Drop,type Collectible,ITEMS,SPIN_REWARDS,RARITY_COLORS,CRATE_ODDS,RARITIES,PAID_SPIN_PRICE,percent,itemById} from './collection.ts'
import {avatarArt} from './cosmetic-art.ts'
import {pieceIcon,skinSetIcon} from './art.ts'
import {icon} from './icons.ts'
export interface Economy {paidSpinPrice:number;wallet:Wallet;spinReady:boolean;reset:number;rotation:number;featured:string[];now:number;recent:Drop[]}
export interface RewardReply extends Economy {profile:Profile;drop?:Drop}
export const requestId=()=>crypto.randomUUID()
export function itemArt(item:Collectible,size=88,kind:Kind='N',player:Player='red'){return item.type==='icon'?avatarArt(item.id):pieceIcon(kind,player,size,item.id)}
export function itemCard(item:Collectible,kind:Kind='N',player:Player='red'){return `<span class="item-picture">${itemArt(item,88,kind,player)}</span><small class="rarity-label">${item.rarity}</small><strong>${item.name}</strong>`}
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches
export function countdown(to:number,now=Date.now()){let seconds=Math.max(0,Math.ceil((to-now)/1000));const days=Math.floor(seconds/86400);seconds%=86400;return `${days?days+'d ':''}${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
export function wheelSVG(){
 const colors=['#436749','#366574','#557947','#84603d','#b18a42','#3e6d98','#b2893d','#914e7a']
 const sectors=SPIN_REWARDS.map((r,i)=>{const a=i*Math.PI/4-Math.PI/2,b=a+Math.PI/4,mid=a+Math.PI/8,x=140+91*Math.cos(mid),y=140+91*Math.sin(mid)
 const p=(rad:number,angle:number)=>`${140+rad*Math.cos(angle)} ${140+rad*Math.sin(angle)}`
 return `<g class="wheel-segment" data-segment="${i}"><path d="M140 140 ${p(121,a)}A121 121 0 0 1 ${p(121,b)}Z" fill="${colors[i]}" stroke="#e9d496" stroke-width=".8"/><path d="M${p(114,a+.035)}A114 114 0 0 1 ${p(114,b-.035)}L${p(49,b-.08)}A49 49 0 0 0 ${p(49,a+.08)}Z" fill="none" stroke="#fff1bc" stroke-opacity=".2" stroke-width=".7"/><text x="${x}" y="${y}" fill="#fff4d5" font-size="${i>4?9:14}" font-family="Arial,sans-serif" font-weight="bold" text-anchor="middle" transform="rotate(${mid*180/Math.PI+90} ${x} ${y})">${r.label}</text><path d="M${p(57,mid)}l2 3-2 3-2-3Z" fill="#f1d598" opacity=".85"/></g>`}).join('')
 const bulbs=Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return `<circle class="wheel-bulb bulb-${i%2}" cx="${140+130*Math.cos(a)}" cy="${140+130*Math.sin(a)}" r="${i%4===0?2.3:1.4}" fill="#ffe6a3"/>`}).join('')
 return `<svg class="reward-wheel" viewBox="0 0 280 280" aria-hidden="true"><circle cx="140" cy="143" r="137" fill="#101710"/><circle cx="140" cy="140" r="137" fill="#352f21" stroke="#b19453" stroke-width="2"/><circle cx="140" cy="140" r="126" fill="#171d18" stroke="#e0c587" stroke-width="3"/><g class="wheel-disc">${sectors}</g><circle cx="140" cy="140" r="36" fill="#1d2820" stroke="#b89a53" stroke-width="3"/><circle cx="140" cy="140" r="30" fill="none" stroke="#f6dba3" stroke-opacity=".35"/><path d="M139 120h2v6h6v2h-6v4l10-4-4 15 3 7h-20l3-7-4-15 10 4v-4h-6v-2h6Z" fill="#ecd49b"/><path d="M134 146h12" stroke="#60532f" stroke-width="1"/>${bulbs}</svg>`
}
export const chestHTML=(tier=0)=>`<div class="chest-perspective"><div class="chess-chest tier-${tier}"><div class="chest-face chest-back"></div><div class="chest-face chest-left"></div><div class="chest-face chest-front"><div class="chest-panel"><span class="chest-crest">${icon('knight')}</span><b>5D CHESS</b><span class="chest-inscription">THE COLLECTION</span><span class="chest-serial">${['BRONZE · I','SILVER · II','GOLD · III'][tier]}</span></div><span class="chest-strap strap-left"></span><span class="chest-strap strap-right"></span>${[0,1,2,3].map(i=>`<span class="chest-rivet rivet-${i}"></span>`).join('')}<span class="crate-latch latch-left"></span><span class="crate-latch latch-right"></span></div><div class="chest-face chest-right"><span class="chest-handle"></span><span class="chest-side-seal">◆</span><span class="chest-vents"></span></div><div class="chest-lid"><span class="chest-top-rail rail-left"></span><span class="chest-top-rail rail-right"></span><span class="chest-top-crest">♔</span><span class="chest-lid-lip"></span></div><div class="chest-feet"></div></div><div class="chest-ground"></div><div class="chest-impact"></div></div>`
export function oddsHTML(tier:number){return RARITIES.map((r,i)=>`<span style="--rarity:${RARITY_COLORS[r]}"><i></i>${r} <b>${percent(CRATE_ODDS[tier][i])}</b></span>`).join('')}
let dialog:HTMLDialogElement|undefined,running=false
export async function revealDrop(drop:Drop,mode:'spin'|'crate',tier=0,onChange?:(data:RewardReply)=>void){
 if(running)return
 running=true
 dialog??=Object.assign(document.createElement('dialog'),{className:'reward-dialog'})
 if(!dialog.isConnected)document.body.append(dialog)
 const reward=itemById(drop.itemId??''),color=reward?RARITY_COLORS[reward.rarity]:'#e8c56c'
 dialog.className=`reward-dialog reward-v2 mode-${mode}`;dialog.dataset.phase='arrival';dialog.style.setProperty('--reward-color',color)
 dialog.innerHTML=`<div class="reward-heading"><div><p class="eyebrow">${mode==='spin'?(drop.paid?'ENCORE SPIN':'THE DAILY SPIN'):`${['BRONZE','SILVER','GOLD'][tier]} COLLECTION`}</p><h2>${mode==='spin'?'A turn of fortune.':'Something worth keeping.'}</h2></div><button type="button" class="text-button reward-skip">Skip animation</button></div><div class="reward-show"><div class="stage-floor" aria-hidden="true"><i></i><i></i><i></i></div><div class="reward-sparks" aria-hidden="true">${Array.from({length:32},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>${mode==='spin'?`<div class="wheel-machine"><div class="wheel-crown">◆</div><div class="wheel-stage"><div class="wheel-pointer"></div>${wheelSVG()}</div><div class="wheel-pedestal"><span>F O R T U N E</span></div></div>`:`<div class="crate-stage">${chestHTML(tier)}<div class="chest-beams" aria-hidden="true"><i></i><i></i><i></i></div></div><div class="reel-window" aria-label="Opening reel"><div class="reel-marker"></div><div class="reel-strip"></div><div class="reel-edge edge-left"></div><div class="reel-edge edge-right"></div></div>`}<p class="reveal-phase" role="status">${mode==='spin'?'Winding up':'A delivery from the multiverse'}</p></div><section class="reward-result" hidden aria-live="polite"></section>${mode==='spin'?`<details class="wheel-odds"><summary>Reward odds</summary><p>Wheel segments are visual. Rewards use these exact odds.</p><div>${SPIN_REWARDS.map(r=>`<span>${r.label}${'coins'in r?' coins':''}<b>${percent(r.weight)}</b></span>`).join('')}</div></details>`:''}<p class="reward-saving">Reward secured · Closing this window keeps your reward.</p>`
 dialog.showModal()
 let skip=false,ticker=0;const animations:Animation[]=[]
 const finish=()=>{skip=true;animations.forEach(a=>{try{a.finish()}catch{}})}
 const button=dialog.querySelector<HTMLButtonElement>('.reward-skip')!,phase=dialog.querySelector<HTMLElement>('.reveal-phase')!
 button.onclick=finish;dialog.oncancel=finish;dialog.addEventListener('close',finish,{once:true})
 const animate=async(el:Element,frames:Keyframe[],ms:number,easing='ease',onFrame?:(progress:number)=>void)=>{
  const animation=el.animate(frames,{duration:skip||reduced()?0:ms,easing,fill:'forwards'});animations.push(animation)
  if(onFrame&&!skip&&!reduced()){const tick=()=>{const p=animation.effect?.getComputedTiming().progress;if(typeof p==='number')onFrame(p);if(animation.playState==='running')ticker=requestAnimationFrame(tick)};ticker=requestAnimationFrame(tick)}
  await animation.finished.catch(()=>{});cancelAnimationFrame(ticker)
 }
 try{
  if(mode==='spin'){
   const wheel=dialog.querySelector('.wheel-disc')!,pointer=dialog.querySelector('.wheel-pointer')!,angle=360*8-((drop.segment??0)*45+22.5)
   await animate(wheel,[{transform:'rotate(0deg)'},{transform:'rotate(-14deg)'}],380,'ease-in-out')
   dialog.dataset.phase='spin';phase.textContent='Every turn, a possibility'
   let last=-1
   await animate(wheel,[{transform:'rotate(-14deg)',offset:0,easing:'cubic-bezier(.45,0,.7,.4)'},{transform:'rotate(630deg)',offset:.22,easing:'cubic-bezier(.12,.7,.05,1)'},{transform:`rotate(${angle}deg)`,offset:1}],6400,'linear',p=>{
    // The pointer and rim respond to the real animated disc, including its slowdown.
    const transform=getComputedStyle(wheel).transform,values=transform.match(/matrix\(([^)]+)\)/)?.[1].split(',').map(Number)
    const degrees=values?Math.atan2(values[1],values[0])*180/Math.PI:0,sector=Math.floor((degrees+360)/45)
    if(last!==sector){last=sector;const a=pointer.animate([{rotate:'-13deg'},{rotate:'3deg',offset:.65},{rotate:'0deg'}],{duration:100,fill:'none'});animations.push(a);dialog!.classList.toggle('tick-odd',sector%2===0)}
    if(p>.65){phase.textContent='Finding its place';dialog!.dataset.phase='settling'}
   })
   await animate(wheel,[{transform:`rotate(${angle}deg)`},{transform:`rotate(${angle+.9}deg)`,offset:.45},{transform:`rotate(${angle}deg)`}],260,'ease-out')
   dialog.querySelector(`[data-segment="${drop.segment??0}"]`)?.classList.add('landed-segment')
  }else{
   const chest=dialog.querySelector('.chess-chest')!,stage=dialog.querySelector('.crate-stage')!
   await animate(chest,[{transform:'translateY(-310px) rotateY(-34deg) rotateX(-14deg) rotateZ(-8deg)'},{transform:'translateY(7px) rotateY(-25deg) rotateX(-12deg) rotateZ(1deg)',offset:.76},{transform:'translateY(-9px) rotateY(-25deg) rotateX(-12deg)',offset:.9},{transform:'translateY(0) rotateY(-25deg) rotateX(-12deg)'}],900,'cubic-bezier(.32,.01,.65,1)')
   stage.classList.add('landed');dialog.dataset.phase='unlock';phase.textContent='Breaking the seal'
   await Promise.all([...dialog.querySelectorAll('.crate-latch')].map((l,i)=>animate(l,[{transform:'translateZ(8px) rotateX(0deg)'},{transform:`translateZ(8px) rotateX(${i?-115:115}deg)`}],430,'cubic-bezier(.3,.2,.2,1)')))
   stage.classList.add('charging')
   await animate(chest,[{translate:'0'},{translate:'-2px',offset:.15},{translate:'3px',offset:.3},{translate:'-3px',offset:.5},{translate:'2px',offset:.7},{translate:'0'}],470,'ease-in-out')
   dialog.dataset.phase='opening';phase.textContent='Opening your collection'
   await animate(dialog.querySelector('.chest-lid')!,[{transform:'translateZ(-58px) rotateX(90deg)'},{transform:'translateZ(-58px) rotateX(213deg)',offset:.85},{transform:'translateZ(-58px) rotateX(205deg)'}],700,'cubic-bezier(.2,.75,.15,1)')
   stage.classList.add('opened');dialog.dataset.phase='spin';phase.textContent='One of a kind. Yours to keep.'
   const strip=dialog.querySelector<HTMLElement>('.reel-strip')!,windowEl=dialog.querySelector<HTMLElement>('.reel-window')!,pool=ITEMS.filter(i=>i.type===reward?.type),target=34,step=160
   const decoy=()=>{let ticket=Math.random()*1000000,index=0;for(;index<5;index++){ticket-=CRATE_ODDS[tier][index];if(ticket<0)break}const options=pool.filter(i=>i.rarity===RARITIES[index]);return options[Math.floor(Math.random()*options.length)]}
   const cards=Array.from({length:42},(_,i)=>i===target?reward!:decoy())
   strip.innerHTML=cards.map(i=>`<div class="reel-card" data-item="${i.id}" style="--rarity:${RARITY_COLORS[i.rarity]}">${itemCard(i)}${i.type==='skin'?'<small class="reel-set-label">FULL PIECE SET</small>':''}</div>`).join('')
   windowEl.classList.add('visible');const offset=-target*step-step/2
   await animate(strip,[{transform:`translateX(${-step/2}px)`},{transform:`translateX(${offset}px)`}],5400,'cubic-bezier(.08,.62,.08,1)',p=>{if(p>.8){dialog!.dataset.phase='settling';phase.textContent='The final few moments'}})
   strip.style.transform=`translateX(${offset}px)`;strip.children[target].classList.add('winning-card');dialog.dataset.phase='landed';phase.textContent=reward!.name
   await animate(windowEl,[{opacity:1},{opacity:1}],300)
  }
  dialog.dataset.phase='reward';dialog.classList.add('revealed');dialog.querySelector('h2')!.textContent=drop.duplicate?'Another for your collection.':'Meet your new favorite.'
  const result=dialog.querySelector<HTMLElement>('.reward-result')!
  result.innerHTML=`<div class="prize-halo" aria-hidden="true"><i></i><i></i><i></i>${Array.from({length:16},(_,i)=>`<b style="--ray:${i}"></b>`).join('')}</div><div class="reward-won-art">${reward?(reward.type==='skin'?skinSetIcon(reward.id):itemArt(reward,136)):icon('coin')}</div><p class="rarity-label">${reward?reward.rarity:'COINS'}</p><h3>${reward?reward.name:`${drop.coins?.toLocaleString()} coins`}</h3><p>${drop.duplicate?'Already in your collection. Keep a tradable copy or take a small coin refund.':reward?reward.description:'A little fortune for your next find.'}</p>${reward?.type==='skin'?'<small class="reward-set-note">6 pieces · 4 faction colors · Yours to equip</small>':''}<div class="reward-actions">${drop.duplicate?`<button type="button" class="button primary" data-keep>Keep copy</button><button type="button" class="button" data-refund>${icon('coin')}Refund ${drop.refund}</button>`:`<button type="button" class="button primary" data-done>Continue</button>`}</div><p class="form-error" role="alert" hidden></p>`
  result.hidden=false;button.textContent='Close';button.onclick=()=>dialog!.close()
  result.querySelector<HTMLButtonElement>('[data-done]')?.addEventListener('click',()=>dialog!.close())
  for(const refund of [false,true])result.querySelector<HTMLButtonElement>(refund?'[data-refund]':'[data-keep]')?.addEventListener('click',async()=>{
   const buttons=result.querySelectorAll<HTMLButtonElement>('button');buttons.forEach(b=>b.disabled=true)
   try{const data=await api<RewardReply>('/economy/duplicate',{uid:drop.uid,refund});renderAccount(data.profile);onChange?.(data);dialog!.close()}catch(cause){const error=result.querySelector<HTMLElement>('.form-error')!;error.textContent=cause instanceof Error?cause.message:'Could not save choice';error.hidden=false;buttons.forEach(b=>b.disabled=false)}
  })
  if(dialog.open)result.querySelector<HTMLButtonElement>('button')?.focus()
 }finally{running=false;cancelAnimationFrame(ticker);animations.forEach(a=>a.cancel())}
}
export async function initDailySpin(){
 const host=document.getElementById('daily-spin');if(!host)return
 host.innerHTML=`<div class="spin-thumb" aria-hidden="true">${wheelSVG()}<span class="spin-thumb-caption">A little luck.<br>A new collection.</span><i>✦</i></div><div class="daily-spin-copy"><strong>DAILY SPIN</strong><small>Free every day · Netherlands time</small></div><div class="daily-spin-actions"><button type="button" class="spin-now">SPIN NOW</button><button type="button" class="spin-again" hidden>${icon('coin')}<span>Spin again · ${PAID_SPIN_PRICE} coins</span></button></div><p class="spin-error form-error" role="alert" hidden></p>`
 const button=host.querySelector<HTMLButtonElement>('.spin-now')!,again=host.querySelector<HTMLButtonElement>('.spin-again')!,error=host.querySelector<HTMLElement>('.spin-error')!
 let state:Economy|undefined,busy=false,freeRequest=requestId(),paidRequest=requestId(),clockOffset=0
 const render=()=>{if(!state)return;const ready=state.spinReady||Date.now()+clockOffset>=state.reset;button.classList.toggle('used',!ready);host.classList.toggle('spin-cooldown',!ready);button.textContent=busy?'Spinning…':ready?'SPIN NOW':`Next free spin · ${countdown(state.reset,Date.now()+clockOffset)}`;button.disabled=busy||!ready;again.hidden=ready;again.disabled=busy||state.wallet.coins<state.paidSpinPrice;again.title=again.disabled?`You need ${state.paidSpinPrice} coins for another spin`:'';again.querySelector('span')!.textContent=`Spin again · ${state.paidSpinPrice} coins`}
 const refresh=async()=>{state=await api<Economy>('/economy');clockOffset=state.now-Date.now();render()}
 await refresh().catch(()=>{error.textContent='Daily spin is unavailable. Try again shortly.';error.hidden=false;button.disabled=true})
 const play=async(paid:boolean)=>{
  if(busy)return;busy=true;render();error.hidden=true
  try{const data=await api<RewardReply>(paid?'/economy/spin-again':'/economy/spin',{requestId:paid?paidRequest:freeRequest});state=data;clockOffset=data.now-Date.now();if(paid)paidRequest=requestId();else freeRequest=requestId();renderAccount(data.profile);await revealDrop(data.drop!,'spin',0,next=>{state=next})}catch(cause){error.textContent=cause instanceof Error?cause.message:'Spin failed. Try again.';error.hidden=false;await refresh().catch(()=>{});if(!paid&&state&&!state.spinReady)freeRequest=requestId()}finally{busy=false;render()}
 }
 button.onclick=()=>void play(false)
 again.onclick=()=>{
  if(!state||busy)return
  const confirmation=document.createElement('dialog');confirmation.className='transaction-dialog spin-confirm'
  confirmation.innerHTML=`<span class="confirm-wheel">${wheelSVG()}</span><h2>Another turn of fortune?</h2><p>Spend <strong>${state.paidSpinPrice} coins</strong> for another spin with the same reward odds. Your next free spin still resets at Netherlands midnight.</p><p class="confirm-balance">Balance · ${state.wallet.coins.toLocaleString()} coins</p><div class="actions"><button type="button" class="button" data-cancel>Cancel</button><button type="button" class="button primary" data-spin-confirm>${icon('coin')}Spin · ${state.paidSpinPrice}</button></div>`
  document.body.append(confirmation);confirmation.showModal();confirmation.onclose=()=>confirmation.remove();confirmation.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick=()=>confirmation.close();confirmation.querySelector<HTMLButtonElement>('[data-spin-confirm]')!.onclick=()=>{confirmation.close();void play(true)}
 }
 window.setInterval(render,1000)
}
