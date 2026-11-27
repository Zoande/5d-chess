import {mapVersion} from './load-map.ts'
import {DIRECTORY} from './urban-layout.ts'
import {ResortUI} from './resort-ui.ts'
import {openBooking} from './booking-ui.ts'
import {openArmory} from './armory-ui.ts'
import {streetCounter} from './street-counter.ts'
import {storefront} from './storefronts.ts'
import {ArcadeControls,counterUI} from './arcade-ui.ts'
import {jigsaw} from '../jigsaw.ts'
import {RestaurantUI} from './restaurant-ui.ts'
import {api,ApiError,getSession,initShell,updateWalletBalance} from '../shell.ts'
import {casinoCoins,grossMultiplier,pocketColor,MAX_CASINO_STAKE,type CasinoView,type RouletteChoice} from '../casino-model.ts'
import type {FloorReport} from '../floor-report.ts'
import {isExchangeStock,type StockView,type PricePoint} from '../stock-model.ts'
import {DICE_TABLE_INDEX,DESTINATIONS,WORLD_TABLES,type Destination,type WorldAction,type WorldView} from './model.ts'
import {ResidentialServices} from './residential-services.ts'
import {coins,safeText} from './services.ts'
import type {CityStage} from './stage.ts'
import type {Position} from '../roulette-hall-model.ts'

