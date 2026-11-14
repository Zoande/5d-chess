import {api,getSession,initShell,renderAccount} from './shell.ts'
import {type Profile} from './account-model.ts'
import {type Collectible,type ItemType,type OwnedItem,type Listing,ITEMS,CRATES,RARITIES,RARITY_COLORS,itemById,duplicateRefund} from './collection.ts'
import {type Kind,type Player,KINDS,PLAYERS} from './model.ts'
import {avatarArt} from './cosmetic-art.ts'
import {COLORS,NAMES,pieceIcon} from './art.ts'
import {type Economy,type RewardReply,requestId,itemArt,itemCard,chestHTML,oddsHTML,countdown,revealDrop} from './rewards.ts'
import {icon} from './icons.ts'
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const message=(id:string,text:string)=>{el(id).textContent=text;el(id).hidden=!text}
let state:Economy,profile:Profile,listings:Listing[]=[],type:ItemType='skin',tier=0,slot:Kind|'icon'='K',color:Player='red',preview='default',busy=false,clockOffset=0
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
function renderShop(){
 document.querySelectorAll<HTMLElement>('[data-crate-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crateType===type)))
 const crates=CRATES.filter(c=>c.type===type),crate=crates[tier]
 el('crate-preview').innerHTML=chestHTML(tier)
 el('crate-tiers').innerHTML=crates.map((c,i)=>`<button type="button" data-tier="${i}" aria-pressed="${i===tier}"><strong>${['Bronze','Silver','Gold'][i]}</strong><small>${icon('coin')}${c.price.toLocaleString()}</small></button>`).join('')
 el('crate-tiers').querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.onclick=()=>{tier=Number(b.dataset.tier);renderShop()})
 el('crate-description').textContent=`${crate.name} · ${type==='skin'?'A full skin set for all six pieces, with four faction colors. Equip each piece separately.':'One collectible player icon for your profile.'} All rewards are cosmetic.`
 el('crate-odds').innerHTML=oddsHTML(tier)
 el('crate-catalog').innerHTML=ITEMS.filter(i=>i.type===type).map(i=>`<div style="--rarity:${RARITY_COLORS[i.rarity]}" title="${i.rarity}">${itemArt(i,40)}${i.name}</div>`).join('')
 const button=el<HTMLButtonElement>('buy-crate');button.innerHTML=`${icon('coin')} Open crate · ${crate.price.toLocaleString()}`;button.disabled=state.wallet.coins<crate.price
 button.title=button.disabled?`Earn ${crate.price-state.wallet.coins} more coins in online games or your daily spin`:''
 button.onclick=()=>transaction(`Open ${crate.name.toLowerCase()}?`,`<div class="item-picture">${chestHTML(tier)}</div><p>Spend <strong>${crate.price.toLocaleString()} coins</strong> for one random ${type}. Duplicates are possible.</p><div class="odds-grid">${oddsHTML(tier)}</div>`,'Buy & open',async dialog=>{
  const data=await submit('/economy/crate',{crate:crate.id},'crate:'+crate.id);dialog.close();await revealDrop(data.drop!,'crate',crate.tier,next=>{state=next;render()})
 })
 el('featured-items').innerHTML=state.featured.map(id=>{
  const item=itemById(id)!,owned=state.wallet.inventory.some(o=>o.itemId===id)
  return `<article class="featured-card" style="--rarity:${RARITY_COLORS[item.rarity]}">${owned?'<span class="owned-label">OWNED</span>':''}${itemCard(item)}<button type="button" class="button" data-buy="${id}" ${state.wallet.coins<item.price?'disabled':''}>${icon('coin')}${item.price.toLocaleString()}</button></article>`
 }).join('')
 el('featured-items').querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(b=>b.onclick=()=>{
  const item=itemById(b.dataset.buy!)!
  transaction(`Buy ${item.name}?`,`<div class="item-picture">${itemArt(item)}</div><p>Spend <strong>${item.price.toLocaleString()} coins</strong> for this exact item. ${state.wallet.inventory.some(o=>o.itemId===item.id)?'You already own it; this purchases an extra tradable copy.':'It will be added to your inventory.'}</p>`,'Buy item',async()=>{await submit('/economy/buy',{itemId:item.id},'buy:'+item.id);message('collection-status',`${item.name} added to your inventory.`)})
 })
}
function selectedItem(){return itemById(state.wallet.inventory.find(o=>o.uid===preview)?.itemId??'')}
function renderPreview(){
 const item=selectedItem(),equipped=slot==='icon'?state.wallet.loadout.icon:state.wallet.loadout.pieces[slot]??'default',selectedId=item?.id??'default'
 const owned=state.wallet.inventory.find(o=>o.uid===preview),usable=!owned||!owned.listed&&!owned.pending
 el('equipment-preview').style.setProperty('--rarity',item?RARITY_COLORS[item.rarity]:'#a9c486')
 el('equipment-preview').innerHTML=`<div class="preview-canvas">${slot==='icon'?avatarArt(selectedId):pieceIcon(slot,color,170,selectedId)}</div>${slot!=='icon'?`<div class="preview-colors" role="group" aria-label="Preview faction color">${PLAYERS.map(p=>`<button type="button" data-color="${p}" style="--faction:${COLORS[p]}" aria-label="${p} variant" aria-pressed="${p===color}"></button>`).join('')}</div>`:'<div style="height:20px"></div>'}<small class="rarity-label">${item?.rarity??'STARTER'}</small><h2>${item?.name??(slot==='icon'?'Player':'Classic pieces')}</h2><p>${item?.description??'The original look. Always available.'}</p><button class="button primary" id="equip-preview" type="button" ${!usable||equipped===selectedId?'disabled':''}>${equipped===selectedId?'Equipped':!usable?owned?.pending?'Choose keep or refund':'Listed on market':`Equip ${slot==='icon'?'icon':NAMES[slot].toLowerCase()}`}</button><p class="preview-note">${item?`${state.wallet.inventory.filter(o=>o.itemId===item.id).length} owned ${state.wallet.inventory.filter(o=>o.itemId===item.id).length===1?'copy':'copies'} · `:''}${slot==='icon'?'Shown on your profile and leaderboard.':'All four faction variants included. Cosmetic only: movement and strength stay the same.'}</p>`
 el('equipment-preview').querySelectorAll<HTMLButtonElement>('[data-color]').forEach(b=>b.onclick=()=>{color=b.dataset.color as Player;renderPreview()})
 el('equip-preview').onclick=()=>void submit('/economy/equip',{slot,uid:preview}).then(()=>message('collection-status','Equipment updated.')).catch(report)
}
function renderInventory(){
 const equipped=slot==='icon'?state.wallet.loadout.icon:state.wallet.loadout.pieces[slot]
 if(preview!=='default'&&!state.wallet.inventory.some(o=>o.uid===preview))preview='default'
 const rarity=el<HTMLSelectElement>('inventory-rarity').value
 const items=state.wallet.inventory.filter(o=>itemById(o.itemId)?.type===(slot==='icon'?'icon':'skin')&&(rarity==='all'||itemById(o.itemId)?.rarity===rarity)).sort((a,b)=>Number(b.pending)-Number(a.pending)||b.acquired-a.acquired)
 el('inventory-summary').textContent=`${new Set(state.wallet.inventory.map(o=>o.itemId)).size} / 40 collected · ${state.wallet.inventory.length} copies · ${state.wallet.inventory.filter(o=>o.listed).length} listed`
 el('armory-title').textContent=slot==='icon'?'Player icons':`${NAMES[slot]} skins`
 el('equipment-slots').innerHTML=[...KINDS,'icon'].map(k=>`<button type="button" data-slot="${k}" aria-pressed="${slot===k}">${k==='icon'?avatarArt(state.wallet.loadout.icon):pieceIcon(k as Kind,color,32,state.wallet.loadout.pieces[k as Kind]??'default')}<span>${k==='icon'?'Player icon':NAMES[k as Kind]}</span></button>`).join('')
 el('equipment-slots').querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(b=>b.onclick=()=>{
  slot=b.dataset.slot as typeof slot
  const id=slot==='icon'?state.wallet.loadout.icon:state.wallet.loadout.pieces[slot]
  preview=state.wallet.inventory.find(o=>o.itemId===id&&!o.listed&&!o.pending)?.uid??'default';renderInventory()
 })
 el('inventory-grid').innerHTML=`<article class="owned-card" style="--rarity:#a9c486"><button class="preview-item" type="button" data-preview="default"><span class="item-picture">${slot==='icon'?avatarArt('default'):pieceIcon(slot,color,64,'default')}</span><strong>${slot==='icon'?'Player':'Classic pieces'}</strong></button><small class="copy-tag">Always available${!equipped||equipped==='default'?' · Equipped':''}</small></article>`+items.map(o=>{
 const item=itemById(o.itemId)!
 return `<article class="owned-card" style="--rarity:${RARITY_COLORS[item.rarity]}"><button class="preview-item" type="button" data-preview="${o.uid}">${itemCard(item,slot==='icon'?'N':slot,color)}</button><small class="copy-tag ${o.pending?'pending':''}">${o.pending?'Duplicate · choose below':o.listed?'Listed on market':equipped===item.id?'Equipped':'Owned copy'}</small>${o.pending?`<button class="button" type="button" data-keep="${o.uid}">Keep copy</button><button class="button" type="button" data-refund="${o.uid}">Refund ${duplicateRefund(item)}</button>`:o.listed?`<button class="button" type="button" data-cancel="${o.listed}">Cancel listing</button>`:`<button class="button" type="button" data-sell="${o.uid}">Sell copy</button>`}</article>`
 }).join('')
 el('inventory-grid').querySelectorAll<HTMLButtonElement>('[data-preview]').forEach(b=>b.onclick=()=>{preview=b.dataset.preview!;renderPreview()})
 for(const key of ['keep','refund'])el('inventory-grid').querySelectorAll<HTMLButtonElement>(`[data-${key}]`).forEach(b=>b.onclick=()=>void submit('/economy/duplicate',{uid:b.dataset[key],refund:key==='refund'}).catch(report))
 el('inventory-grid').querySelectorAll<HTMLButtonElement>('[data-sell]').forEach(b=>b.onclick=()=>sell(b.dataset.sell!))
 el('inventory-grid').querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach(b=>b.onclick=()=>cancel(b.dataset.cancel!))
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
 for(const id of ['market-search','market-type','market-rarity','market-sort','market-owner'])el(id).oninput=renderMarket
 el('market-refresh').onclick=()=>void loadMarket().catch(report)
 window.addEventListener('hashchange',()=>{route();window.scrollTo({top:0})})
 render();route()
 const tick=()=>el('rotation-timer').textContent=countdown(state.rotation,Date.now()+clockOffset)
 tick();window.setInterval(tick,1000)
 window.setInterval(()=>{if(document.visibilityState!=='visible'||busy||document.querySelector('dialog[open]'))return;void Promise.all([api<Economy>('/economy'),api<{listings:Listing[]}>('/market')]).then(([data,market])=>{state=data;listings=market.listings;profile={...profile,coins:data.wallet.coins,loadout:data.wallet.loadout};renderAccount(profile);render()}).catch(report)},15000)
}
void init().catch(report)
