import {type Notice,type Profile} from './account-model.ts'
import {avatarArt,framedAvatar} from './cosmetic-art.ts'
import {icon} from './icons.ts'
import {initBackdrop} from './backdrop.ts'
export class ApiError extends Error {constructor(message:string,public status:number){super(message)}}
export async function api<T>(path:string,data?:unknown):Promise<T> {
  const response=await fetch(`/api${path}`,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)})
  let result:T&{error?:string}
  try{result=await response.json()}catch{throw new ApiError('Online play is unavailable. Please try again.',response.status)}
  if(!response.ok)throw new ApiError(result.error||'Request failed',response.status)
  return result
}
export interface SessionInfo {user:string|null;profile?:Profile|null}
let session:Promise<SessionInfo>|undefined,current:Profile|undefined
export const getSession=()=>session??=api<SessionInfo>('/me')
const fallback=(name:string):Profile=>({name,settings:{avatar:'default',movement:'live',players:2,moveNotifications:true},rating:{value:1200,games:0},coins:0,loadout:{icon:'default',pieces:{}}})
function applyRating(){
  if(!current)return
  const el=document.getElementById('account-rating')
  if(el){el.textContent=`${Math.round(current.rating.value)} ELO`;el.title=`${current.rating.games} rated games`}
  document.querySelectorAll<HTMLElement>('[data-coins]').forEach(el=>{el.textContent=current!.coins>=100000?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(current!.coins):current!.coins.toLocaleString();el.parentElement!.title=`${current!.coins.toLocaleString()} earned coins`})
}
export function renderAccount(profile:Profile){
  current=profile
  const host=document.getElementById('account-area')
  if(!host)return
  const open=host.querySelector('details')?.open??false
  host.innerHTML=`<button type="button" class="header-bell" data-open-notifications aria-label="Notifications" aria-expanded="false" aria-controls="notification-popover">${icon('bell')}<span data-notification-count hidden></span></button><details class="account-menu"><summary role="button" aria-label="Account menu"><span class="profile-avatar">${framedAvatar(profile.loadout.icon,profile.loadout.frame)}</span><span class="account-copy"><strong id="account-name"></strong><small>${icon('chart')}<span id="account-rating"></span></small></span>${icon('menu','menu-icon')}</summary><div class="account-menu-items"><a href="/chess/lobby.html">${icon('home')}Home</a><button type="button" data-open-notifications>${icon('bell')}Notifications <span data-notification-count hidden></span></button><a href="/chess/lobby.html#settings">${icon('settings')}Settings</a><button id="logout" type="button">Log out</button><p id="account-error" role="alert" hidden></p></div></details>`
  host.querySelector('#account-name')!.textContent=profile.name
  host.querySelector('summary')!.setAttribute('title',profile.name)
  host.querySelector('details')!.open=open
  renderEconomyNav()
  applyRating()
  host.querySelector<HTMLButtonElement>('#logout')!.onclick=async()=>{
    try{await api('/logout',{});location.replace('/chess/')}catch(cause){
      const error=host.querySelector<HTMLElement>('#account-error')!;error.textContent=cause instanceof Error?cause.message:'Could not log out';error.hidden=false
      host.querySelector('details')!.open=true
    }
  }
  host.querySelectorAll<HTMLButtonElement>('[data-open-notifications]').forEach(b=>b.onclick=()=>openNotifications(b))
  const brand=document.getElementById('brand-home') as HTMLAnchorElement|null
  if(brand)brand.href='/chess/lobby.html'
}
function renderEconomyNav(){
 const header=document.querySelector('.app-topbar')
 if(!header)return
 let nav=header.querySelector<HTMLElement>('.economy-nav')
 if(!nav){nav=document.createElement('nav');nav.className='economy-nav';nav.setAttribute('aria-label','Collection');header.insertBefore(nav,header.querySelector('.match-meta')??header.querySelector('#account-area')??header.querySelector('.header-actions'))}
 nav.innerHTML=`<span class="coin-balance" title="Coins earned in games and daily spins">${icon('coin')}<strong data-coins>0</strong></span><a href="/chess/collection.html#shop" aria-label="Shop" title="Shop">${icon('shop')}<span>Shop</span></a><a href="/chess/collection.html#inventory" aria-label="Inventory" title="Inventory">${icon('inventory')}<span>Inventory</span></a><a href="/chess/collection.html#market" aria-label="Market" title="Market">${icon('market')}<span>Market</span></a>`
}
export function updateNoticeCount(count:number){document.querySelectorAll<HTMLElement>('[data-notification-count]').forEach(el=>{el.hidden=!count;el.textContent=String(count)})}
export async function fetchNotices(){const data=await api<{items:Notice[];unread:number}>('/notifications');updateNoticeCount(data.unread);renderNotificationPanel(data.items);return data}
export async function refreshRating(){
  const data=await api<SessionInfo>('/me');session=Promise.resolve(data)
  if(data.profile){current=data.profile;applyRating();const avatar=document.querySelector('.account-menu .profile-avatar');if(avatar)avatar.innerHTML=framedAvatar(current.loadout.icon,current.loadout.frame)}
}
export async function refreshAccount(){
  const data=await api<SessionInfo>('/me');session=Promise.resolve(data)
  if(data.user){renderAccount(data.profile??fallback(data.user));await fetchNotices()}
  return data
}
export async function initShell(options:{redirectHome?:boolean}={}){
  initBackdrop()
  document.querySelectorAll<HTMLElement>('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon!))
  document.addEventListener('click',event=>{
    document.querySelectorAll<HTMLDetailsElement>('.account-menu').forEach(menu=>{
      if(!menu.contains(event.target as Node)||(event.target as Element).closest('.account-menu-items a'))menu.open=false
    })
  })
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll<HTMLDetailsElement>('.account-menu[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary')?.focus()})})
  try{
    const data=await getSession()
    if(data.user){
      if(options.redirectHome){location.replace('/chess/lobby.html');return data}
      renderAccount(data.profile??fallback(data.user))
      if(document.body.dataset.page!=='lobby'){
        void fetchNotices().catch(()=>{})
        window.setInterval(()=>{if(document.visibilityState==='visible')void fetchNotices().catch(()=>{})},15000)
      }
    }
    return data
  }catch{return {user:null}}
}

