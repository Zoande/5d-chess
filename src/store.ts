import {api,getSession,initShell,renderAccount} from './shell.ts'
import {type Profile} from './account-model.ts'
import {type Collectible,type ItemType,type OwnedItem,type Listing,ITEMS,ITEM_LABELS,CRATES,crateTickets,RARITIES,RARITY_COLORS,itemById,duplicateRefund} from './collection.ts'
import {type Kind,type Player,KINDS,PLAYERS} from './model.ts'
import {framedAvatar,frameArt} from './cosmetic-art.ts'
import {COLORS,NAMES,pieceIcon,skinSetIcon} from './art.ts'
import {type Economy,type RewardReply,requestId,itemArt,itemCard,countdown,revealDrop,crateArt} from './rewards.ts'
import {icon} from './icons.ts'
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const message=(id:string,text:string)=>{el(id).textContent=text;el(id).hidden=!text}
let state:Economy,profile:Profile,listings:Listing[]=[],slot:Kind|'icon'='K',layer:ItemType='skin',color:Player='red',preview='default',busy=false,clockOffset=0,featureType='all'
const appearanceDrafts=new Map<string,string>()
const purchaseKeys=new Map<string,string>()
const submit=async(path:string,data:Record<string,unknown>,key?:string)=>{
 if(busy)throw new Error('Please wait for the current action')
 busy=true;message('collection-error','')
 try{
  if(key){if(!purchaseKeys.has(key))purchaseKeys.set(key,requestId());data.requestId=purchaseKeys.get(key)}
  const reply=await api<RewardReply>(path,data);if(key)purchaseKeys.delete(key)
  state=reply;profile=reply.profile;clockOffset=reply.now-Date.now();renderAccount(profile);render();return reply
 }finally{busy=false;renderShop()}
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
  const set=item.type==='skin'||item.type==='shape'
  dialog.innerHTML=`<button class="dialog-close inspect-close" type="button" data-close-x aria-label="Close item preview">&times;</button><div class="inspect-art">${art(item,player)}</div><small class="rarity-label">${item.rarity} &middot; ${ITEM_LABELS[item.type]}${item.monthly?' &middot; MONTHLY':''}</small><h2>${item.name}</h2><p>${item.description}</p>${set?`<div class="inspect-roster">${KINDS.map(k=>pieceIcon(k,player,48,item.type==='skin'?item.id:'default',item.type==='shape'?item.id:undefined)).join('')}</div><div class="preview-colors" aria-label="Inspect faction color">${PLAYERS.map(p=>`<button type="button" data-variant="${p}" style="--faction:${COLORS[p]}" aria-label="Inspect ${p} variant" aria-pressed="${p===player}"></button>`).join('')}</div>`:''}<button type="button" class="button" data-close>Close preview</button>`
  dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>dialog.close();dialog.querySelector<HTMLButtonElement>('[data-close-x]')!.onclick=()=>dialog.close();dialog.querySelectorAll<HTMLButtonElement>('[data-variant]').forEach(b=>b.onclick=()=>draw(b.dataset.variant as Player))
 };draw(color);document.body.append(dialog);dialog.showModal();dialog.onclose=()=>dialog.remove()
}
const shopKeys=new Map<string,string>()
let showWelcome=false,shopVisited=false,crateFilter='all'
const art=(item:Collectible,player:Player='red')=>item.type==='skin'?skinSetIcon(item.id,player):item.type==='shape'?skinSetIcon('default',player,item.id):itemArt(item)
function mountShop(id:string,key:string,draw:()=>string){if(shopKeys.get(id)===key)return;el(id).innerHTML=draw();shopKeys.set(id,key)}
function crateCard(crate:typeof CRATES[number]){
 const pool=crateTickets(crate),monthlyOdds=pool.filter(t=>t.item.monthly).reduce((s,t)=>s+t.weight,0)/10000
 return `<article class="crate-card" data-crate-card="${crate.id}" data-category="${crate.type}" data-style="0"><div class="crate-card-stage">${crateArt(crate)}</div><div class="crate-card-copy"><small class="rarity-label">${crate.monthly?crate.monthly==='exclusive'?'MONTHLY EXCLUSIVES':`${monthlyOdds.toFixed(1)}% MONTHLY REWARDS`:ITEM_LABELS[crate.type as ItemType]??'ALL COSMETICS'}</small><h3>${crate.name}</h3>${crate.styles?`<div class="crate-style-picker" role="group" aria-label="${crate.name} box finish">${crate.styles.map((name,i)=>`<button type="button" data-finish="${i}" aria-pressed="${i===0}">${name}</button>`).join('')}</div>`:''}<div class="crate-card-actions"><button class="button primary" type="button" data-crate-buy="${crate.id}">${icon('coin')}${crate.price.toLocaleString()} <span>Open</span></button><button class="crate-pool-button" type="button" data-crate-pool="${crate.id}" aria-label="View ${crate.name} rewards and odds">Rewards &amp; odds</button></div></div></article>`
}
function inspectCrate(id:string){
 const crate=CRATES.find(c=>c.id===id)!,tickets=crateTickets(crate),dialog=document.createElement('dialog');dialog.className='transaction-dialog crate-catalog-dialog'
 dialog.innerHTML=`<div class="section-title"><h2>${crate.name}</h2><button class="dialog-close" data-close type="button" aria-label="Close rewards and odds">&times;</button></div><div class="odds-grid">${RARITIES.map(r=>`<span style="--rarity:${RARITY_COLORS[r]}"><i></i>${r}<b>${percentWeight(tickets.filter(t=>t.item.rarity===r).reduce((s,t)=>s+t.weight,0))}</b></span>`).join('')}</div><p class="pool-note">One reward per crate. Duplicates can be kept or refunded. Exact odds per item:</p><div class="crate-reward-catalog">${tickets.map(t=>`<button type="button" data-inspect="${t.item.id}" style="--rarity:${RARITY_COLORS[t.item.rarity]}"><span class="item-picture">${art(t.item)}</span><strong>${t.item.name}</strong><small>${t.item.monthly?'MONTHLY &middot; ':''}${percentWeight(t.weight)}</small></button>`).join('')}</div>`
 document.body.append(dialog);dialog.showModal();dialog.onclose=()=>dialog.remove();dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>dialog.close()
}
const percentWeight=(n:number)=>`${(n/10000).toFixed(4).replace(/\.?0+$/,'')}%`
function renderShop(){
 el('starter-note').hidden=!showWelcome
 mountShop('monthly-crates','monthly',()=>CRATES.filter(c=>c.monthly).map(crateCard).join(''))
 mountShop('general-crates','general',()=>CRATES.filter(c=>!c.monthly).map(crateCard).join(''))
 mountShop('featured-items',state.featured.join(',')+featureType,()=>state.featured.filter(id=>featureType==='all'||itemById(id)?.type===featureType).map(id=>{const item=itemById(id)!;return `<article class="featured-card" style="--rarity:${RARITY_COLORS[item.rarity]}"><span class="owned-label" data-owned="${id}" hidden>OWNED</span><button class="feature-art-button" type="button" data-inspect="${id}" aria-label="Preview ${item.name}"><span class="item-picture">${art(item)}</span></button><small class="rarity-label">${item.rarity} &middot; ${ITEM_LABELS[item.type]}</small><strong>${item.name}</strong><button class="button" type="button" data-buy="${id}">${icon('coin')}${item.price.toLocaleString()}</button></article>`}).join(''))
 mountShop('daily-deal-items',JSON.stringify(state.dailyDeals),()=>state.dailyDeals.map(d=>{const item=itemById(d.itemId)!;return `<article class="featured-card daily-deal-card" style="--rarity:${RARITY_COLORS[item.rarity]}"><span class="discount-tag">SAVE 25%</span><button class="feature-art-button" type="button" data-inspect="${item.id}" aria-label="Preview ${item.name}"><span class="item-picture">${art(item)}</span></button><div class="deal-copy"><small class="rarity-label">${item.rarity} &middot; ${ITEM_LABELS[item.type]}</small><strong>${item.name}</strong><button class="button" type="button" data-daily-buy="${item.id}">${icon('coin')}${d.price.toLocaleString()} <s>${d.originalPrice.toLocaleString()}</s></button></div></article>`}).join(''))
 document.querySelectorAll<HTMLButtonElement>('[data-crate-buy]').forEach(b=>{b.disabled=busy||state.wallet.coins<CRATES.find(c=>c.id===b.dataset.crateBuy)!.price})
 document.querySelectorAll<HTMLButtonElement>('[data-buy],[data-daily-buy]').forEach(b=>{const id=b.dataset.buy??b.dataset.dailyBuy!,price=b.dataset.buy?itemById(id)!.price:state.dailyDeals.find(d=>d.itemId===id)!.price;b.disabled=busy||state.wallet.coins<price})
 document.querySelectorAll<HTMLElement>('[data-owned]').forEach(b=>b.hidden=!state.wallet.inventory.some(o=>o.itemId===b.dataset.owned))
 document.querySelectorAll<HTMLElement>('[data-feature-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.featureType===featureType)))
}
function bindShop(){
 document.addEventListener('click',event=>{
  const b=(event.target as Element).closest<HTMLElement>('button');if(!b)return
  if(b.dataset.inspect){inspectItem(itemById(b.dataset.inspect)!);return}
  if(b.dataset.finish){const card=b.closest<HTMLElement>('[data-crate-card]')!;card.dataset.style=b.dataset.finish;card.querySelectorAll<HTMLElement>('[data-finish]').forEach(f=>f.setAttribute('aria-pressed',String(f===b)));return}
  if(b.dataset.cratePool){inspectCrate(b.dataset.cratePool);return}
  if(b.dataset.crateFilter){crateFilter=b.dataset.crateFilter;document.querySelectorAll<HTMLElement>('[data-crate-filter]').forEach(f=>f.setAttribute('aria-pressed',String(f===b)));document.querySelectorAll<HTMLElement>('#general-crates [data-crate-card]').forEach(c=>c.hidden=crateFilter!=='all'&&c.dataset.category!==crateFilter);return}
  if(b.dataset.crateBuy){
   const crate=CRATES.find(c=>c.id===b.dataset.crateBuy)!,month=state.month,finish=Number(b.closest<HTMLElement>('[data-crate-card]')?.dataset.style??0)
   const tickets=crateTickets(crate)
   transaction(`Open ${crate.name}?`,`<div class="purchase-crate-preview" data-crate-card="${crate.id}" data-style="${finish}">${crateArt(crate)}</div><p>${icon('coin')} <strong>${crate.price.toLocaleString()} coins</strong> &middot; 1 ${crate.monthly==='exclusive'?'monthly ':''}cosmetic</p><div class="odds-grid">${RARITIES.map(r=>`<span style="--rarity:${RARITY_COLORS[r]}"><i></i>${r}<b>${percentWeight(tickets.filter(t=>t.item.rarity===r).reduce((s,t)=>s+t.weight,0))}</b></span>`).join('')}</div><p class="pool-note">Duplicates are possible. Box finishes share the same rewards and odds.</p>`,'Buy & open',async d=>{const data=await submit('/economy/crate',{crate:crate.id,month},'crate:'+crate.id);d.close();await revealDrop(data.drop!,'crate',crate.tier,next=>{state=next;render()},crate.id,finish)})
  }
  const id=b.dataset.dailyBuy??b.dataset.buy
  if(id){const item=itemById(id)!,price=b.dataset.dailyBuy?state.dailyDeals.find(d=>d.itemId===id)!.price:item.price;transaction(`Buy ${item.name}?`,`<div class="item-picture">${art(item)}</div><p><strong>${price.toLocaleString()} coins</strong>${state.wallet.inventory.some(o=>o.itemId===id)?' &middot; Adds another tradable copy.':''}</p>`,'Buy item',async()=>{await submit('/economy/buy',{itemId:id,expectedPrice:price},'buy:'+id);message('collection-status',`${item.name} added to your inventory.`)})}
 })
 el('dismiss-welcome').onclick=()=>{showWelcome=false;el('starter-note').hidden=true}
}
function selectedItem(){return itemById(state.wallet.inventory.find(o=>o.uid===preview)?.itemId??'')}
const slotType=():ItemType=>layer
const shapeFor=(kind:Kind)=>state.wallet.loadout.shapes?.[kind]??state.wallet.loadout.shape??'default'
const currentAppearance=(type:ItemType,kind:Kind|'icon'=slot)=>type==='icon'?state.wallet.loadout.icon:type==='frame'?state.wallet.loadout.frame??'default':type==='shape'?shapeFor(kind as Kind):state.wallet.loadout.pieces[kind as Kind]??'default'
const draftAppearance=(type:ItemType)=>appearanceDrafts.get(`${slot}:${type}`)??currentAppearance(type)
const equippedId=()=>currentAppearance(layer)
const ownedId=(id:string)=>id==='default'?'default':state.wallet.inventory.find(o=>o.itemId===id&&!o.pending&&!o.listed)?.uid
function chooseLayer(next:ItemType){layer=next;preview=ownedId(draftAppearance(layer))??'default';renderInventory()}
function previewArt(id:string,kind:Kind='N'){
 const primary=slot==='icon'?'icon':'skin',secondary=slot==='icon'?'frame':'shape'
 const first=layer===primary?id:draftAppearance(primary),second=layer===secondary?id:draftAppearance(secondary)
 return slot==='icon'?framedAvatar(first,second):pieceIcon(kind,color,210,first,second)
}
function renderPreview(){
 const item=selectedItem(),id=item?.id??'default',kind:Kind=slot==='icon'?'N':slot
 const primary=slot==='icon'?'icon':'skin',secondary=slot==='icon'?'frame':'shape',first=draftAppearance(primary),second=draftAppearance(secondary)
 const unchanged=first===currentAppearance(primary)&&second===currentAppearance(secondary),firstUid=ownedId(first),secondUid=ownedId(second)
 const owned=state.wallet.inventory.find(o=>o.uid===preview),usable=!!firstUid&&!!secondUid&&(!owned||!owned.listed&&!owned.pending)
 el('equipment-preview').style.setProperty('--rarity',item?RARITY_COLORS[item.rarity]:'#a9c486')
 const largeArt=slot==='icon'?framedAvatar(first,second):pieceIcon(kind,color,210,first,second)
 const name=(value:string,fallback:string)=>itemById(value)?.name??fallback
 el('equipment-preview').innerHTML=`<div class="preview-canvas"><span class="preview-stage-label">${slot==='icon'?'PLAYER IDENTITY':NAMES[kind].toUpperCase()}</span>${largeArt}<span class="preview-plinth"></span></div>${slot!=='icon'?`<div class="preview-colors">${PLAYERS.map(p=>`<button type="button" data-color="${p}" style="--faction:${COLORS[p]}" aria-label="${p} variant" aria-pressed="${p===color}"></button>`).join('')}</div>`:'<div style="height:20px"></div>'}<div class="look-summary"><span><small>${primary==='icon'?'ICON':'SKIN'}</small><strong>${name(first,primary==='icon'?'Player':'Classic')}</strong></span><b>+</b><span><small>${secondary==='frame'?'FRAME':'OUTLINE'}</small><strong>${name(second,secondary==='frame'?'No frame':'Classic')}</strong></span></div><h2>${slot==='icon'?'Player icon':NAMES[kind]}</h2>${slot!=='icon'?`<div class="preview-set-roster">${KINDS.map(k=>`<span title="${NAMES[k]}">${pieceIcon(k,color,40,k===kind?first:currentAppearance('skin',k),k===kind?second:shapeFor(k))}</span>`).join('')}</div>`:''}<div class="equip-actions"><button class="button primary" id="equip-preview" type="button" ${!usable||unchanged?'disabled':''}>${unchanged?'Equipped':!usable?owned?.pending?'Keep or refund below':'Item unavailable':'Equip look'}</button>${slot!=='icon'&&layer==='skin'?`<button class="button" id="equip-set" type="button" ${!firstUid||KINDS.every(k=>(state.wallet.loadout.pieces[k]??'default')===first)?'disabled':''}>${KINDS.every(k=>(state.wallet.loadout.pieces[k]??'default')===first)?'Full set equipped':'Equip full skin set'}</button>`:''}</div>`
 el('equipment-preview').querySelectorAll<HTMLButtonElement>('[data-color]').forEach(b=>b.onclick=()=>{color=b.dataset.color as Player;renderInventory()})
 el('equip-preview').onclick=()=>void submit('/economy/equip-look',{target:slot,primary:firstUid,secondary:secondUid}).then(()=>message('collection-status','Appearance updated.')).catch(report)
 el('equip-set')?.addEventListener('click',()=>void submit('/economy/equip-set',{uid:firstUid}).then(()=>{for(const k of KINDS)appearanceDrafts.delete(`${k}:skin`);message('collection-status','Full skin set equipped.')}).catch(report))
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
 const equipped=equippedId(),type=slotType(),chosen=state.wallet.inventory.find(o=>o.uid===preview)
 if(chosen&&(chosen.listed||chosen.pending)){const usable=state.wallet.inventory.find(o=>o.itemId===chosen.itemId&&!o.listed&&!o.pending);if(usable)preview=usable.uid}
 if(preview!=='default'&&!state.wallet.inventory.some(o=>o.uid===preview))preview='default'
 const rarity=el<HTMLSelectElement>('inventory-rarity').value,search=el<HTMLInputElement>('inventory-search').value.trim().toLowerCase(),status=el<HTMLSelectElement>('inventory-status').value
 const grouped=new Map<string,OwnedItem[]>()
 for(const owned of state.wallet.inventory){const item=itemById(owned.itemId);if(!item||item.type!==type)continue;const group=grouped.get(item.id)??[];group.push(owned);grouped.set(item.id,group)}
 const groups=[...grouped.entries()].filter(([id,copies])=>{const item=itemById(id)!;return (rarity==='all'||item.rarity===rarity)&&(!search||item.name.toLowerCase().includes(search))&&(status==='all'||status==='duplicates'&&copies.length>1||status==='attention'&&copies.some(o=>o.pending||o.listed))}).sort(([a,ac],[b,bc])=>Number(bc.some(o=>o.pending))-Number(ac.some(o=>o.pending))||RARITIES.indexOf(itemById(b)!.rarity)-RARITIES.indexOf(itemById(a)!.rarity)||itemById(a)!.name.localeCompare(itemById(b)!.name))
 el('inventory-summary').textContent=`${new Set(state.wallet.inventory.map(o=>o.itemId)).size} / ${ITEMS.length} collected`
 el('armory-title').textContent=type==='skin'?`${NAMES[slot as Kind]} skins`:type==='shape'?`${NAMES[slot as Kind]} outlines`:type==='frame'?'Icon frames':'Player icons';el('armory-count').textContent=`${groups.length} designs`
 el('equipment-slots').innerHTML=[...KINDS,'icon'].map(k=>`<button type="button" data-slot="${k}" aria-pressed="${slot===k}">${k==='icon'?framedAvatar(state.wallet.loadout.icon,state.wallet.loadout.frame):pieceIcon(k as Kind,color,32,state.wallet.loadout.pieces[k as Kind]??'default',shapeFor(k as Kind))}<span>${k==='icon'?'Player icon':NAMES[k as Kind]}</span></button>`).join('')
 el('equipment-slots').querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(b=>b.onclick=()=>{slot=b.dataset.slot as typeof slot;layer=slot==='icon'?(layer==='frame'?'frame':'icon'):(layer==='shape'?'shape':'skin');preview=ownedId(draftAppearance(layer))??'default';renderInventory()})
 const layers:ItemType[]=slot==='icon'?['icon','frame']:['skin','shape']
 el('inventory-layers').innerHTML=layers.map(l=>`<button type="button" data-layer="${l}" aria-pressed="${layer===l}">${l==='shape'?'Outline / shape':l==='skin'?'Skin':l==='frame'?'Animated frame':'Icon'}</button>`).join('')
 el('inventory-layers').querySelectorAll<HTMLButtonElement>('[data-layer]').forEach(b=>b.onclick=()=>chooseLayer(b.dataset.layer as ItemType))
 const defaultName=type==='frame'?'No frame':type==='icon'?'Player':'Classic pieces'
 el('inventory-grid').innerHTML=`<article class="owned-card" style="--rarity:#a9c486"><button class="preview-item" type="button" data-preview="default"><span class="item-picture">${previewArt('default',slot==='icon'?'N':slot)}</span><strong>${defaultName}</strong></button><small class="copy-tag">${equipped==='default'?'Equipped':'Default'}</small></article>`+groups.map(([id,copies])=>{
  const item=itemById(id)!,available=copies.find(o=>!o.pending&&!o.listed),pending=copies.find(o=>o.pending),owned=available??pending??copies[0]
  return `<article class="owned-card ${equipped===id?'equipped-card':''}" style="--rarity:${RARITY_COLORS[item.rarity]}"><button class="preview-item" type="button" data-preview="${owned.uid}"><span class="item-picture">${previewArt(id,slot==='icon'?'N':slot)}</span><small class="rarity-label">${item.rarity}${item.monthly?' &middot; MONTHLY':''}</small><strong>${item.name}</strong></button><small class="copy-tag ${pending?'pending':''}">${pending?'Duplicate choice waiting':equipped===id?'Equipped &middot; ':''}${copies.length} ${copies.length===1?'copy':'copies'}</small>${pending?`<button class="button" type="button" data-manage="${id}">Choose reward</button>`:available?`<button class="button" type="button" data-sell="${available.uid}">Sell ${copies.length>1?'a copy':'copy'}</button>`:'<small class="copy-tag">Listed</small>'}${copies.length>1||copies.some(o=>o.listed)?`<button class="manage-copy-link" type="button" data-manage="${id}">Manage copies</button>`:''}</article>`
 }).join('')
 if(!groups.length)el('inventory-grid').insertAdjacentHTML('beforeend',`<div class="inventory-empty"><p>${grouped.size?'No matching designs.':'Your collection starts here.'}</p><a class="button" href="#shop">Explore shop</a></div>`)
 el('inventory-grid').querySelectorAll<HTMLButtonElement>('[data-preview]').forEach(b=>b.onclick=()=>{preview=b.dataset.preview!;appearanceDrafts.set(`${slot}:${layer}`,state.wallet.inventory.find(o=>o.uid===preview)?.itemId??'default');renderPreview()})
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
 if(view==='shop'&&!shopVisited){shopVisited=true;showWelcome=!state.wallet.shopSeen;el('starter-note').hidden=!showWelcome;void api('/economy/visit-shop',{}).then(()=>{state.wallet.shopSeen=true}).catch(report)}else if(view!=='shop'){showWelcome=false;el('starter-note').hidden=true}
 if(view==='market')void loadMarket().catch(report)
}
async function init(){
 await initShell();const session=await getSession();if(!session.user){location.replace('/chess/login.html');return}
 profile=session.profile!;state=await api<Economy>('/economy');clockOffset=state.now-Date.now()
 preview=state.wallet.inventory.find(o=>o.itemId===state.wallet.loadout.pieces.K&&!o.listed&&!o.pending)?.uid??'default'
 bindShop()
 for(const id of ['inventory-rarity','market-rarity'])for(const rarity of RARITIES){const option=document.createElement('option');option.value=rarity;option.textContent=rarity[0].toUpperCase()+rarity.slice(1);el(id).append(option)}
 el('inventory-rarity').onchange=renderInventory
 el('inventory-status').onchange=renderInventory
 el('inventory-search').oninput=renderInventory
 document.querySelectorAll<HTMLButtonElement>('[data-feature-type]').forEach(b=>b.onclick=()=>{featureType=b.dataset.featureType!;renderShop()})
 for(const id of ['market-search','market-type','market-rarity','market-sort','market-owner'])el(id).oninput=renderMarket
 el('market-refresh').onclick=()=>void loadMarket().catch(report)
 window.addEventListener('hashchange',()=>{route();window.scrollTo({top:0})})
 render();route()
 const tick=()=>{el('rotation-timer').textContent=countdown(state.rotation,Date.now()+clockOffset);el('daily-deals-timer').textContent=countdown(state.reset,Date.now()+clockOffset);el('monthly-timer').textContent=countdown(state.monthlyReset,Date.now()+clockOffset)}
 tick();window.setInterval(tick,1000)
 window.setInterval(()=>{if(document.visibilityState!=='visible'||busy||document.querySelector('dialog[open]'))return;void Promise.all([api<Economy>('/economy'),api<{listings:Listing[]}>('/market')]).then(([data,market])=>{state=data;listings=market.listings;profile={...profile,coins:data.wallet.coins,loadout:data.wallet.loadout};renderAccount(profile);render()}).catch(report)},15000)
}
void init().catch(report)
