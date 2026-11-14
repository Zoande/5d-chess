import {api,getSession,initShell,renderAccount} from './shell.ts'
import {type Profile} from './account-model.ts'
import {type Collectible,type ItemType,type OwnedItem,type Listing,ITEMS,CRATES,RARITIES,RARITY_COLORS,itemById,duplicateRefund} from './collection.ts'
import {type Kind,type Player,KINDS,PLAYERS} from './model.ts'
import {avatarArt} from './cosmetic-art.ts'
import {designFor} from './skin-designs.ts'
import {COLORS,NAMES,pieceIcon,skinSetIcon} from './art.ts'
import {type Economy,type RewardReply,requestId,itemArt,itemCard,chestHTML,oddsHTML,countdown,revealDrop} from './rewards.ts'
import {icon} from './icons.ts'
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const message=(id:string,text:string)=>{el(id).textContent=text;el(id).hidden=!text}
let state:Economy,profile:Profile,listings:Listing[]=[],type:ItemType='skin',tier=0,slot:Kind|'icon'='K',color:Player='red',preview='default',busy=false,clockOffset=0,featureType='all'
const purchaseKeys=new Map<string,string>()
const submit=async(path:string,data:Record<string,unknown>,key?:string)=>{
 if(busy)throw new Error('Please wait for the current action')
 busy=true;message('collection-error','')
 try{
  if(key){if(!purchaseKeys.has(key))purchaseKeys.set(key,requestId());data.requestId=purchaseKeys.get(key)}
  const reply=await api<RewardReply>(path,data);if(key)purchaseKeys.delete(key)
  state=reply;profile=reply.profile;clockOffset=reply.now-Date.now();renderAccount(profile);render();return reply
 }finally{busy=false}
}
const report=(cause:unknown)=>message('collection-error',cause instanceof Error?cause.message:'Could not complete this action')
function transaction(title:string,body:string,confirm:string,action:(dialog:HTMLDialogElement)=>Promise<void>){
 const dialog=document.createElement('dialog');dialog.className='transaction-dialog'
 dialog.innerHTML=`<h2>${title}</h2>${body}<p class="form-error" role="alert" hidden></p><div class="actions"><button class="button" type="button" data-cancel>Cancel</button><button class="button primary" type="button" data-confirm>${confirm}</button></div>`
 document.body.append(dialog);dialog.showModal();dialog.onclose=()=>dialog.remove()
 dialog.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick=()=>dialog.close()
 dialog.querySelector<HTMLButtonElement>('[data-confirm]')!.onclick=async()=>{
  const button=dialog.querySelector<HTMLButtonElement>('[data-confirm]')!;button.disabled=true
  try{await action(dialog);dialog.close()}catch(cause){const error=dialog.querySelector<HTMLElement>('.form-error')!;error.textContent=cause instanceof Error?cause.message:'Request failed';error.hidden=false;button.disabled=false}
 }
 return dialog
}
function inspectItem(item:Collectible){
 const dialog=document.createElement('dialog');dialog.className='transaction-dialog inspect-dialog';dialog.style.setProperty('--rarity',RARITY_COLORS[item.rarity])
 const draw=(player:Player)=>{
 dialog.innerHTML=`<div class="inspect-art">${item.type==='skin'?skinSetIcon(item.id,player):avatarArt(item.id)}</div><small class="rarity-label">${item.rarity} · ${item.type==='skin'?'FULL SKIN SET':'PLAYER ICON'}</small><h2>${item.name}</h2><p>${item.description}</p>${item.type==='skin'?`<div class="inspect-roster">${KINDS.map(k=>pieceIcon(k,player,48,item.id)).join('')}</div><div class="preview-colors" aria-label="Inspect faction color">${PLAYERS.map(p=>`<button type="button" data-variant="${p}" style="--faction:${COLORS[p]}" aria-label="Inspect ${p} variant" aria-pressed="${p===player}"></button>`).join('')}</div><p class="inspect-note">All six pieces. All four colors. No gameplay bonuses.</p>`:''}<button type="button" class="button" data-close>Close preview</button>`
 dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>dialog.close();dialog.querySelectorAll<HTMLButtonElement>('[data-variant]').forEach(b=>b.onclick=()=>draw(b.dataset.variant as Player))
 };draw(color);document.body.append(dialog);dialog.showModal();dialog.onclose=()=>dialog.remove()
}
function renderShop(){
 document.querySelectorAll<HTMLElement>('[data-crate-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crateType===type)))
 const crates=CRATES.filter(c=>c.type===type),crate=crates[tier]
 el('starter-note').hidden=state.wallet.inventory.length>0
 el('crate-preview').innerHTML=`<span class="crate-hero-label">${['THE FIRST FIND','A FINER COLLECTION','THE ROYAL RESERVE'][tier]}</span>${chestHTML(tier)}<span class="crate-hero-footer">${type==='skin'?'40 SKIN SETS':'20 PLAYER ICONS'} · 6 RARITIES</span>`
 el('crate-tiers').innerHTML=crates.map((c,i)=>`<button type="button" data-tier="${i}" aria-pressed="${i===tier}"><strong>${['Bronze','Silver','Gold'][i]}</strong><small>${icon('coin')}${c.price.toLocaleString()}</small></button>`).join('')
 el('crate-tiers').querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.onclick=()=>{tier=Number(b.dataset.tier);renderShop()})
 el('crate-description').textContent=`${crate.name} · ${type==='skin'?'A full skin set for all six pieces, with four faction colors. Equip each piece separately.':'One collectible player icon for your profile.'} All rewards are cosmetic.`
 el('crate-odds').innerHTML=oddsHTML(tier)
 el('crate-catalog-title').textContent=`Explore all ${ITEMS.filter(i=>i.type===type).length} possible rewards`
 el('crate-catalog').innerHTML=ITEMS.filter(i=>i.type===type).map(i=>`<button type="button" data-inspect="${i.id}" style="--rarity:${RARITY_COLORS[i.rarity]}" title="${i.rarity}">${itemArt(i,40)}${i.name}</button>`).join('')
 const button=el<HTMLButtonElement>('buy-crate');button.innerHTML=`${icon('coin')} Open crate · ${crate.price.toLocaleString()}`;button.disabled=state.wallet.coins<crate.price
 button.title=button.disabled?`Earn ${crate.price-state.wallet.coins} more coins in online games or your daily spin`:''
 button.onclick=()=>transaction(`Open ${crate.name.toLowerCase()}?`,`<div class="item-picture">${chestHTML(tier)}</div><p>Spend <strong>${crate.price.toLocaleString()} coins</strong> for one random ${type}. Duplicates are possible.</p><div class="odds-grid">${oddsHTML(tier)}</div>`,'Buy & open',async dialog=>{
  const data=await submit('/economy/crate',{crate:crate.id},'crate:'+crate.id);dialog.close();await revealDrop(data.drop!,'crate',crate.tier,next=>{state=next;render()})
 })
 document.querySelectorAll<HTMLElement>('[data-feature-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.featureType===featureType)))
 el('featured-items').innerHTML=state.featured.filter(id=>featureType==='all'||itemById(id)?.type===featureType).map(id=>{
  const item=itemById(id)!,owned=state.wallet.inventory.some(o=>o.itemId===id)
  return `<article class="featured-card" style="--rarity:${RARITY_COLORS[item.rarity]}">${owned?'<span class="owned-label">OWNED</span>':''}<button type="button" class="feature-art-button" data-inspect="${id}" aria-label="Preview ${item.name}"><span class="item-picture">${item.type==='skin'?skinSetIcon(item.id):avatarArt(item.id)}</span></button><small class="rarity-label">${item.rarity} · ${item.type==='skin'?'SKIN SET':'ICON'}</small><strong>${item.name}</strong><p class="featured-description">${item.description}</p><button type="button" class="button" data-buy="${id}" ${state.wallet.coins<item.price?'disabled':''}>Buy · ${icon('coin')}${item.price.toLocaleString()}</button></article>`
 }).join('')
 document.querySelectorAll<HTMLButtonElement>('[data-inspect]').forEach(b=>b.onclick=()=>inspectItem(itemById(b.dataset.inspect!)!))
 el('featured-items').querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(b=>b.onclick=()=>{
  const item=itemById(b.dataset.buy!)!
  transaction(`Buy ${item.name}?`,`<div class="item-picture">${itemArt(item)}</div><p>Spend <strong>${item.price.toLocaleString()} coins</strong> for this exact item. ${state.wallet.inventory.some(o=>o.itemId===item.id)?'You already own it; this purchases an extra tradable copy.':'It will be added to your inventory.'}</p>`,'Buy item',async()=>{await submit('/economy/buy',{itemId:item.id},'buy:'+item.id);message('collection-status',`${item.name} added to your inventory.`)})
 })
}
function selectedItem(){return itemById(state.wallet.inventory.find(o=>o.uid===preview)?.itemId??'')}
function renderPreview(){
 const item=selectedItem(),equipped=slot==='icon'?state.wallet.loadout.icon:state.wallet.loadout.pieces[slot]??'default',selectedId=item?.id??'default'
 const owned=state.wallet.inventory.find(o=>o.uid===preview),usable=!owned||!owned.listed&&!owned.pending,design=designFor(item),setCount=KINDS.filter(k=>(state.wallet.loadout.pieces[k]??'default')===selectedId).length
 el('equipment-preview').style.setProperty('--rarity',item?RARITY_COLORS[item.rarity]:'#a9c486')
 el('equipment-preview').innerHTML=`<div class="preview-canvas"><span class="preview-stage-label">${slot==='icon'?'PLAYER IDENTITY':NAMES[slot].toUpperCase()+' · '+color.toUpperCase()}</span>${slot==='icon'?avatarArt(selectedId):pieceIcon(slot,color,210,selectedId)}<span class="preview-plinth"></span></div>${slot!=='icon'?`<div class="preview-colors" role="group" aria-label="Preview faction color">${PLAYERS.map(p=>`<button type="button" data-color="${p}" style="--faction:${COLORS[p]}" aria-label="${p} variant" aria-pressed="${p===color}"></button>`).join('')}</div>`:'<div style="height:20px"></div>'}<small class="rarity-label">${item?.rarity??'STARTER'}</small><h2>${item?.name??(slot==='icon'?'Player':'Classic pieces')}</h2><p>${item?.description??'The original look. Always available.'}</p>${slot!=='icon'?`<div class="preview-set-roster" aria-label="Full set preview">${KINDS.map(k=>`<span title="${NAMES[k]}">${pieceIcon(k,color,40,selectedId)}</span>`).join('')}</div><small class="material-label">${design?design.material+' · '+design.family+' silhouette':'Classic silhouette'} · ${setCount}/6 equipped</small>`:''}<div class="equip-actions"><button class="button primary" id="equip-preview" type="button" ${!usable||equipped===selectedId?'disabled':''}>${equipped===selectedId?'Equipped':!usable?owned?.pending?'Keep or refund below':'Listed on market':`Equip ${slot==='icon'?'icon':NAMES[slot].toLowerCase()}`}</button>${slot!=='icon'?`<button class="button" id="equip-set" type="button" ${!usable||setCount===6?'disabled':''}>${setCount===6?'Full set equipped':'Equip full set'}</button>`:''}</div><p class="preview-note">${item?`${state.wallet.inventory.filter(o=>o.itemId===item.id).length} owned ${state.wallet.inventory.filter(o=>o.itemId===item.id).length===1?'copy':'copies'} · `:''}${slot==='icon'?'Shown on your profile and leaderboard.':'All four colors included. Cosmetic only.'}</p>`
 el('equipment-preview').querySelectorAll<HTMLButtonElement>('[data-color]').forEach(b=>b.onclick=()=>{color=b.dataset.color as Player;renderInventory()})
 el('equip-preview').onclick=()=>void submit('/economy/equip',{slot,uid:preview}).then(()=>message('collection-status','Equipment updated.')).catch(report)
 if(slot!=='icon')el('equip-set').onclick=()=>void submit('/economy/equip-set',{uid:preview}).then(()=>message('collection-status','Full set equipped.')).catch(report)
 el('inventory-grid').querySelectorAll<HTMLElement>('[data-preview]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preview===preview)))
}
function manageCopies(itemId:string){
 const item=itemById(itemId)!,dialog=document.createElement('dialog');dialog.className='transaction-dialog copies-dialog'
 const draw=()=>{
 const copies=state.wallet.inventory.filter(o=>o.itemId===itemId).sort((a,b)=>Number(b.pending)-Number(a.pending)||b.acquired-a.acquired)
 dialog.innerHTML=`<h2>${item.name}</h2><p>${copies.length} individual ${copies.length===1?'copy':'copies'} · Your equipped style stays available while you keep a usable copy.</p><div class="copy-list">${copies.map(o=>`<div class="copy-row"><div><strong>${o.pending?'Duplicate reward':o.listed?'On the market':'Available'}</strong><small>${new Date(o.acquired).toLocaleDateString('en-GB')} · ${o.uid.slice(-6)}</small></div><div>${o.pending?`<button class="button" data-keep="${o.uid}">Keep copy</button><button class="button" data-refund="${o.uid}">Refund ${duplicateRefund(item)}</button>`:o.listed?`<button class="button" data-cancel-copy="${o.listed}">Cancel listing</button>`:`<button class="button" data-sell-copy="${o.uid}">Sell copy</button>`}</div></div>`).join('')}</div><button class="button" data-close>Done</button>`
 dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>dialog.close()
 for(const key of ['keep','refund'])dialog.querySelectorAll<HTMLButtonElement>(`[data-${key}]`).forEach(b=>b.onclick=()=>void submit('/economy/duplicate',{uid:b.dataset[key],refund:key==='refund'}).then(draw).catch(report))
 dialog.querySelectorAll<HTMLButtonElement>('[data-sell-copy]').forEach(b=>b.onclick=()=>{dialog.close();sell(b.dataset.sellCopy!)})
 dialog.querySelectorAll<HTMLButtonElement>('[data-cancel-copy]').forEach(b=>b.onclick=()=>{dialog.close();cancel(b.dataset.cancelCopy!)})
 };draw();document.body.append(dialog);dialog.showModal();dialog.onclose=()=>dialog.remove()
}
function renderInventory(){
 const equipped=slot==='icon'?state.wallet.loadout.icon:state.wallet.loadout.pieces[slot]
 const chosen=state.wallet.inventory.find(o=>o.uid===preview)
 if(chosen&&(chosen.listed||chosen.pending)){const usable=state.wallet.inventory.find(o=>o.itemId===chosen.itemId&&!o.listed&&!o.pending);if(usable)preview=usable.uid}
 if(preview!=='default'&&!state.wallet.inventory.some(o=>o.uid===preview))preview='default'
 const rarity=el<HTMLSelectElement>('inventory-rarity').value,search=el<HTMLInputElement>('inventory-search').value.trim().toLowerCase(),status=el<HTMLSelectElement>('inventory-status').value
 const grouped=new Map<string,OwnedItem[]>()
 for(const owned of state.wallet.inventory){const item=itemById(owned.itemId)!;if(item.type!==(slot==='icon'?'icon':'skin'))continue;const group=grouped.get(item.id)??[];group.push(owned);grouped.set(item.id,group)}
 const groups=[...grouped.entries()].filter(([id,copies])=>{const item=itemById(id)!;return (rarity==='all'||item.rarity===rarity)&&(!search||item.name.toLowerCase().includes(search))&&(status==='all'||status==='duplicates'&&copies.length>1||status==='attention'&&copies.some(o=>o.pending||o.listed))}).sort(([a,ac],[b,bc])=>Number(bc.some(o=>o.pending))-Number(ac.some(o=>o.pending))||RARITIES.indexOf(itemById(b)!.rarity)-RARITIES.indexOf(itemById(a)!.rarity)||itemById(a)!.name.localeCompare(itemById(b)!.name))
 el('inventory-summary').textContent=`${new Set(state.wallet.inventory.map(o=>o.itemId)).size} / ${ITEMS.length} collected · ${state.wallet.inventory.length} copies · ${state.wallet.inventory.filter(o=>o.listed).length} listed`
 el('armory-title').textContent=slot==='icon'?'Player icons':`${NAMES[slot]} skins`;el('armory-count').textContent=`${groups.length} designs`
 el('equipment-slots').innerHTML=[...KINDS,'icon'].map(k=>`<button type="button" data-slot="${k}" aria-pressed="${slot===k}">${k==='icon'?avatarArt(state.wallet.loadout.icon):pieceIcon(k as Kind,color,32,state.wallet.loadout.pieces[k as Kind]??'default')}<span>${k==='icon'?'Player icon':NAMES[k as Kind]}</span></button>`).join('')
 el('equipment-slots').querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(b=>b.onclick=()=>{slot=b.dataset.slot as typeof slot;const id=slot==='icon'?state.wallet.loadout.icon:state.wallet.loadout.pieces[slot];preview=state.wallet.inventory.find(o=>o.itemId===id&&!o.listed&&!o.pending)?.uid??'default';renderInventory()})
 el('inventory-grid').innerHTML=`<article class="owned-card" style="--rarity:#a9c486"><button class="preview-item" type="button" data-preview="default"><span class="item-picture">${slot==='icon'?avatarArt('default'):pieceIcon(slot,color,64,'default')}</span><strong>${slot==='icon'?'Player':'Classic pieces'}</strong></button><small class="copy-tag">Always available${!equipped||equipped==='default'?' · Equipped':''}</small></article>`+groups.map(([id,copies])=>{
 const item=itemById(id)!,available=copies.find(o=>!o.pending&&!o.listed),pending=copies.find(o=>o.pending),owned=available??pending??copies[0],countLabel=copies.length>1?`${copies.length} copies`:'1 copy'
 return `<article class="owned-card ${equipped===id?'equipped-card':''}" style="--rarity:${RARITY_COLORS[item.rarity]}"><button class="preview-item" type="button" data-preview="${owned.uid}">${itemCard(item,slot==='icon'?'N':slot,color)}</button><small class="copy-tag ${pending?'pending':''}">${pending?'Duplicate choice waiting':equipped===id?'✓ Equipped · '+countLabel:countLabel}</small>${pending?`<button class="button" type="button" data-manage="${id}">Choose reward</button>`:available?`<button class="button" type="button" data-sell="${available.uid}">Sell ${copies.length>1?'a copy':'copy'}</button>`:`<small class="copy-tag">${copies.length} listed</small>`}${copies.length>1||copies.some(o=>o.listed)?`<button class="manage-copy-link" type="button" data-manage="${id}">Manage copies</button>`:''}</article>`
 }).join('')
 if(!groups.length&&grouped.size)el('inventory-grid').insertAdjacentHTML('beforeend','<p class="inventory-empty">No designs match these filters.</p>')
 if(!grouped.size)el('inventory-grid').insertAdjacentHTML('beforeend',`<div class="inventory-empty"><strong>Your next signature piece is waiting.</strong><p>Collect a ${slot==='icon'?'player icon':'skin set'} from a crate, the weekly shop or your daily spin.</p><a class="button" href="#shop">Explore the shop</a></div>`)
 el('inventory-grid').querySelectorAll<HTMLButtonElement>('[data-preview]').forEach(b=>b.onclick=()=>{preview=b.dataset.preview!;renderPreview()})
 el('inventory-grid').querySelectorAll<HTMLButtonElement>('[data-manage]').forEach(b=>b.onclick=()=>manageCopies(b.dataset.manage!))
 el('inventory-grid').querySelectorAll<HTMLButtonElement>('[data-sell]').forEach(b=>b.onclick=()=>sell(b.dataset.sell!))
 renderPreview()
}
function sell(uid:string){
 const owned=state.wallet.inventory.find(o=>o.uid===uid)!,item=itemById(owned.itemId)!
 const dialog=transaction(`Sell ${item.name}`,`<div class="item-picture">${itemArt(item)}</div><label>Price in coins<input id="listing-price" type="number" inputmode="numeric" min="1" max="100000000" step="1" required value="${item.price}"></label><p>This exact copy will be locked while listed. If it is your last available copy, it will be unequipped. You can cancel an unsold listing at any time.</p>`,'List for sale',async d=>{
  const input=d.querySelector<HTMLInputElement>('input')!;if(!input.reportValidity())throw new Error('Enter a whole positive coin price')
  await submit('/economy/list',{uid,price:Number(input.value)});await loadMarket();message('collection-status','Your copy is listed on the market.')
 });dialog.querySelector('input')?.focus()
}
function cancel(id:string){transaction('Cancel this listing?','<p>Your copy will return to your available inventory.</p>','Cancel listing',async()=>{await submit('/economy/cancel',{id});await loadMarket();message('collection-status','Listing cancelled.')})}
function renderMarket(){
 const search=el<HTMLInputElement>('market-search').value.trim().toLowerCase(),typeFilter=el<HTMLSelectElement>('market-type').value,rarity=el<HTMLSelectElement>('market-rarity').value,mine=el<HTMLSelectElement>('market-owner').value==='mine',sort=el<HTMLSelectElement>('market-sort').value
 const filtered=listings.filter(l=>{const i=itemById(l.itemId)!;return (typeFilter==='all'||i.type===typeFilter)&&(rarity==='all'||i.rarity===rarity)&&(!mine||l.seller===profile.name)&&(!search||i.name.toLowerCase().includes(search))}).sort((a,b)=>sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:b.created-a.created)
 el('market-grid').innerHTML=filtered.length?filtered.map(l=>{
  const item=itemById(l.itemId)!,own=l.seller===profile.name
  return `<article class="market-card" style="--rarity:${RARITY_COLORS[item.rarity]}">${itemCard(item)}<small class="seller">${own?'Your listing':'Sold by '+escape(l.seller)}</small><strong class="coin-price">${icon('coin')}${l.price.toLocaleString()}</strong><button class="button" type="button" data-listing="${l.id}" ${!own&&l.price>state.wallet.coins?'disabled':''}>${own?'Cancel listing':'Buy copy'}</button></article>`
 }).join(''):'<p class="market-empty">No listings here yet.<br>List a copy from your inventory, or try another filter.</p>'
 el('market-grid').querySelectorAll<HTMLButtonElement>('[data-listing]').forEach(b=>b.onclick=()=>{
  const listing=listings.find(l=>l.id===b.dataset.listing)!;if(listing.seller===profile.name){cancel(listing.id);return}
  const item=itemById(listing.itemId)!
  transaction(`Buy ${item.name}?`,`<div class="item-picture">${itemArt(item)}</div><p>Pay <strong>${listing.price.toLocaleString()} coins</strong> to ${escape(listing.seller)} for this exact copy.</p>`,'Buy copy',async()=>{await submit('/economy/market-buy',{id:listing.id});await loadMarket();message('collection-status',`${item.name} is now in your inventory.`)})
 })
}
async function loadMarket(){listings=(await api<{listings:Listing[]}>('/market')).listings;renderMarket()}
function render(){renderShop();renderInventory();renderMarket()}
function route(){
 const view=['shop','inventory','market'].includes(location.hash.slice(1))?location.hash.slice(1):'shop'
 document.querySelectorAll<HTMLElement>('.collection-view').forEach(v=>v.hidden=v.id!==view)
 document.querySelectorAll<HTMLAnchorElement>('.collection-tabs a').forEach(a=>{if(a.hash==='#'+view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')})
 el('collection-title').textContent=view==='shop'?'Shop':view==='inventory'?'Inventory':'Market'
 el('collection-intro').textContent=view==='shop'?'Find your next signature piece.':view==='inventory'?'Your collection. Your pieces. Your style.':'A new home for every extra copy.'
 document.title=`${el('collection-title').textContent} · 5D Chess`
 if(view==='market')void loadMarket().catch(report)
}
async function init(){
 await initShell();const session=await getSession();if(!session.user){location.replace('/chess/login.html');return}
 profile=session.profile!;state=await api<Economy>('/economy');clockOffset=state.now-Date.now()
 preview=state.wallet.inventory.find(o=>o.itemId===state.wallet.loadout.pieces.K&&!o.listed&&!o.pending)?.uid??'default'
 for(const id of ['inventory-rarity','market-rarity'])for(const rarity of RARITIES){const option=document.createElement('option');option.value=rarity;option.textContent=rarity[0].toUpperCase()+rarity.slice(1);el(id).append(option)}
 document.querySelectorAll<HTMLButtonElement>('[data-crate-type]').forEach(b=>b.onclick=()=>{type=b.dataset.crateType as ItemType;renderShop()})
 el('inventory-rarity').onchange=renderInventory
 el('inventory-status').onchange=renderInventory
 el('inventory-search').oninput=renderInventory
 document.querySelectorAll<HTMLButtonElement>('[data-feature-type]').forEach(b=>b.onclick=()=>{featureType=b.dataset.featureType!;renderShop()})
 for(const id of ['market-search','market-type','market-rarity','market-sort','market-owner'])el(id).oninput=renderMarket
 el('market-refresh').onclick=()=>void loadMarket().catch(report)
 window.addEventListener('hashchange',()=>{route();window.scrollTo({top:0})})
 render();route()
 const tick=()=>el('rotation-timer').textContent=countdown(state.rotation,Date.now()+clockOffset)
 tick();window.setInterval(tick,1000)
 window.setInterval(()=>{if(document.visibilityState!=='visible'||busy||document.querySelector('dialog[open]'))return;void Promise.all([api<Economy>('/economy'),api<{listings:Listing[]}>('/market')]).then(([data,market])=>{state=data;listings=market.listings;profile={...profile,coins:data.wallet.coins,loadout:data.wallet.loadout};renderAccount(profile);render()}).catch(report)},15000)
}
void init().catch(report)
