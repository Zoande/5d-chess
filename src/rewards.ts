import {type Kind,type Player} from './model.ts'
import {api,renderAccount} from './shell.ts'
import {type Profile} from './account-model.ts'
import {type Wallet,type Drop,type Listing,type Collectible,ITEMS,SPIN_REWARDS,RARITY_COLORS,CRATE_ODDS,RARITIES,percent,itemById} from './collection.ts'
import {avatarArt} from './cosmetic-art.ts'
import {pieceIcon} from './art.ts'
import {icon} from './icons.ts'
export interface Economy {wallet:Wallet;spinReady:boolean;reset:number;rotation:number;featured:string[];now:number;recent:Drop[]}
export interface RewardReply extends Economy {profile:Profile;drop?:Drop}
export const requestId=()=>crypto.randomUUID()
export function itemArt(item:Collectible,size=88,kind:Kind='N',player:Player='red'){return item.type==='icon'?avatarArt(item.id):pieceIcon(kind,player,size,item.id)}
export function itemCard(item:Collectible,kind:Kind='N',player:Player='red'){return `<span class="item-picture">${itemArt(item,88,kind,player)}</span><small class="rarity-label">${item.rarity}</small><strong>${item.name}</strong>`}
const duration=(ms:number)=>matchMedia('(prefers-reduced-motion: reduce)').matches?0:ms
export function countdown(to:number,now=Date.now()){let seconds=Math.max(0,Math.ceil((to-now)/1000));const days=Math.floor(seconds/86400);seconds%=86400;return `${days?days+'d ':''}${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
export function wheelSVG(){
 const colors=['#54784e','#426e7c','#577d5a','#7a6342','#a27f3f','#527fb1','#a67b33','#8b4775']
 const sectors=SPIN_REWARDS.map((r,i)=>{const a=i*Math.PI/4-Math.PI/2,b=a+Math.PI/4,mid=a+Math.PI/8,x=140+94*Math.cos(mid),y=140+94*Math.sin(mid)
 return `<path d="M140 140  ${140+132*Math.cos(a)} ${140+132*Math.sin(a)} A132 132 0 0 1 ${140+132*Math.cos(b)} ${140+132*Math.sin(b)}Z" fill="${colors[i]}" stroke="#c8b47a" stroke-width="1"/><text x="${x}" y="${y}" fill="#fff5d9" font-size="${i>4?10:14}" font-family="Arial,sans-serif" font-weight="bold" text-anchor="middle" transform="rotate(${(mid*180/Math.PI)+90} ${x} ${y})">${r.label}</text>`}).join('')
 return `<svg class="reward-wheel" viewBox="0 0 280 280" aria-hidden="true"><circle cx="140" cy="140" r="138" fill="#262a24" stroke="#e8ce81" stroke-width="3"/>${sectors}<circle cx="140" cy="140" r="27" fill="#252820" stroke="#ddc070" stroke-width="4"/><text x="140" y="152" fill="#e8d18f" font-size="34" font-family="Georgia,serif" text-anchor="middle">♔</text>${Array.from({length:16},(_,i)=>`<circle cx="${140+135*Math.cos(i*Math.PI/8)}" cy="${140+135*Math.sin(i*Math.PI/8)}" r="2" fill="#fff0ba"/>`).join('')}</svg>`
}
export const chestHTML=(tier=0)=>`<div class="chest-perspective"><div class="chess-chest tier-${tier}"><div class="chest-face chest-front"><i></i><b>5D</b><span>CHESS COLLECTION</span><em>♞</em></div><div class="chest-face chest-right"><i></i><b>◆</b></div><div class="chest-lid"><span></span></div><div class="chest-feet"></div></div><div class="chest-ground"></div></div>`
export function oddsHTML(tier:number){return RARITIES.map((r,i)=>`<span style="--rarity:${RARITY_COLORS[r]}"><i></i>${r} <b>${percent(CRATE_ODDS[tier][i])}</b></span>`).join('')}
let dialog:HTMLDialogElement|undefined,running=false
export async function revealDrop(drop:Drop,mode:'spin'|'crate',tier=0,onChange?:(data:RewardReply)=>void){
 if(running)return
 running=true
 dialog??=Object.assign(document.createElement('dialog'),{className:'reward-dialog'})
 if(!dialog.isConnected)document.body.append(dialog)
 const reward=itemById(drop.itemId??''),color=reward?RARITY_COLORS[reward.rarity]:'#e8c56c'
 dialog.classList.remove('revealed')
 dialog.style.setProperty('--reward-color',color)
 dialog.innerHTML=`<div class="reward-heading"><div><p class="eyebrow">${mode==='spin'?'THE DAILY SPIN':'CHESS COLLECTION'}</p><h2>${mode==='spin'?'A new day. A new possibility.':'Opening your crate'}</h2></div><button type="button" class="text-button reward-skip">Skip animation</button></div><div class="reward-show"><div class="reward-sparks" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>${mode==='spin'?`<div class="wheel-stage"><div class="wheel-pointer"></div>${wheelSVG()}</div>`:`<div class="crate-stage">${chestHTML(tier)}</div><div class="reel-window" aria-label="Opening reel"><div class="reel-marker"></div><div class="reel-strip"></div></div>`}</div><section class="reward-result" hidden aria-live="polite"></section>${mode==='spin'?`<details class="wheel-odds"><summary>Reward odds</summary><p>Wheel segments are visual. Rewards use these exact odds.</p><div>${SPIN_REWARDS.map(r=>`<span>${r.label}${'coins'in r?' coins':''}<b>${percent(r.weight)}</b></span>`).join('')}</div></details>`:''}<p class="reward-saving">Your reward is already saved. You can safely close this window.</p>`
 dialog.showModal()
 let skip=false;const animations:Animation[]=[]
 const finish=()=>{skip=true;animations.forEach(a=>{try{a.finish()}catch{}})}
 const button=dialog.querySelector<HTMLButtonElement>('.reward-skip')!
 button.onclick=finish;dialog.oncancel=finish
 const animate=async(el:Element,frames:Keyframe[],ms:number,easing='ease')=>{const animation=el.animate(frames,{duration:skip?0:duration(ms),easing,fill:'forwards'});animations.push(animation);await animation.finished.catch(()=>{})}
 try{
  if(mode==='spin'){
   const wheel=dialog.querySelector('.reward-wheel')!,angle=360*7-((drop.segment??0)*45+22.5)
   await animate(wheel,[{transform:'rotate(0deg)'},{transform:`rotate(${angle}deg)`}],6500,'cubic-bezier(.12,.72,.08,1)')
  }else{
   const chest=dialog.querySelector('.chess-chest')!
   await animate(chest,[{transform:'translateY(-260px) rotateY(-25deg) rotateX(-8deg)',opacity:0},{transform:'translateY(8px) rotateY(-25deg) rotateX(-8deg)',opacity:1,offset:.8},{transform:'translateY(0) rotateY(-25deg) rotateX(-8deg)',opacity:1}],900,'cubic-bezier(.35,.02,.7,1)')
   await animate(chest,[{translate:'0'},{translate:'-4px',offset:.25},{translate:'4px',offset:.5},{translate:'-2px',offset:.75},{translate:'0'}],500)
   await animate(dialog.querySelector('.chest-lid')!,[{transform:'translateZ(-58px) rotateX(90deg)'},{transform:'translateZ(-58px) rotateX(205deg)'}],650,'cubic-bezier(.2,.7,.15,1)')
   dialog.querySelector('.crate-stage')!.classList.add('opened')
   const strip=dialog.querySelector<HTMLElement>('.reel-strip')!,windowEl=dialog.querySelector<HTMLElement>('.reel-window')!,pool=ITEMS.filter(i=>i.type===reward?.type),target=34
   // Decoys use the actual tier rarity distribution; only the saved reward decides the landing.
   const decoy=()=>{let ticket=Math.random()*1000000,index=0;for(;index<5;index++){ticket-=CRATE_ODDS[tier][index];if(ticket<0)break}const options=pool.filter(i=>i.rarity===RARITIES[index]);return options[Math.floor(Math.random()*options.length)]}
   const cards=Array.from({length:42},(_,i)=>i===target?reward!:decoy())
   strip.innerHTML=cards.map(i=>`<div class="reel-card" data-item="${i.id}" style="--rarity:${RARITY_COLORS[i.rarity]}">${itemCard(i)}</div>`).join('')
   windowEl.classList.add('visible');const offset=windowEl.clientWidth/2-target*132-66
   await animate(strip,[{transform:`translateX(${windowEl.clientWidth/2-66}px)`},{transform:`translateX(${offset}px)`}],5700,'cubic-bezier(.09,.65,.1,1)')
   strip.style.transform=`translateX(${offset}px)`
  }
  dialog.classList.add('revealed')
  dialog.querySelector('h2')!.textContent='Your reward'
  const result=dialog.querySelector<HTMLElement>('.reward-result')!
  result.innerHTML=`<div class="reward-won-art">${reward?itemArt(reward,116):icon('coin')}</div><p class="rarity-label">${reward?reward.rarity:'COINS'}</p><h3>${reward?reward.name:`${drop.coins?.toLocaleString()} coins`}</h3><p>${drop.duplicate?'You already own this item. Keep this copy to trade, or take a small coin refund.':reward?'Added to your inventory.':'Added to your balance.'}</p><div class="reward-actions">${drop.duplicate?`<button type="button" class="button primary" data-keep>Keep copy</button><button type="button" class="button" data-refund>${icon('coin')}Refund ${drop.refund}</button>`:`<button type="button" class="button primary" data-done>Continue</button>`}</div><p class="form-error" role="alert" hidden></p>`
  result.hidden=false;button.textContent='Close';button.onclick=()=>dialog!.close()
  result.querySelector<HTMLButtonElement>('[data-done]')?.addEventListener('click',()=>dialog!.close())
  for(const refund of [false,true])result.querySelector<HTMLButtonElement>(refund?'[data-refund]':'[data-keep]')?.addEventListener('click',async()=>{
   const buttons=result.querySelectorAll<HTMLButtonElement>('button');buttons.forEach(b=>b.disabled=true)
   try{const data=await api<RewardReply>('/economy/duplicate',{uid:drop.uid,refund});renderAccount(data.profile);onChange?.(data);dialog!.close()}catch(cause){const error=result.querySelector<HTMLElement>('.form-error')!;error.textContent=cause instanceof Error?cause.message:'Could not save choice';error.hidden=false;buttons.forEach(b=>b.disabled=false)}
  })
  result.querySelector<HTMLButtonElement>('button')?.focus()
 }finally{running=false;animations.forEach(a=>a.cancel())}
}
export async function initDailySpin(){
 const host=document.getElementById('daily-spin');if(!host)return
 host.innerHTML=`<div class="spin-thumb" aria-hidden="true">${wheelSVG()}<span class="spin-thumb-caption">A little luck.<br>A new collection.</span><i>✦</i></div><div class="daily-spin-copy"><strong>DAILY SPIN</strong><small>Free every day · Netherlands time</small></div><button type="button" class="spin-now">SPIN NOW</button><p class="spin-error form-error" role="alert" hidden></p>`
 const button=host.querySelector<HTMLButtonElement>('button')!,error=host.querySelector<HTMLElement>('.spin-error')!
 let state:Economy|undefined,busy=false,request=requestId(),clockOffset=0
 const render=()=>{if(!state)return;const ready=state.spinReady||Date.now()+clockOffset>=state.reset;button.classList.toggle('used',!ready);button.textContent=busy?'Spinning…':ready?'SPIN NOW':`Next spin · ${countdown(state.reset,Date.now()+clockOffset)}`;button.disabled=busy||!ready}
 const refresh=async()=>{state=await api<Economy>('/economy');clockOffset=state.now-Date.now();render()}
 await refresh().catch(()=>{error.textContent='Daily spin is unavailable. Try again shortly.';error.hidden=false;button.disabled=true})
 button.onclick=async()=>{
  if(busy)return;busy=true;render();error.hidden=true
  try{const data=await api<RewardReply>('/economy/spin',{requestId:request});state=data;clockOffset=data.now-Date.now();request=requestId();renderAccount(data.profile);await revealDrop(data.drop!,'spin',0,next=>{state=next})}catch(cause){error.textContent=cause instanceof Error?cause.message:'Spin failed. Try again.';error.hidden=false;await refresh().catch(()=>{});if(state&&!state.spinReady)request=requestId()}finally{busy=false;render()}
 }
 window.setInterval(render,1000)
}
