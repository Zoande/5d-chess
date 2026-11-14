import {api,ApiError,getSession,initShell,renderAccount} from '../shell.ts'
import {icon} from '../icons.ts'
import type {Profile} from '../account-model.ts'
import {casinoCoins,grossMultiplier,pocketColor,type CasinoGame,type RouletteChoice,type CasinoBet,type CasinoView,type CasinoRound,type CasinoReply} from '../casino-model.ts'
import {rouletteArena,rouletteHeading,rouletteWager,animateRoulette,setRouletteSelection,setRouletteBusy,renderRouletteHistory,bindRouletteTable,landRouletteResult} from './roulette.ts'
import {rules} from './casino-panels.ts'
import type {DiceScene,TableAction} from './dice-scene.ts'

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const game=document.body.dataset.casino as CasinoGame
let state:CasinoView,profile:Profile,choice:RouletteChoice=game==='dice'?1:'white',busy=false,rolling=false,pending:CasinoBet|undefined,awaitingThrow:CasinoRound|undefined,scene:DiceScene|undefined,storageKey='',requestKey='',phase='idle'
let projectionFrame=0,presentationCoins=0,dialogueTimer=0,impatienceTimer=0,resultTimer=0
const title=(c:RouletteChoice)=>typeof c==='number'?game==='dice'?`Face ${c}`:c===0?'The rift · 0':`Square ${c}`:c==='white'?'White court':c==='black'?'Black court':c==='low'?'1–18':c==='high'?'19–36':c==='odd'?'Odd squares':'Even squares'
const pips=(n:number)=>`<span class="mini-die face-${n}" aria-hidden="true">${[1,2,3,4,5,6,7,8,9].map(i=>`<i class="pip p${i}"></i>`).join('')}</span>`
const stake=()=>Number(el<HTMLInputElement>('stake').value)
const safeStore=(key:string,value:unknown)=>{try{value===undefined?sessionStorage.removeItem(key):sessionStorage.setItem(key,JSON.stringify(value))}catch{}}
function say(text:string){if(game!=='dice')return;clearTimeout(dialogueTimer);el('keeper-dialogue').textContent=text;scene?.speak(text);dialogueTimer=window.setTimeout(()=>{el('keeper-dialogue').textContent=''},5000)}
function diceRoom(){
 const buttons=[...[1,2,3,4,5,6].map(n=>({id:'face-'+n,label:'Choose face '+n})),...[25,100,500,1000].map(n=>({id:'stake-'+n,label:`Stake ${n} coins`})),{id:'minus',label:'Decrease stake by 25'},{id:'plus',label:'Increase stake by 25'},{id:'amount',label:'Edit stake amount'},{id:'offer',label:'Offer coins'}]
 return `<section class="silent-room" data-phase="idle"><canvas id="dice-canvas" tabindex="0" aria-label="Seated at a felt table opposite the Keeper. Drag empty space to look; use the brass keys to wager." aria-describedby="table-instructions"></canvas><div class="silent-vignette"></div><div class="table-tools"><button id="center-view" type="button">${icon('target')}<span>Center view</span></button><button id="open-rules" type="button">${icon('info')}<span>Rules</span></button><button id="open-history" type="button">${icon('clock')}<span>History</span></button></div><div class="physical-controls" aria-label="Controls on the table">${buttons.map(b=>`<button type="button" class="physical-control" data-control="${b.id}" aria-label="${b.label}"><span>${b.label}</span></button>`).join('')}</div><div class="dice-accessible-status"><p id="keeper-dialogue" aria-live="polite"></p><span id="table-instructions">Drag empty space to look · Home to center · Pick up the die to throw</span></div><div class="dice-accessible-status"><span id="chosen-label">Face 1</span><span id="return-estimate"></span><span class="table-purse">Purse <strong id="table-balance"></strong></span></div><form id="wager-form" class="table-fallback"><label for="stake">Stake in coins</label><input id="stake" type="number" min="1" max="100000" step="1" value="100" required><div class="fallback-faces">${[1,2,3,4,5,6].map(n=>`<button type="button" data-face="${n}" aria-label="Choose face ${n}">${pips(n)}</button>`).join('')}</div><button id="place-bet" type="submit">Offer coins</button><button id="roll-die" type="button" hidden>Throw die</button></form><p id="casino-error" class="table-error" role="alert" hidden></p><section id="round-result" class="table-result" aria-live="polite" hidden></section><dialog id="amount-dialog" class="table-modal"><form id="amount-form"><span class="eyebrow">YOUR OFFER</span><h2>How many coins?</h2><label for="custom-stake">Whole coins, from 1 to 100,000</label><input id="custom-stake" type="number" min="1" max="100000" step="1" required><div class="modal-actions"><button id="cancel-amount" type="button">Cancel</button><button type="submit">Set stake</button></div></form></dialog><dialog id="table-information" class="table-modal"><button id="close-information" type="button" class="modal-close" aria-label="Close table information">×</button><section id="table-rules">${rules(game)}</section><section id="table-history"><span class="eyebrow">ROUND RECEIPTS</span><h2>Your time at the table</h2><div id="round-history"></div></section></dialog></section>`
}
function renderLayout(){el('casino-root').innerHTML=game==='dice'?diceRoom():`${rouletteHeading()}<div class="casino-layout royal-layout">${rouletteArena()}${rouletteWager()}</div><dialog id="roulette-history-dialog" class="table-modal roulette-history-modal"><button id="close-roulette-history" type="button" class="modal-close" aria-label="Close roulette history">×</button><div class="ledger-heading"><div><h2>Your roulette history</h2><p>Past results do not predict the next draw.</p></div><div id="roulette-ledger"></div></div><div id="round-history"></div></dialog>`}
function setPhase(value:string){phase=value;clearTimeout(impatienceTimer);if(value==='ready')impatienceTimer=window.setTimeout(()=>{if(phase==='ready')say(['“The die will not throw itself.”','“Take your time. Fortune is patient.”','“Still deciding? The ivory is yours.”'][Math.floor(Math.random()*3)])},18000);if(game==='dice')document.querySelector('.silent-room')!.setAttribute('data-phase',value);updateScene()}
function updateScene(){scene?.setState(presentationCoins,stake(),Number(choice),busy)}
function updateChoice(){
 el('chosen-label').textContent=title(choice)
 document.querySelectorAll<HTMLElement>('[data-pocket],[data-outside],[data-face],[data-control^="face-"]').forEach(b=>{
  const value=b.dataset.pocket!==undefined?Number(b.dataset.pocket):b.dataset.face!==undefined?Number(b.dataset.face):b.dataset.control?.startsWith('face-')?Number(b.dataset.control.slice(5)):b.dataset.outside
  b.setAttribute('aria-pressed',String(value===choice))
 })
 const gross=stake()*grossMultiplier(game,choice),tax=Math.max(0,gross-stake())*.01
 el('return-estimate').textContent=Number.isFinite(gross)&&stake()>0?game==='roulette'?`${casinoCoins(gross-tax)} coins`:`Win return ${casinoCoins(gross-tax)}`:'Choose your offer'
 if(el('tax-estimate'))el('tax-estimate').textContent=stake()>0?`${casinoCoins(gross)} gross − ${casinoCoins(tax)} profit tax`:''
 if(game==='roulette')setRouletteSelection(choice,stake())
 updateScene()
}
function renderBalance(){presentationCoins=state.coins;el('table-balance').textContent=casinoCoins(state.coins);renderAccount({...profile,coins:state.coins});updateScene()}
function renderHistory(){
 const allRounds=state.recent.filter(r=>r.game===game&&r.id!==awaitingThrow?.id),rounds=allRounds.slice(0,12)
 if(game==='roulette')renderRouletteHistory(allRounds)
 el('round-history').innerHTML=rounds.length?rounds.map(r=>`<details class="history-round ${r.won?'won':'lost'}"><summary><span class="history-face ${game==='roulette'?'pocket-'+pocketColor(r.result):''}">${game==='dice'?pips(r.result):r.result===0?'◆':r.result}</span><span><strong>${title(r.choice)}</strong><small>${casinoCoins(r.stake)} coins</small></span><b>${r.net>=0?'+':''}${casinoCoins(r.net)}</b></summary><div><span>Gross return <b>${casinoCoins(r.gross)}</b></span><span>Profit tax <b>${casinoCoins(r.tax)}</b></span><span>Credited <b>${casinoCoins(r.credited)}</b></span></div></details>`).join(''):'<p class="history-empty">Your settled wagers will appear here.</p>'
}
function lock(value:boolean){
 busy=value;if(game==='dice')scene?.lockCamera(value)
 document.querySelectorAll<HTMLButtonElement|HTMLInputElement>('#wager-form input,#wager-form button,[data-pocket],[data-outside]').forEach(b=>b.disabled=value)
 el<HTMLButtonElement>('place-bet').textContent=value?'Wager in progress…':pending?'Retry the same offer':game==='dice'?'Offer coins':'Place bet & spin'
 if(game==='roulette'){setRouletteBusy(value);renderRouletteHistory(state.recent.filter(r=>r.game==='roulette'))}
 updateScene()
}
function reveal(round:CasinoRound){
 awaitingThrow=undefined;rolling=false;safeStore(storageKey,undefined);safeStore(requestKey,undefined);renderBalance();renderHistory()
 const result=el('round-result');result.hidden=false;result.dataset.won=String(round.won)
 if(game==='dice'){
  scene?.lockCamera(false);result.innerHTML=`<span>${round.won?'THE KEEPER PAYS':'THE DIE HAS SPOKEN'}</span><strong>${round.net>=0?'+':''}${casinoCoins(round.net)} <small>coins</small></strong><p>Face ${round.result} · Offered ${casinoCoins(round.stake)} · Tax ${casinoCoins(round.tax)}</p><button id="dismiss-result" type="button" aria-label="Dismiss round result">×</button>`
  clearTimeout(resultTimer);resultTimer=window.setTimeout(()=>result.hidden=true,5500);el('dismiss-result').onclick=()=>result.hidden=true;say(round.won?'“A fair throw. Your winnings.”':'“Another offer, perhaps?”');setPhase('result');el('roll-die').hidden=true
 }else{
  result.innerHTML=`<span class="result-eyebrow">${round.won?'A FORTUNATE MOVE':'THE TABLE TAKES THIS ONE'}</span><h2>${round.result===0?'The rift · 0':`${round.result} · ${pocketColor(round.result)==='white'?'White':'Black'} court`}</h2><strong class="result-net">${round.net>=0?'+':''}${casinoCoins(round.net)} <small>coins</small></strong><div><span>Stake <b>${casinoCoins(round.stake)}</b></span><span>Gross return <b>${casinoCoins(round.gross)}</b></span><span>Profit tax <b>${casinoCoins(round.tax)}</b></span><span>Credited <b>${casinoCoins(round.credited)}</b></span></div>`
  landRouletteResult(round.result);el('pocket-readout').textContent=round.result===0?'The rift':String(round.result);el('spin-caption').textContent=`${round.net>=0?'+':''}${casinoCoins(round.net)} coins · ${round.won?'Your wager found its square.':'The next move is yours.'}`
 }
 lock(false)
}
async function throwDie(){
 if(!awaitingThrow||rolling||phase!=='ready')return
 rolling=true;clearTimeout(impatienceTimer);const round=awaitingThrow;el<HTMLButtonElement>('roll-die').disabled=true;setPhase('rolling');say('The ivory turns. The Keeper watches.')
 if(scene)await scene.roll(round.result)
 reveal(round);el<HTMLButtonElement>('roll-die').disabled=false
}
async function present(round:CasinoRound,recovered=false){
 safeStore(storageKey,round)
 if(game==='roulette'){if(!recovered)await animateRoulette(round.result);reveal(round);return}
 awaitingThrow=round;lock(true);renderHistory()
 if(!recovered){setPhase('exchange');scene?.lockCamera(true);say('Your offer crosses the table.');await scene?.exchange()}
 scene?.lockCamera(true);scene?.ready();setPhase('ready');say(recovered?'Your offer is saved. The die is yours to throw.':'“Your move.”');el('roll-die').hidden=false;el<HTMLButtonElement>('roll-die').disabled=false
}
async function settle(event?:Event){
 event?.preventDefault();if(busy){if(phase==='ready')void throwDie();return}
 if(pending){choice=pending.choice;el<HTMLInputElement>('stake').value=String(pending.stake);updateChoice()}
 if(!Number.isSafeInteger(stake())||stake()<1||stake()>state.maxStake){el('casino-error').textContent='Choose a whole number from 1 to 100,000 coins.';el('casino-error').hidden=false;return}
 el('casino-error').hidden=true
 pending??={game,choice,stake:stake(),sequence:state.nextSequence,requestId:crypto.randomUUID()}
 safeStore(requestKey,pending);lock(true);el('round-result').hidden=true
 try{
  const data=await api<CasinoReply&{profile:Profile}>('/casino/bet',pending);state=data;profile=data.profile;pending=undefined;safeStore(requestKey,undefined);await present(data.round)
 }catch(cause){
  // A proxy failure can arrive after commit. Reconcile by receipt before allowing
  // a fresh id; an uncertain retry always retains the original wager.
  let recovered:CasinoRound|undefined
  try{state=await api<CasinoView>('/casino');recovered=state.recent.find(r=>r.requestId===pending?.requestId)}catch{}
  if(recovered){pending=undefined;safeStore(requestKey,undefined);await present(recovered,true);return}
  if(cause instanceof ApiError&&cause.status>=400&&cause.status<500&&![408,429].includes(cause.status)){pending=undefined;safeStore(requestKey,undefined)}
  el('casino-error').textContent=cause instanceof Error?cause.message:'The offer could not be confirmed. Retry the same wager.';el('casino-error').hidden=false;renderBalance();renderHistory();lock(false)
 }
}
function action(a:TableAction|{kind:'throw'}){
 if(a.kind==='throw'){void throwDie();return}
 if(a.kind==='offer'){void settle();return}
 if(busy)return
 if(a.kind==='face')choice=a.value!
 else if(a.kind==='stake')el<HTMLInputElement>('stake').value=String(a.value)
 else if(a.kind==='minus'||a.kind==='plus')el<HTMLInputElement>('stake').value=String(Math.max(1,Math.min(state.maxStake,stake()+(a.kind==='plus'?25:-25))))
 else if(a.kind==='amount'){el<HTMLInputElement>('custom-stake').value=String(stake());el<HTMLDialogElement>('amount-dialog').showModal();el('custom-stake').focus()}
 updateChoice()
}
function bindDice(){
 const canvas=el<HTMLCanvasElement>('dice-canvas')
 let gesture:{id:number;x:number;y:number;yaw:number;pitch:number;throwing:boolean;action?:TableAction|{kind:'throw'}}|undefined
 const cancel=()=>{if(gesture&&canvas.hasPointerCapture(gesture.id))canvas.releasePointerCapture(gesture.id);gesture=undefined;scene?.setDrag(0,0)}
 canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==2)return;e.preventDefault();canvas.focus({preventScroll:true})
  const look=scene?.getLook()??{yaw:0,pitch:0},hit=scene?.pick(e.clientX,e.clientY)
  gesture={id:e.pointerId,x:e.clientX,y:e.clientY,...look,throwing:phase==='ready',action:hit};canvas.setPointerCapture(e.pointerId)
 })
 canvas.addEventListener('pointermove',e=>{
  if(!gesture||e.pointerId!==gesture.id)return
  const x=e.clientX-gesture.x,y=e.clientY-gesture.y
  if(gesture.throwing)scene?.setDrag(x,y)
  else if(!gesture.action&&!['exchange','rolling'].includes(phase))scene?.setLook(gesture.yaw-x*.004,gesture.pitch+y*.004)
 })
 canvas.addEventListener('pointerup',e=>{
  if(!gesture||gesture.id!==e.pointerId)return
  const g=gesture,rect=canvas.getBoundingClientRect(),inside=e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom
  const distance=Math.hypot(e.clientX-g.x,e.clientY-g.y)
  gesture=undefined;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)
  if(!inside){scene?.setDrag(0,0);return}
  if(g.throwing){void throwDie();return}
  if(g.action&&distance<9)action(g.action)
 })
 canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',()=>{if(gesture)cancel()});canvas.addEventListener('contextmenu',e=>e.preventDefault());window.addEventListener('blur',cancel)
 canvas.addEventListener('keydown',e=>{
  const look=scene?.getLook();if(e.key==='Home'){scene?.recenter();e.preventDefault()}
  else if(e.key===' '&&phase==='ready'){void throwDie();e.preventDefault()}
  else if(look&&!['exchange','ready','rolling'].includes(phase)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){scene?.setLook(look.yaw+(e.key==='ArrowLeft'?-.08:e.key==='ArrowRight'?.08:0),look.pitch+(e.key==='ArrowUp'?-.08:e.key==='ArrowDown'?.08:0));e.preventDefault()}
 })
 el('center-view').onclick=()=>{cancel();scene?.recenter()}
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')){
  button.onclick=()=>{const id=button.dataset.control!,a=id.startsWith('face-')?{kind:'face',value:Number(id.slice(5))}:id.startsWith('stake-')?{kind:'stake',value:Number(id.slice(6))}:{kind:id};action(a as TableAction)}
  button.onfocus=()=>scene?.highlight(button.dataset.control);button.onblur=()=>scene?.highlight(undefined);button.onpointerenter=()=>scene?.highlight(button.dataset.control);button.onpointerleave=()=>scene?.highlight(undefined)
 }
 const project=()=>{
  if(!scene)return
  for(const c of scene.controls()){
   const button=document.querySelector<HTMLButtonElement>(`[data-control="${c.id}"]`)!
   button.hidden=!c.visible;button.disabled=c.disabled;button.style.cssText=`left:${c.x.toFixed(1)}px;top:${c.y.toFixed(1)}px;width:${c.width.toFixed(1)}px;height:${c.height.toFixed(1)}px`
   if(c.id==='offer')button.setAttribute('aria-label',phase==='ready'?'Throw die':pending?'Retry the same offer':'Offer coins')
  }
  projectionFrame=requestAnimationFrame(project)
 };projectionFrame=requestAnimationFrame(project)
 const information=el<HTMLDialogElement>('table-information')
 el('open-rules').onclick=()=>{cancel();el('table-rules').hidden=false;el('table-history').hidden=true;information.showModal();information.querySelector('details')!.open=true}
 el('open-history').onclick=()=>{cancel();renderHistory();el('table-rules').hidden=true;el('table-history').hidden=false;information.showModal()}
 el('close-information').onclick=()=>information.close()
 el('cancel-amount').onclick=()=>el<HTMLDialogElement>('amount-dialog').close()
 el<HTMLFormElement>('amount-form').onsubmit=e=>{e.preventDefault();el<HTMLInputElement>('stake').value=el<HTMLInputElement>('custom-stake').value;updateChoice();el<HTMLDialogElement>('amount-dialog').close()}
 el('roll-die').onclick=()=>void throwDie()
 window.addEventListener('pagehide',e=>{if(!e.persisted){cancelAnimationFrame(projectionFrame);scene?.dispose()}})
}
async function init(){
 await initShell();const session=await getSession();if(!session.user){location.replace('/chess/login.html');return}
 profile=session.profile!;state=await api<CasinoView>('/casino');storageKey=`5d-casino-presentation:${session.user}:${game}`;requestKey=`5d-casino-request:${session.user}:${game}`
 renderLayout();renderBalance();updateChoice();renderHistory();el<HTMLFormElement>('wager-form').onsubmit=e=>void settle(e);el('stake').oninput=updateChoice
 document.querySelectorAll<HTMLButtonElement>('[data-stake]').forEach(b=>b.onclick=()=>{if(!busy){el<HTMLInputElement>('stake').value=b.dataset.stake!;updateChoice()}})
 document.querySelectorAll<HTMLButtonElement>('[data-pocket],[data-outside],[data-face]').forEach(b=>b.onclick=()=>{if(busy)return;choice=b.dataset.pocket!==undefined?Number(b.dataset.pocket):b.dataset.face!==undefined?Number(b.dataset.face):b.dataset.outside as RouletteChoice;updateChoice()})
 if(game==='roulette'){
  bindRouletteTable()
  el('open-roulette-history').onclick=()=>{renderHistory();el<HTMLDialogElement>('roulette-history-dialog').showModal()}
  el('close-roulette-history').onclick=()=>el<HTMLDialogElement>('roulette-history-dialog').close()
  document.querySelectorAll<HTMLButtonElement>('[data-adjust]').forEach(b=>b.onclick=()=>{if(busy)return;const limit=Math.max(1,Math.min(state.maxStake,Math.floor(state.coins)));el<HTMLInputElement>('stake').value=String(Math.max(1,Math.min(limit,b.dataset.adjust==='max'?limit:b.dataset.adjust==='half'?Math.floor(stake()/2):stake()*2)));updateChoice()})
  el('repeat-wager').onclick=()=>{if(busy)return;const last=state.recent.find(r=>r.game==='roulette');if(last){choice=last.choice;el<HTMLInputElement>('stake').value=String(last.stake);updateChoice();el('place-bet').focus()}}
 }
 if(game==='dice'){
  lock(true);try{const {DiceScene}=await import('./dice-scene.ts');scene=new DiceScene(el<HTMLCanvasElement>('dice-canvas'));updateScene();document.querySelector('.silent-room')!.classList.add('scene-ready');el('wager-form').inert=true;el('wager-form').setAttribute('aria-hidden','true')}
  catch{document.querySelector('.silent-room')!.classList.add('webgl-unavailable');say('The 3D table is unavailable. The same wagers work below.')}
  lock(false);bindDice()
 }
 try{
  const saved=JSON.parse(sessionStorage.getItem(storageKey)??'null') as CasinoRound|null,request=JSON.parse(sessionStorage.getItem(requestKey)??'null') as CasinoBet|null
  const restored=state.recent.find(r=>r.id===saved?.id||r.requestId===request?.requestId)
  if(restored){await present(restored,true)}
  else if(request?.game===game&&request.sequence===state.nextSequence){pending=request;choice=request.choice;el<HTMLInputElement>('stake').value=String(request.stake);updateChoice();lock(false);say('An offer is unconfirmed. Retry it with the same receipt.')}
  else safeStore(requestKey,undefined)
 }catch{safeStore(storageKey,undefined);safeStore(requestKey,undefined)}
}
void init().catch(cause=>{el('casino-root').innerHTML='<p class="casino-error" role="alert">The table could not open. Please refresh to try again.</p>';console.error(cause)})