const cast=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E
const host=cast('city-world'),connection=cast('world-connection'),panel=cast('world-table'),dialog=cast<HTMLDialogElement>('world-service')
const graphicsMessage='Preparing city graphics…'
const pause=cast('world-pause'),chatForm=cast<HTMLFormElement>('world-chat-form'),chatInput=chatForm.querySelector('input')!
const puzzleDialog=cast<HTMLDialogElement>('cell-jigsaw')
let paused=false,chatting=false
function syncControls(){stage?.lock(closed||paused||chatting||dialog.open||puzzleDialog.open)}
function showPause(){
  if(puzzleDialog.open)return
  if(closed||paused)return
  paused=true;pause.hidden=false
  if(chatting)chatInput.blur()
  if(dialog.open){dialog.close();shownService=''}
  syncControls()
}
function resume(){paused=false;pause.hidden=true;syncControls();stage?.resumeMouse()}
cast('world-continue').onclick=resume
cast('world-pause-toggle').onclick=()=>paused?resume():showPause()
document.addEventListener('visibilitychange',()=>{if(document.hidden)showPause()})
window.addEventListener('blur',showPause)
let chatKey=''
function renderChat(next:WorldView){
  const key=next.id+JSON.stringify(next.chat?.slice(-8).map(m=>[m.id,m.name,m.text]))
  if(key===chatKey)return
  chatKey=key
  const list=cast('world-messages')
  list.innerHTML=(next.chat??[]).slice(-8).map(m=>`<li><b>${safeText(m.name)}</b> ${safeText(m.text)}</li>`).join('')
  list.scrollTop=list.scrollHeight
}
chatInput.onfocus=()=>{chatting=true;syncControls()}
chatInput.onblur=()=>{chatting=false;syncControls()}
chatForm.onsubmit=async e=>{
  e.preventDefault()
  const text=chatInput.value.trim()
  if(!text||performing)return
  chatInput.blur();stage?.resumeMouse()
  try{await action('chat',{text});if(chatInput.value.trim()===text)chatInput.value=''}catch{}
}
let resortUI:ResortUI|undefined
const packUI=new ArcadeControls(cast('city-pack'),action,syncLoadout)
function syncLoadout(){stage?.setLoadout(packUI.weapon,(op,target)=>packUI.trigger(op,target),()=>packUI.eat())}
let restaurant:RestaurantUI|undefined
let stage:CityStage|undefined,services:ResidentialServices|undefined,view:WorldView|undefined
let offset=0,refreshing:Promise<void>|undefined,performing=false,closed=false,errorTimer=0
let closeWhenIdle:{action:string;station:string}|undefined
let updateBooking:ReturnType<typeof openBooking>|undefined
let updateArmory:((next:WorldView)=>void)|undefined
let viewKey='',shownService='',lastFloor='';let closeAfterFloor=false
let stake=25,choice:RouletteChoice='white',activeTable=-1,tableKey=''
let pending:{round:string;requestId:string;stake:number;choice:RouletteChoice}|undefined
const options={white:'Ivory',black:'Obsidian',even:'Even',odd:'Odd',low:'1–18',high:'19–36'} as const
const title=(n:RouletteChoice)=>typeof n==='number'?String(n):options[n]
const like=(to:string):to is Destination=>Object.hasOwn(DESTINATIONS,to)
function showError(text:string){
  const p=cast('world-error');p.textContent=text;p.hidden=false
  clearTimeout(errorTimer);errorTimer=window.setTimeout(()=>p.hidden=true,4800)
}
const seated=()=>view?.you.chair
function tableStatus(){
  const chair=seated(),table=chair&&view?.hall?.tables[chair.table]
  if(!table)return
  const left=Math.max(0,Math.ceil((table.until-Date.now()-offset)/1000))
  const status=panel.querySelector<HTMLElement>('[data-round-clock]')
  if(status)status.textContent=table.phase==='betting'?left+'s':table.phase==='spin'?'In motion':table.phase==='result'?'Round settled':'Waiting'
}
function updateSelection(){
  const chair=seated()
  if(!chair)return
  panel.querySelectorAll<HTMLButtonElement>('[data-face]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.face===String(choice))))
  const gross=stake*grossMultiplier(chair.table===DICE_TABLE_INDEX?'dice':'roulette',choice,view?.hall?.houseEdge)
  const line=panel.querySelector('[data-payout]')
  if(line)line.textContent=view?.hall?.open===false?'New wagers are paused':Number.isSafeInteger(stake)&&stake>0?coins(gross)+' if you win':'Choose a whole coin amount'
  const lock=panel.querySelector<HTMLButtonElement>('[data-lock]')
  if(lock)lock.disabled=view?.hall?.open===false||performing||!Number.isSafeInteger(stake)||stake<1||stake>(view?.hall?.maxStake??MAX_CASINO_STAKE)||stake>(view?.coins??0)
}
function renderTable(){
  if(!view)return
  const chair=view.you.chair,table=chair&&view.hall?.tables[chair.table]
  panel.hidden=!chair&&!view.you.lounge
  if(!chair||!table){
    if(view.you.lounge&&tableKey!=='lounge'){panel.innerHTML='<div class="world-table-head"><h2>Lounge</h2><button type="button" data-stand>Stand up</button></div>';tableKey='lounge'}
    else if(!view.you.lounge)tableKey=''
    activeTable=-1;pending=undefined
    return
  }
  const dice=chair.table===DICE_TABLE_INDEX
  if(activeTable!==chair.table){choice=dice?1:'white';activeTable=chair.table}
  const locked=Boolean(table.seats[chair.index]?.locked)
  if(pending&&(pending.round!==table.round||locked))pending=undefined
  const key=JSON.stringify([chair.table,table.round,table.phase,locked,table.prizes,table.wagers,view.hall?.maxStake,view.hall?.open])
  if(key!==tableKey){
    tableKey=key
    const faces=dice?Array.from({length:6},(_,i)=>i+1):Array.from({length:37},(_,i)=>i)
    const mat=`<div class="world-bet-numbers ${dice?'dice-numbers':''}" role="group" aria-label="${dice?'Dice faces':'Roulette pockets'}">${faces.map(n=>`<button type="button" data-face="${n}" class="${dice?'':pocketColor(n)}" aria-label="${dice?'Face ':'Pocket '}${n}">${n}</button>`).join('')}</div>${
      dice?'':`<div class="world-bet-outside">${Object.entries(options).map(([value,label])=>`<button type="button" data-face="${value}">${label}</button>`).join('')}</div>`
    }`
    panel.innerHTML=`<div class="world-table-head"><div><small>${dice?'PUBLIC DICE':'ROULETTE'} · <span data-round-clock></span></small><h2>${WORLD_TABLES[chair.table].name}</h2></div><button type="button" data-stand ${table.phase==='spin'||locked&&table.phase==='betting'?'disabled':''}>Stand up</button></div>
      <ul class="world-seats">${table.seats.map(()=>'<li></li>').join('')}</ul>
      ${table.phase==='betting'&&!locked?`<form class="world-wager">${mat}<div class="world-wager-row"><label>Stake<input type="number" min="1" max="${view.hall?.maxStake??MAX_CASINO_STAKE}" step="1" required value="${stake}" inputmode="numeric"></label><button type="submit" class="world-primary" data-lock>Lock bet</button></div><small data-payout></small></form>`:
      table.phase==='spin'?'<p class="world-muted">Bets are closed. Watch the table.</p>':
      table.phase==='result'?`<div class="world-result"><strong>${dice?'Face':'Pocket'} ${table.spin?.pocket}</strong><ul class="world-ledger">${(table.prizes??[]).map(p=>`<li><span>${safeText(p.name)}</span><b class="${p.won?'is-winner':''}">${p.net>=0?'+':'−'}${casinoCoins(Math.abs(p.net))}</b></li>`).join('')}</ul></div>`:'<p class="world-muted">Your bet is locked. Waiting for the table.</p>'}`
    if(table.wagers?.length)panel.insertAdjacentHTML('beforeend',`<section class="world-wagers" aria-label="Bets this round"><h3>Bets this round</h3><ul>${table.wagers.map((b,i)=>`<li data-chip="${i}"><b>${safeText(b.name)}</b><span>${dice?'Face ':''}${safeText(title(b.choice))} · ${coins(b.stake)}</span></li>`).join('')}</ul></section>`)
    panel.insertAdjacentHTML('beforeend',`<details class="world-table-rules"><summary>Rules and recent results</summary><p>${dice?'Pick one face. The croupier rolls one shared die. The return for your selected face is shown above.':'Bet on a pocket or choose an outside bet. The wheel result is shared by the table.'}</p><p>${table.recent.length?'Recent: '+table.recent.join(' · '):'No recent results yet.'}</p></details>${dice?'':'<details class="world-table-rules" data-history><summary>Your roulette history</summary><ul class="world-ledger"></ul></details>'}`)
    const history=panel.querySelector<HTMLDetailsElement>('[data-history]')
    if(history)history.ontoggle=()=>{
      if(!history.open)return
      const list=history.querySelector('ul')!
      list.innerHTML='<li>Loading rounds…</li>'
      void api<CasinoView>('/casino').then(data=>{
        list.innerHTML=data.recent.filter(r=>r.game==='roulette').slice(0,15).map(r=>`<li><span>Pocket ${r.result} · ${title(r.choice)}</span><b class="${r.won?'is-winner':''}">${r.net>=0?'+':'−'}${casinoCoins(Math.abs(r.net))}</b></li>`).join('')||'<li>No roulette rounds yet.</li>'
      }).catch(()=>{list.innerHTML='<li>Roulette history is unavailable.</li>'})
    }
    const form=panel.querySelector<HTMLFormElement>('form')
    if(form){
      form.oninput=e=>{if((e.target as HTMLElement).matches('input')){stake=Number((e.target as HTMLInputElement).value);updateSelection()}}
      form.onsubmit=e=>{
        e.preventDefault()
        if(performing)return
        pending??={round:table.round,stake,choice,requestId:crypto.randomUUID()}
        void action('bet',pending).catch(error=>{if(error instanceof ApiError&&error.status>=400&&error.status<500&&error.status!==408)pending=undefined})
      }
    }
  }
  panel.querySelectorAll('.world-seats li').forEach((seat,i)=>{
    const member=table.seats[i],label=member?.name??'Open seat'
    if(seat.textContent!==label)seat.textContent=label
    seat.classList.toggle('is-ready',Boolean(member?.locked))
  })
  tableStatus();updateSelection()
}
panel.onclick=e=>{
  const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button')
  if(!button)return
  if(button.hasAttribute('data-stand'))void action('stand',{}).catch(()=>undefined)
  else if(button.dataset.face!==undefined){
    choice=/^\d+$/.test(button.dataset.face)?Number(button.dataset.face):button.dataset.face as RouletteChoice
    updateSelection()
  }
}
async function floorScreens(zone:string){
  if(!zone.startsWith('floor:'))return
  const symbol=zone.slice(6)
  try{
    if(isExchangeStock(symbol)){
      const report=await api<FloorReport>('/stocks/floor?symbol='+symbol)
      if(view?.you.zone===zone)stage?.report(report)
      return
    }
    const data=await api<StockView>('/stocks')
    if(view?.you.zone!==zone)return
    const quote=data.quotes[symbol]
    stage?.quote(symbol,quote?.history??[],quote?.price)
    const {points}=await api<{points:PricePoint[]}>('/stocks/history?symbol='+encodeURIComponent(symbol))
    if(view?.you.zone===zone)stage?.quote(symbol,points.slice(-60),quote?.price)
  }catch{}
}
function accepted(next:WorldView & {mapVersion?:string},start:number,reposition=false,sent?:Position){
  if(next.mapVersion!==mapVersion){unavailable('Meridian is updating. Retry to load the current map.');return}
  const observedOffset=next.now-(start+Date.now())/2
  offset=view?.id===next.id&&Math.abs(observedOffset-offset)<650?offset+.2*(observedOffset-offset):observedOffset
  const scope=next.id+':'+next.you.zone,changed=viewKey!==scope
  if(closed)return
  if(Boolean(next.arcade?.custody)!==document.body.classList.contains('in-custody')){
    closed=true;location.reload();return
  }
  if(puzzleDialog.open&&(next.arcade?.custody?.ends!==null||next.arcade.custody.cell!==view?.arcade?.custody?.cell))puzzleDialog.close()
  view=next;packUI.update(next);syncLoadout()
  if(next.you.zone==='private'){
    closed=true;location.replace('/chess/dice.html?cave=1');return
  }
  if(host.dataset.zone!==next.you.zone)host.dataset.zone=next.you.zone
  const seatedState=String(Boolean(next.you.chair||next.you.lounge||next.you.dining!==undefined||next.you.barSeat!==undefined||next.you.boardSeat!==undefined))
  if(host.dataset.seated!==seatedState)host.dataset.seated=seatedState
  if(changed){
    viewKey=scope;shownService='';services?.close()
    if(next.you.zone!==lastFloor){lastFloor=next.you.zone;void floorScreens(lastFloor)}
  }
  stage?.set(next,offset,reposition,sent);syncControls();renderChat(next)
  connection.hidden=!stage?.preparingGraphics
  if(stage?.preparingGraphics)connection.textContent=graphicsMessage
  updateWalletBalance(next.coins)
  restaurant?.update(next)
  if(changed){
    const nav=next.you.zone.startsWith('hotel')||next.you.zone==='casino'?'casino-floor':next.you.zone==='bank'?'bank':next.you.zone==='kfc'?'kfc':next.you.zone==='exchange'||next.you.zone.startsWith('floor:')?'stocks':next.you.zone==='station'||next.you.zone.startsWith('precinct:')?'prison':next.you.zone==='gunshop'?'gunshop':next.you.zone==='city'?'city':''
    for(const a of document.querySelectorAll<HTMLAnchorElement>('.economy-nav a[href*="world.html"]')){
      if(new URL(a.href).searchParams.get('go')===nav)a.setAttribute('aria-current','page')
      else a.removeAttribute('aria-current')
    }
  }
  renderTable()
  const service=next.interaction
  const station=service?.startsWith('kfc:kitchen:')?service:undefined
  stage?.setStation(station,gesture=>{
    if(!station)return
    void action('restaurant',{command:'kitchen',point:station,gesture}).finally(()=>stage?.resetTool()).catch(()=>{})
  })
  if(!paused&&service?.startsWith('resort:')){
    if(shownService!==service||dialog.open){resortUI?.open(next);syncControls()}
    shownService=service
    return
  }
  if(!paused&&service==='booking'){
    if(shownService!==service){
      stage?.lock(true)
      updateBooking=openBooking(dialog,next,async booking=>{
        if(performing||closed)throw Error('Please try again.')
        await action('bail',{booking})
      })
    }else if(dialog.open)updateBooking?.(next)
    shownService=service;return
  }
  if(!paused&&service==='counter'){
    if(shownService!==service){
      stage?.lock(true)
      updateArmory=openArmory(dialog,next,async(item,payment,sequence)=>{
        if(performing||closed)throw Error('Counter busy. Try again.')
        await action('arcade',{operation:'buy',item,payment,sequence})
      })
    }else if(dialog.open)updateArmory?.(next)
    shownService=service;return
  }
  if(!service&&shownService.startsWith('resort:')&&dialog.open)services?.close()
  if(!paused&&service&&shownService!==service){
    shownService=service
    if(station)return
    if(service.startsWith('directory:')){
      const marker=DIRECTORY.find(p=>p.id===service)
      if(!marker)return
      services?.directory(marker)
      stage?.lock(true);return
    }
    if(['cash','desk'].includes(service)||service.startsWith('drawer:')){
      stage?.lock(true)
      const render=()=>{if(view&&view.interaction===service)counterUI(dialog,view,async data=>{await action('arcade',data);render()})}
      render();return
    }
    if(service.startsWith('lift:')){
      stage?.lock(true)
      services?.residentialLift(next.you.zone,async level=>{await action('home-floor',{level});services?.close()})
      return
    }
    if(service==='food'||service.startsWith('fridge:')){
      stage?.lock(true)
      const render=()=>{if(view?.food)services?.food(view.food,async data=>{await action('food',data);render()})}
      render()
      return
    }
    if(service.startsWith('front:')){
      stage?.lock(true)
      const front=storefront(service)!
      if(front.id==='hall'){
        const render=()=>{if(view)services?.property('property:registry',view,async unit=>{await action('housing',{unit});render()})}
        render()
      }else if(front.id==='office')void services?.open('advisor')
      else {
        const render=(receipt='')=>{
          if(view?.interaction===service)streetCounter(dialog,front,view,receipt,async(op,item)=>{
            await action('arcade',{operation:op,item,sequence:view!.arcade!.sequence})
            render(op==='treatment'?'Treatment complete.':'Added to your inventory.')
          },to=>action('teleport',{to}))
        }
        render()
      }
      return
    }
    if(service.startsWith('property:')){
      stage?.lock(true)
      const render=()=>{if(view)services?.property(service,view,async unit=>{await action('housing',{unit});render()})}
      render()
      return
    }
    if(service==='bar'){
      services?.bar(next.bar?.name===next.you.name?next.bar:undefined,(drink,id)=>action('bar',{drink,id}),()=>action('stand-scenery',{}),next.you.barSeat!==undefined)
      return
    }
    if(service.startsWith('kfc:'))restaurant?.open(service)
    else void services?.open(service,next.you.zone.startsWith('floor:')?next.you.zone.slice(6):undefined)
    stage?.lock(true)
  }else if(!service)shownService=''
}
async function presence(){
  const t=Date.now(),sent=stage&&{...stage.position}
  const response=await fetch('/api/world/presence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mapVersion,scene:true,world:view?.id,zone:view?.you.zone,slot:packUI.slot,sprint:stage?.sprinting,kitchenMotion:stage?.kitchenMotion,...(view?sent:{})}),signal:AbortSignal.timeout(5500)})
  if(!response.ok){
    if(response.status===412)unavailable('Meridian has a new map. Retry to load it.')
    if(response.status===401){closed=true;location.replace('/chess/login.html')}
    throw new Error('City connection lost')
  }
  accepted(await response.json() as WorldView,t,false,sent)
}
async function action(name:string,data:object){
  if(performing||closed)return
  performing=true
  updateSelection()
  try{
    await refreshing
    if(name==='use')await presence()
    if(closed)return
    const t=Date.now()
    accepted(await api<WorldView>('/world/'+name,{...data,mapVersion,scene:true}),t,name==='floor'&&(data as {symbol?:string}).symbol==='residences'||name==='use'&&(data as {target?:string}).target==='exchange-lobby'||name==='resort-floor'||name==='teleport'||name==='exit-cave')
    if(name==='stand'||name==='stand-scenery'||name==='teleport')stage?.resumeMouse()
  }catch(error){
    if(error instanceof ApiError&&error.status===412)unavailable('Meridian has a new map. Retry to load it.')
    else showError(error instanceof Error?error.message:'City action failed')
    throw error
  }
  finally{
    performing=false;updateSelection()
    const pending=closeWhenIdle;closeWhenIdle=undefined
    if(pending&&!dialog.open&&view?.interaction===pending.station)void action(pending.action,{station:pending.station}).catch(()=>{})
  }
}
function use(point?:WorldAction){
  if(view?.arcade?.custody){
    if(point?.id==='cell-table'&&view.arcade.custody.ends===null&&!puzzleDialog.open){
      const content=document.createElement('div')
      puzzleDialog.querySelector('[data-jigsaw-body]')!.replaceChildren(content)
      content.textContent='Loading puzzle…'
      puzzleDialog.showModal();syncControls()
      void jigsaw(content,view.arcade.custody.noRelease).catch(error=>{content.textContent=error instanceof Error?error.message:'Could not open puzzle.'})
    }
    return
  }
  if(view?.interaction?.startsWith('kfc:kitchen:')){
    void action('restaurant',{command:'leave-station'}).catch(()=>{});return
  }
  if(view?.you.homePose||view?.you.barSeat!==undefined||view?.you.boardSeat!==undefined){
    if(!dialog.open)void action('stand-scenery',{}).catch(()=>{});return
  }
  if(seated()||view?.you.lounge){void action('stand',{}).catch(()=>undefined);return}
  if(!point||dialog.open)return
  if(shownService===point.id)shownService=''
  void action('use',{target:point.id}).catch(()=>undefined)
}
puzzleDialog.querySelector<HTMLButtonElement>('[data-close-jigsaw]')!.onclick=()=>puzzleDialog.close()
puzzleDialog.onkeydown=event=>{
  if(event.key==='Escape'||event.key.toLowerCase()==='e'){
    event.preventDefault();event.stopPropagation()
    if(!event.repeat)puzzleDialog.close()
  }
}
puzzleDialog.onclose=()=>{
  puzzleDialog.querySelector('[data-jigsaw-body]')!.replaceChildren()
  syncControls()
  if(!closed){cast('world-canvas').focus();stage?.resumeMouse()}
}
host.querySelector<HTMLButtonElement>('[data-world-use]')!.onclick=()=>stage?.act()
dialog.addEventListener('close',()=>{
  updateBooking=undefined;updateArmory=undefined
  syncControls();if(!paused)stage?.resumeMouse()
  const station=view?.interaction
  if(!station||dialog.open)return
  const close=station.startsWith('resort:')?'close-resort':station==='food'||station.startsWith('fridge:')?'close-fridge':undefined
  if(!close)return
  if(performing)closeWhenIdle={action:close,station}
  else void action(close,{station}).catch(()=>{})
})
host.querySelector<HTMLButtonElement>('[data-city-camera]')!.onclick=()=>stage?.toggleCamera()
document.addEventListener('keydown',event=>{
  if(closed||puzzleDialog.open)return
  if(event.key==='Escape'){
    if(chatting){chatInput.blur();stage?.resumeMouse();event.preventDefault()}
    else if(!paused){showPause();event.preventDefault()}
    return
  }
  if((event.key==='/'||event.key.toLowerCase()==='t')&&!event.ctrlKey&&!event.metaKey&&!view?.arcade?.custody&&!dialog.open&&!paused&&
      !(event.target instanceof HTMLElement&&event.target.matches('input,textarea,select,[contenteditable]'))){
    event.preventDefault();chatInput.focus()
  }
})
window.addEventListener('pagehide',e=>{if(!e.persisted)closed=true})
async function start(){
  await initShell();const auth=await getSession()
  if(!auth.user){location.replace('/chess/login.html');return}
  services=new ResidentialServices(dialog,auth.user,symbol=>{
    if(closeAfterFloor)return
    closeAfterFloor=true
    void action('floor',{symbol}).then(()=>services?.close()).catch(()=>undefined).finally(()=>closeAfterFloor=false)
  },updateWalletBalance,()=>void floorScreens(view?.you.zone??''))
  resortUI=new ResortUI(dialog,action)
  restaurant=new RestaurantUI(dialog,cast('world-kfc-hud'),(command,data)=>action('restaurant',{command,...data}))
  const {CityStage}=await import('./stage.ts')
  let pollTimer:number|undefined,urgent=false,lastPresence=0
  function wakePresence(){
    if(closed||document.hidden)return
    urgent=true
    if(pollTimer!==undefined&&!refreshing&&!performing){
      clearTimeout(pollTimer)
      pollTimer=window.setTimeout(beat,Math.max(35,lastPresence+95-performance.now()))
    }
  }
  stage=new CityStage(cast('world-canvas'),host,use,showPause,wakePresence,()=>{
    if(connection.textContent===graphicsMessage)connection.hidden=true
  },()=>unavailable('The city could not render its 3D scene. Retry to rejoin the city.'))
  const release=await fetch('/api/world/map-version',{cache:'no-store'})
  if(!release.ok||(await release.json()).version!==mapVersion)throw Error('Meridian is updating. Retry when the city and its map are on the same version.')
  const url=new URL(location.href),go=url.searchParams.get('go')??''
  if(!auth.custody&&url.searchParams.get('exit')==='cave')await action('exit-cave',{})
  else if(!auth.custody&&like(go))await action('teleport',{to:go})
  else await presence()
  history.replaceState(null,'',url.pathname)
  async function beat(){
    pollTimer=undefined
    if(closed)return
    if(!performing){
      urgent=false
      lastPresence=performance.now()
      refreshing=presence().catch(()=>{connection.textContent='Reconnecting…';connection.hidden=false})
      await refreshing;refreshing=undefined
    }
    const you=view?.you
    const nearby=you&&view?.players.some(other=>Math.hypot(other.x-you.x,other.z-you.z)<30)
    const delay=document.hidden?3000:urgent?70:stage?.moving?180:nearby?315:view?.players.length?430:you?.chair?480:780
    pollTimer=window.setTimeout(beat,delay)
  }
  document.addEventListener('visibilitychange',wakePresence)
  void beat();window.setInterval(tableStatus,160)
  window.setInterval(()=>{if(!closed&&!document.hidden&&view&&/^floor:(CAS|BNK|LOT|PRI)$/.test(view.you.zone))void floorScreens(view.you.zone)},12_000)
}
document.addEventListener('click',event=>{
  const link=(event.target as Element).closest<HTMLAnchorElement>('a')
  if(!link||!view||performing||event.defaultPrevented||event instanceof MouseEvent&&(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey))return
  const url=new URL(link.href)
  if(url.origin!==location.origin||url.pathname!=='/chess/world.html')return
  const to=url.searchParams.get('go')??''
  if(!like(to))return
  event.preventDefault()
  if(view.arcade?.custody)return
  services?.close()
  if(paused){paused=false;pause.hidden=true;syncControls()}
  void action('teleport',{to}).catch(()=>undefined)
})
function unavailable(message:string){
  closed=true;stage?.stop()
  if(puzzleDialog.open)puzzleDialog.close()
  if(dialog.open)dialog.close()
  const notice=cast('world-unavailable')
  notice.querySelector('p')!.textContent=message
  host.dataset.unavailable='true';notice.hidden=false
}
cast('world-canvas').addEventListener('webglcontextlost',event=>{
  event.preventDefault();unavailable('The browser lost its 3D graphics connection. Retry to rejoin the city.')
})
void start().catch(error=>unavailable(error instanceof Error?error.message:'The city could not open.'))