let notificationTrigger:HTMLElement|undefined
function notificationPanel(){
 let panel=document.getElementById('notification-popover')
 if(!panel){
  panel=document.createElement('section');panel.id='notification-popover';panel.className='notification-popover';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Notifications')
  panel.innerHTML=`<header><div><span class="eyebrow">YOUR TIMELINES</span><h2>Notifications</h2></div><button type="button" class="text-button" data-read-notices>Mark all read</button><button type="button" class="notice-close" aria-label="Close notifications">&times;</button></header><div class="popover-notices" aria-live="polite"></div>`
  document.body.append(panel)
  panel.querySelector<HTMLButtonElement>('.notice-close')!.onclick=()=>closeNotifications()
  panel.querySelector<HTMLButtonElement>('[data-read-notices]')!.onclick=async()=>{
   try{const data=await api<{items:Notice[];unread:number}>('/notifications/read',{all:true});updateNoticeCount(data.unread);renderNotificationPanel(data.items);document.dispatchEvent(new Event('notifications-changed'))}catch{panel!.querySelector('.popover-notices')!.textContent='Could not mark notifications read. Please try again.'}
  }
  document.addEventListener('click',event=>{if(!panel!.hidden&&!panel!.contains(event.target as Node)&&!(event.target as Element).closest('[data-open-notifications], [data-view="notifications"]'))closeNotifications(false)})
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel!.hidden)closeNotifications()})
 }
 return panel
}
function closeNotifications(focus=true){notificationPanel().hidden=true;document.querySelectorAll('[data-open-notifications]').forEach(b=>b.setAttribute('aria-expanded','false'));if(focus)notificationTrigger?.focus()}
export function openNotifications(trigger?:HTMLElement){
 const panel=notificationPanel();if(!panel.hidden){closeNotifications();return}
 notificationTrigger=trigger;document.querySelectorAll<HTMLDetailsElement>('.account-menu').forEach(m=>m.open=false);panel.hidden=false
 document.querySelectorAll('[data-open-notifications]').forEach(b=>b.setAttribute('aria-expanded','true'))
 panel.querySelector<HTMLElement>('.notice-close')?.focus()
 panel.querySelector('.popover-notices')!.textContent='Loading your timelines…'
 void fetchNotices().catch(()=>{panel.querySelector('.popover-notices')!.textContent='Notifications could not load. Close and reopen to try again.'})
}
function renderNotificationPanel(items:Notice[]){
 const panel=notificationPanel(),list=panel.querySelector('.popover-notices')!;list.replaceChildren()
 panel.querySelector<HTMLButtonElement>('[data-read-notices]')!.disabled=!items.some(n=>!n.read)
 if(!items.length){list.innerHTML=`<div class="notice-empty">${icon('bell')}<strong>All caught up.</strong><p>Your next move, victory and new challenger will appear here.</p></div>`;return}
 for(const n of items){
  const row=document.createElement('button');row.type='button';row.className=`popover-notice${n.read?'':' unread'}`
  row.innerHTML=`<span class="popover-notice-icon">${icon(n.kind==='rating'?'chart':n.kind==='result'?'trophy':'knight')}</span><span><strong></strong><small></small><time></time></span>`
  row.querySelector('strong')!.textContent=n.title;row.querySelector('small')!.textContent=n.detail;row.querySelector('time')!.textContent=new Date(n.created).toLocaleString()
  row.onclick=async()=>{row.disabled=true;try{const data=await api<{items:Notice[];unread:number}>('/notifications/read',{ids:[n.id]});updateNoticeCount(data.unread);location.href=`/chess/online.html?code=${encodeURIComponent(n.code)}`}catch{row.disabled=false;row.querySelector('small')!.textContent='Could not open this update. Try again.'}}
  list.append(row)
 }
}
