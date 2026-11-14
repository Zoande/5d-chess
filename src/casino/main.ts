import {api,getSession,initShell,renderAccount,type SessionInfo} from '../shell.ts'
import {icon} from '../icons.ts'
import {type Profile} from '../account-model.ts'
import {casinoCoins,grossMultiplier,pocketColor,type CasinoGame,type RouletteChoice,type CasinoBet,type CasinoReply,type CasinoView,type CasinoRound} from '../casino-model.ts'
import {rouletteArena,animateRoulette} from './roulette.ts'
import {DiceScene} from './dice-scene.ts'

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const game=document.body.dataset.casino as CasinoGame
let state:CasinoView,profile:Profile,choice:RouletteChoice=game==='dice'?1:'white',busy=false,pending:CasinoBet|undefined,awaitingThrow:CasinoRound|undefined,scene:DiceScene|undefined,storageKey=''
const title=(c:RouletteChoice)=>typeof c==='number'?game==='dice'?`Face ${c}`:c===0?'The rift · 0':`Square ${c}`:c==='white'?'White court':c==='black'?'Black court':c==='low'?'1–18':c==='high'?'19–36':c==='odd'?'Odd squares':'Even squares'
const delay=(ms:number)=>new Promise(r=>setTimeout(r,matchMedia('(prefers-reduced-motion: reduce)').matches?1:ms))
function pips(n:number){return `<span class="mini-die face-${n}" aria-hidden="true">${[1,2,3,4,5,6,7,8,9].map(i=>`<i class="pip p${i}"></i>`).join('')}</span>`}
function rules(){return `<details class="casino-rules"><summary>${icon('info')}Table rules &amp; exact odds</summary><p>The house edge is <strong>2% before tax</strong>. A separate <strong>1% of positive profit</strong> goes to <strong>CasinoOwner</strong>. Losing bets pay no tax. Returns include your stake.</p>${game==='dice'?'<p>Choose one face. Each of the six faces has an equal 1/6 chance; a correct guess returns <strong>5.88×</strong> your stake before the profit tax. The result settles when you offer your coins. The throw changes only the animation.</p>':'<table><thead><tr><th>Bet</th><th>Win chance</th><th>Total return</th></tr></thead><tbody><tr><td>Court / odd / even / half</td><td>49%</td><td>2×</td></tr><tr><td>Number 1–36</td><td>98% ÷ 36</td><td>36×</td></tr><tr><td>Rift · 0</td><td>2%</td><td>49×</td></tr></tbody></table><p>The rift has a 2% chance; the other 36 pockets share the remaining 98% equally. The wheel is a visual display of the server draw.</p>'}<p>Coins settle to four decimal places. Round receipts are saved; reloading, gestures and repeated requests cannot reroll a settled wager.</p></details>`}
function controls(){return `<aside class="casino-controls"><div class="wager-card"><div class="wager-heading"><span class="eyebrow">YOUR WAGER</span><span class="table-open"><i></i>TABLE OPEN</span></div><div class="casino-wallet">${icon('coin')}<span><small>YOUR COINS</small><strong id="table-balance"></strong></span></div><form id="wager-form"><div class="wager-island stake-island"><h2>${game==='dice'?'Make your offer.':'Take your seat.'}</h2><label for="stake">Coins to ${game==='dice'?'offer':'place'}</label><div class="stake-input"><span>${icon('coin')}</span><input id="stake" type="number" min="1" max="100000" step="1" inputmode="numeric" required value="100" autocomplete="off"><small>COINS</small></div><div class="quick-chips" aria-label="Quick bet amount">${[25,100,500,1000].map((n,i)=>`<button type="button" data-stake="${n}" class="wager-chip chip-${i}"><span>${icon(i%2?'knight':'king')}</span><b>${n.toLocaleString()}</b></button>`).join('')}</div>${game==='dice'?`<label>Choose your face</label><div class="dice-face-picker" role="group" aria-label="Die face">${[1,2,3,4,5,6].map(n=>`<button type="button" data-face="${n}" aria-label="Choose face ${n}" aria-pressed="${n===1}">${pips(n)}</button>`).join('')}</div>`:''}</div><div class="wager-island reward-island"><div class="selected-wager"><span id="chosen-art">${icon(game==='dice'?'dice':'king')}</span><div><small>BETTING ON</small><strong id="chosen-label"></strong></div></div><div class="payout-estimate"><span>Total return if you win<strong id="return-estimate"></strong></span><small id="tax-estimate"></small></div></div><button id="place-bet" type="submit" class="casino-primary">${game==='dice'?'Offer coins':'Place bet & spin'}<span>↗</span></button><p id="casino-error" class="casino-error" role="alert" hidden></p></form><div class="house-terms"><span>2% house edge</span><i></i><span>1% profit tax</span></div></div><section id="round-result" class="casino-result" aria-live="polite" hidden></section>${rules()}</aside>`}
function room(){return `<section class="dice-room" data-phase="idle"><canvas id="dice-canvas" aria-label="A three-dimensional chess table across from a hooded figure with white eyes"></canvas><div class="room-vignette"></div><div class="room-dialogue"><span class="keeper-glyph">${icon('king')}</span><p id="keeper-dialogue">The Keeper waits for your offer.</p></div><div class="gesture-guide" hidden><svg viewBox="0 0 140 50" aria-hidden="true"><path d="M10 40Q65-8 125 17m-13-3 15 2-8 12"/></svg><strong>Drag the die. Release to throw.</strong><span>Your gesture shapes the motion, never the result.</span></div><button id="roll-die" class="roll-die" type="button" hidden>${icon('dice')}Roll the die<span>or drag across the table</span></button><span class="room-coordinates">VI / THE SILENT ROOM</span><p class="webgl-fallback">The 3D room is unavailable on this device. You can still use the Roll button.</p></section>`}
function renderLayout(){
 el('casino-root').innerHTML=`<div class="casino-layout">${game==='dice'?room():rouletteArena()}${controls()}</div>`
}
function updateChoice(){
 el('chosen-label').textContent=title(choice)
 document.querySelectorAll<HTMLElement>('[data-pocket],[data-outside],[data-face]').forEach(b=>{const value=b.dataset.pocket!==undefined?Number(b.dataset.pocket):b.dataset.face!==undefined?Number(b.dataset.face):b.dataset.outside;b.setAttribute('aria-pressed',String(value===choice))})
 const stake=Number(el<HTMLInputElement>('stake').value),gross=stake*grossMultiplier(game,choice),tax=Math.max(0,gross-stake)*.01
 el('return-estimate').textContent=Number.isFinite(gross)&&stake>0?`${casinoCoins(gross-tax)} coins`:'—';el('tax-estimate').textContent=stake>0?`${casinoCoins(gross)} gross − ${casinoCoins(tax)} profit tax`:''
}
function renderBalance(){el('table-balance').textContent=casinoCoins(state.coins);scene?.setCoins(state.coins);renderAccount({...profile,coins:state.coins})}
function renderHistory(){
 const history=el<HTMLElement>('round-history')
 if(!history)return
 const rounds=state.recent.filter(r=>r.game===game&&r.id!==awaitingThrow?.id).slice(0,8)
 history.innerHTML=rounds.length?rounds.map(r=>`<details class="history-round ${r.won?'won':'lost'}"><summary><span class="history-face ${game==='roulette'?'pocket-'+pocketColor(r.result):''}">${game==='dice'?pips(r.result):r.result===0?'◆':r.result}</span><span><strong>${title(r.choice)}</strong><small>${casinoCoins(r.stake)} coins</small></span><b>${r.net>=0?'+':''}${casinoCoins(r.net)}</b></summary><div><span>Gross return <b>${casinoCoins(r.gross)}</b></span><span>Profit tax to CasinoOwner <b>${casinoCoins(r.tax)}</b></span><span>Credited <b>${casinoCoins(r.credited)}</b></span></div></details>`).join(''):'<p class="history-empty">Your settled wagers will appear here.</p>'
}
function lock(value:boolean){
 busy=value;document.querySelectorAll<HTMLButtonElement|HTMLInputElement>('#wager-form input,#wager-form button,[data-pocket],[data-outside]').forEach(b=>b.disabled=value)
 el<HTMLButtonElement>('place-bet').textContent=value?'Wager in progress…':pending?'Retry settlement':game==='dice'?'Offer coins':'Place bet & spin'
}
function remember(round:CasinoRound){try{sessionStorage.setItem(storageKey,JSON.stringify(round))}catch{}}
function forget(){try{sessionStorage.removeItem(storageKey)}catch{}}
function reveal(round:CasinoRound){
 awaitingThrow=undefined;forget();renderBalance();renderHistory()
 const result=el('round-result');result.hidden=false;result.dataset.won=String(round.won)
 result.innerHTML=`<span class="result-eyebrow">${round.won?'A FORTUNATE MOVE':'THE TABLE TAKES THIS ONE'}</span><h2>${game==='dice'?`Rolled ${round.result}`:round.result===0?'The rift · 0':`${round.result} · ${pocketColor(round.result)==='white'?'White':'Black'} court`}</h2><strong class="result-net">${round.net>=0?'+':''}${casinoCoins(round.net)} <small>coins</small></strong><div><span>Stake <b>${casinoCoins(round.stake)}</b></span><span>Gross return <b>${casinoCoins(round.gross)}</b></span><span>Profit tax <b>${casinoCoins(round.tax)}</b></span><span>Credited <b>${casinoCoins(round.credited)}</b></span></div>`
 if(game==='roulette'){el('pocket-readout').textContent=round.result===0?'The rift':String(round.result);el('spin-caption').textContent=round.won?'Your wager found its square.':'The next move is yours.'}
 else{el('keeper-dialogue').textContent=round.won?'“A fair throw. Your coins are yours.”':'“The die has spoken.”';document.querySelector('.dice-room')!.setAttribute('data-phase','result');el('roll-die').hidden=true;document.querySelector<HTMLElement>('.gesture-guide')!.hidden=true}
 lock(false)
}
async function throwDie(){
 if(!awaitingThrow)return
 const round=awaitingThrow;el<HTMLButtonElement>('roll-die').disabled=true;document.querySelector<HTMLElement>('.gesture-guide')!.hidden=true;document.querySelector('.dice-room')!.setAttribute('data-phase','rolling');el('keeper-dialogue').textContent='The ivory turns. The Keeper watches.'
 await scene?.roll(round.result);reveal(round);el<HTMLButtonElement>('roll-die').disabled=false
}
async function settle(event:SubmitEvent){
 event.preventDefault();if(busy)return
 if(!el<HTMLFormElement>('wager-form').reportValidity())return
 el('casino-error').hidden=true
 pending??={game,choice,stake:Number(el<HTMLInputElement>('stake').value),sequence:state.nextSequence,requestId:crypto.randomUUID()}
 lock(true);el('round-result').hidden=true
 try{
  const data=await api<CasinoReply&{profile:Profile}>('/casino/bet',pending);state=data;profile=data.profile;pending=undefined;remember(data.round)
  if(game==='roulette'){
   el('pocket-readout').textContent='The court is turning';el('spin-caption').textContent='Follow the ivory.'
   await animateRoulette(data.round.result);reveal(data.round)
  }else{
   awaitingThrow=data.round;document.querySelector('.dice-room')!.setAttribute('data-phase','exchange');el('keeper-dialogue').textContent='Your offer crosses the table. The Keeper accepts.'
   await scene?.exchange();await delay(100);document.querySelector('.dice-room')!.setAttribute('data-phase','ready');el('keeper-dialogue').textContent='“Your move.”';el('roll-die').hidden=false;document.querySelector<HTMLElement>('.gesture-guide')!.hidden=false;el('roll-die').focus()
  }
 }catch(cause){
  el('casino-error').textContent=cause instanceof Error?cause.message:'The table could not settle. Retry the same wager.';el('casino-error').hidden=false
  // Keep the same id and sequence for network retries. Known rejections can start a fresh wager.
  if(cause instanceof Error&&'status'in cause){pending=undefined;try{state=await api<CasinoView>('/casino');renderBalance();renderHistory()}catch{}}
  lock(false)
 }
}
async function init(){
 await initShell();const session:SessionInfo=await getSession();if(!session.user){location.replace('/chess/login.html');return}
 profile=session.profile!;state=await api<CasinoView>('/casino');storageKey=`5d-casino-presentation:${session.user}:${game}`;renderLayout();renderBalance();updateChoice();renderHistory()
 el<HTMLFormElement>('wager-form').onsubmit=event=>void settle(event)
 el('stake').oninput=updateChoice
 document.querySelectorAll<HTMLButtonElement>('[data-stake]').forEach(b=>b.onclick=()=>{el<HTMLInputElement>('stake').value=b.dataset.stake!;updateChoice()})
 document.querySelectorAll<HTMLButtonElement>('[data-pocket],[data-outside],[data-face]').forEach(b=>b.onclick=()=>{if(busy)return;choice=b.dataset.pocket!==undefined?Number(b.dataset.pocket):b.dataset.face!==undefined?Number(b.dataset.face):b.dataset.outside as RouletteChoice;updateChoice()})
 if(game==='dice'){
  try{scene=new DiceScene(el<HTMLCanvasElement>('dice-canvas'));scene.setCoins(state.coins)}catch{document.querySelector('.dice-room')!.classList.add('webgl-unavailable')}
  el('roll-die').onclick=()=>void throwDie()
  const canvas=el<HTMLCanvasElement>('dice-canvas');let gesture:{x:number;y:number;id:number}|undefined
  canvas.addEventListener('pointerdown',e=>{gesture={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId)})
  canvas.addEventListener('pointermove',e=>{const rect=canvas.getBoundingClientRect();scene?.setLookPointer((e.clientX-rect.left)/rect.width*2-1,(e.clientY-rect.top)/rect.height*2-1);if(gesture?.id!==e.pointerId)return;const x=e.clientX-gesture.x,y=e.clientY-gesture.y;if(awaitingThrow&&document.querySelector('.dice-room')!.getAttribute('data-phase')==='ready')scene?.setDrag(x,y)})
  canvas.addEventListener('pointerup',e=>{if(gesture?.id!==e.pointerId)return;const distance=Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y);gesture=undefined;scene?.setDrag(0,0);if(distance>=18&&awaitingThrow&&document.querySelector('.dice-room')!.getAttribute('data-phase')==='ready')void throwDie()})
  canvas.addEventListener('pointercancel',()=>{gesture=undefined;scene?.setDrag(0,0)})
  window.addEventListener('pagehide',()=>scene?.dispose())
 }
 try{
  const saved=JSON.parse(sessionStorage.getItem(storageKey)??'null') as CasinoRound|null
  const restored=saved&&state.recent.find(r=>r.id===saved.id)
  if(restored&&game==='dice'){awaitingThrow=restored;lock(true);scene?.ready();document.querySelector('.dice-room')!.setAttribute('data-phase','ready');el('keeper-dialogue').textContent='Your wager is saved. The die is still yours to throw.';el('roll-die').hidden=false;document.querySelector<HTMLElement>('.gesture-guide')!.hidden=false;renderHistory()}
  else if(restored)reveal(restored)
 }catch{forget()}
}
void init().catch(cause=>{el('casino-root').innerHTML='<p class="casino-error" role="alert">The table could not open. Please refresh to try again.</p>';console.error(cause)})
