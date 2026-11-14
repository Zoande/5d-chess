import {type Notice,type Profile} from './account-model.ts'
import {avatarArt} from './cosmetic-art.ts'
import {icon} from './icons.ts'
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
  host.innerHTML=`<a class="header-bell" href="/chess/lobby.html#notifications" aria-label="Notifications">${icon('bell')}<span data-notification-count hidden></span></a><details class="account-menu"><summary role="button" aria-label="Account menu"><span class="profile-avatar">${avatarArt(profile.loadout.icon)}</span><span class="account-copy"><strong id="account-name"></strong><small>${icon('chart')}<span id="account-rating"></span></small></span>${icon('menu','menu-icon')}</summary><div class="account-menu-items"><a href="/chess/lobby.html">${icon('home')}Home</a><a href="/chess/lobby.html#notifications">${icon('bell')}Notifications <span data-notification-count hidden></span></a><a href="/chess/lobby.html#settings">${icon('settings')}Settings</a><button id="logout" type="button">Log out</button><p id="account-error" role="alert" hidden></p></div></details>`
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
export async function fetchNotices(){const data=await api<{items:Notice[];unread:number}>('/notifications');updateNoticeCount(data.unread);return data}
export async function refreshRating(){
  const data=await api<SessionInfo>('/me');session=Promise.resolve(data)
  if(data.profile){current=data.profile;applyRating();const avatar=document.querySelector('.account-menu .profile-avatar');if(avatar)avatar.innerHTML=avatarArt(current.loadout.icon)}
}
export async function refreshAccount(){
  const data=await api<SessionInfo>('/me');session=Promise.resolve(data)
  if(data.user){renderAccount(data.profile??fallback(data.user));await fetchNotices()}
  return data
}
export async function initShell(options:{redirectHome?:boolean}={}){
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
