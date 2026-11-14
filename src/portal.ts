import {itemById} from './collection.ts'
import {itemArt} from './rewards.ts'
import {initDailySpin,type Economy} from './rewards.ts'
import {avatarArt,framedAvatar} from './cosmetic-art.ts'
import {api,ApiError,getSession,initShell,refreshRating,renderAccount,fetchNotices,updateNoticeCount,openNotifications} from './shell.ts'
import {type Notice,type Profile} from './account-model.ts'
import {type Movement} from './model.ts'
import {icon} from './icons.ts'
type Game = {code:string;title:string;players:number;maxPlayers:number;protected:boolean;round:number;finished:boolean;movement?:Movement|'legacy';rated?:boolean;myTurn?:boolean}
type Games = {available:Game[];mine:Game[];limit:number}
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const error=(id:string,message:string)=>{const box=el(id);box.textContent=message;box.hidden=!message}
const online=(code:string)=>{location.href=`/chess/online.html?code=${encodeURIComponent(code)}`}
document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>event.preventDefault()))
void initShell()
async function login() {
  let signup = false
  const setMode = (value: boolean) => {
    signup = value
    el('auth-title').textContent = value ? 'Create an account' : 'Log in'
    el('auth-intro').textContent = value ? 'Choose a username and password to play online.' : 'Log in to join friends and continue your games.'
    el('auth-submit').textContent = value ? 'Sign up' : 'Log in'
    el('confirm-row').hidden = !value
    el<HTMLInputElement>('confirm').required = value
    el<HTMLInputElement>('password').autocomplete = value ? 'new-password' : 'current-password'
    el('switch-mode').textContent = value ? 'Already have an account? Log in' : 'Create an account'
    el('missing-account').hidden = true
    error('auth-error', '')
  }
  el('switch-mode').onclick = () => setMode(!signup)
  el('make-account').onclick = () => { setMode(true); el('confirm').focus() }
  el('return-login').onclick = () => { el('missing-account').hidden = true; error('auth-error', '') }
  el<HTMLFormElement>('auth-form').onsubmit = async event => {
    event.preventDefault()
    if (el<HTMLButtonElement>('auth-submit').disabled) return
    el('missing-account').hidden = true
    error('auth-error', '')
    const username = el<HTMLInputElement>('username').value.trim()
    const password = el<HTMLInputElement>('password').value
    const confirm = el<HTMLInputElement>('confirm').value
    if (signup && password !== confirm) { error('auth-error', 'Passwords do not match'); return }
    const submit = el<HTMLButtonElement>('auth-submit')
    submit.disabled = true
    submit.textContent = signup ? 'Creating account…' : 'Logging in…'
    el<HTMLButtonElement>('switch-mode').disabled = true
    try {
      await api(signup ? '/signup' : '/login', {username, password, ...(signup ? {confirm} : {})})
      location.replace('/chess/lobby.html')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not log in'
      if (message === 'Account not found' && !signup) el('missing-account').hidden = false
      else error('auth-error', message)
    } finally {
      submit.disabled = false
      submit.textContent = signup ? 'Sign up' : 'Log in'
      el<HTMLButtonElement>('switch-mode').disabled = false
    }
  }
  try { if ((await getSession()).user) location.replace('/chess/lobby.html') } catch { /* form will show server errors */ }
}


function gameRow(game:Game,action:string,click:()=>void){
  const row=document.createElement('div');row.className='game-row'
  const copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small'),button=document.createElement('button')
  title.textContent=game.title
  const movement=game.movement==='classic'?'Classic':game.movement==='live'?'Live':'Legacy live'
  detail.textContent=`${game.code} · ${game.players}/${game.maxPlayers} players · ${movement} · ${game.rated?'Rated':'Casual'}${game.finished?' · Finished':game.myTurn?' · Your move':` · Round ${game.round}`}`
  copy.append(title,detail);button.className='button';button.textContent=action;button.onclick=click;row.append(copy,button);return row
}
const relative=(time:number)=>{const seconds=Math.max(0,Math.floor((Date.now()-time)/1000));return seconds<60?'Just now':seconds<3600?`${Math.floor(seconds/60)}m ago`:seconds<86400?`${Math.floor(seconds/3600)}h ago`:`${Math.floor(seconds/86400)}d ago`}
function noticeRow(notice:Notice,open:()=>void){
  const row=document.createElement('button');row.type='button';row.className=`notice-row${notice.read?'':' unread'}`
  row.innerHTML=`<span class="notice-symbol">${icon(notice.kind==='rating'?'chart':notice.kind==='result'?'trophy':notice.kind==='join'?'person':notice.kind==='turn'?'play':'knight')}</span><span class="notice-copy"><strong></strong><small></small></span><time></time>`
  row.querySelector('strong')!.textContent=notice.title;row.querySelector('small')!.textContent=notice.detail
  const time=row.querySelector('time')!;time.textContent=relative(notice.created);time.dateTime=new Date(notice.created).toISOString()
  row.onclick=open;return row
}
async function lobby(){
  const session=await getSession().catch(()=>null)
  if(!session?.user){location.replace('/chess/login.html');return}
  if(!session.profile){error('lobby-error','The home page needs the matching updated game server.');return}
  let profile:Profile=session.profile
  let count=profile.settings.players,movement:Movement=profile.settings.movement,place:'online'|'local'='online',showAll=false
  let games:Games={available:[],mine:[],limit:50},notices:Notice[]=[],leaderboardRequest=0
  const localURL=()=>`/chess/?local=1&players=${count}&movement=${movement}`
  const updateLocalLinks=()=>document.querySelectorAll<HTMLAnchorElement>('.mode-choice a').forEach(link=>{const url=new URL(link.href);url.searchParams.set('movement',el<HTMLSelectElement>('local-movement').value);link.href=url.toString()})
  const renderGames=()=>{
    const filtered=games.available.filter(g=>showAll||(g.maxPlayers===count&&g.movement===movement))
    el('available-games').replaceChildren(...filtered.map(g=>gameRow(g,'Join',()=>{el<HTMLInputElement>('join-code').value=g.code;el<HTMLFormElement>('join-form').requestSubmit()})))
    if(!filtered.length)el('available-games').textContent=showAll?'No open games right now. Create one and invite friends.':'No matching games yet. Create a game, or show all open games.'
    el('game-filter').textContent=showAll?'All player counts and movement modes.':`${count} players · ${movement==='classic'?'Classic':'Live'}`
    el('show-all-games').hidden=showAll
    el('my-games').replaceChildren(...[...games.mine].sort((a,b)=>Number(a.finished)-Number(b.finished)||Number(b.myTurn)-Number(a.myTurn)).map(g=>gameRow(g,g.finished?'Review':'Continue',()=>online(g.code))))
    if(!games.mine.length)el('my-games').textContent='No games yet. Create one or find an open seat.'
  }
  const loadGames=async()=>{games=await api<Games>('/games');renderGames()}
  const markRead=async(ids?:string[])=>{
    const result=await api<{items:Notice[];unread:number}>('/notifications/read',ids?{ids}:{all:true})
    notices=result.items;updateNoticeCount(result.unread);renderNotices()
  }
  const renderNotices=()=>{
    const rows=(items:Notice[])=>items.map(n=>noticeRow(n,()=>{void markRead([n.id]).then(()=>online(n.code)).catch(cause=>error('lobby-error',String(cause.message??cause)))}))
    el('notification-feed').replaceChildren(...rows(notices.slice(0,5)))
    el('all-notifications').replaceChildren(...rows(notices))
    if(!notices.length){
      for(const id of ['notification-feed','all-notifications']){const empty=document.createElement('p');empty.className='card-empty';empty.textContent='You’re all caught up. Game activity and rating updates will appear here.';el(id).append(empty)}
    }
    const unread=notices.some(n=>!n.read)
    el<HTMLButtonElement>('read-all').disabled=!unread;el<HTMLButtonElement>('read-all-page').disabled=!unread
    document.querySelector<HTMLElement>('.view-all')!.hidden=notices.length<=5
  }
  document.addEventListener('notifications-changed',()=>void loadNotices())
  const loadNotices=async()=>{const data=await fetchNotices();notices=data.items;renderNotices()}
  const loadLeaderboard=async()=>{
    const request=++leaderboardRequest;el('rating-pool-label').textContent='All modes · All player counts'
    const data=await api<{players:{name:string;avatar:string;frame?:string;rating:number;games:number;rank:number}[];me:{rating:number;games:number;rank:number|null}}>('/leaderboard')
    if(request!==leaderboardRequest)return
    const table=document.createElement('table');table.innerHTML='<thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Elo</th></tr></thead><tbody></tbody>'
    for(const p of data.players){
      const row=document.createElement('tr');row.classList.toggle('self',p.name===profile.name)
      row.innerHTML=`<td></td><td><span class="rank-player"><span class="small-avatar">${framedAvatar(p.avatar,p.frame)}</span><strong></strong></span></td><td></td>`
      row.cells[0].textContent=String(p.rank);row.querySelector('strong')!.textContent=p.name;row.cells[2].textContent=String(p.rating);table.querySelector('tbody')!.append(row)
    }
    el('leaderboard').replaceChildren(table)
    if(!data.players.length){const empty=document.createElement('p');empty.className='card-empty';empty.textContent='The board is open. Finish a rated game to earn a place here.';el('leaderboard').append(empty)}
    el('my-rating-summary').textContent=`Your rating: ${data.me.rating}${data.me.rank?` \u00b7 #${data.me.rank}`:''}`
  }
  const updateChoices=()=>{
    document.querySelectorAll<HTMLElement>('[data-place]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.place===place)))
    document.querySelectorAll<HTMLElement>('[data-players]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.players)===count)))
    document.querySelectorAll<HTMLElement>('[data-movement]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.movement===movement)))
    el('movement-hint').textContent=movement==='classic'?'Take turns in a fixed player order.':'Everyone plans, then the pieces travel.'
    el('find-label').textContent=place==='online'?'Find game':'Play locally'
    document.querySelector<HTMLElement>('.home-actions [data-view="make"]')!.hidden=place==='local'
    const resume=document.querySelector<HTMLButtonElement>('.home-actions [data-view="continue"]')!
    resume.disabled=place==='local'&&!localStorage.getItem(`four-player-multiverse-chess/v1/${movement}/${count}`)
    resume.title=resume.disabled?'No local game saved for these options.':''
    showAll=false;renderGames()
    void loadLeaderboard().catch(cause=>{el('leaderboard').textContent=cause.message??'Could not load leaderboard'})
  }
  const titles:Record<string,[string,string]>={make:['Create game','Choose the game details, then share its four-letter code.'],join:['Find a game','Join an open game or use an invite code.'],continue:['Continue game','Pick up where you left off. Finished games stay available for review.'],local:['Local play','Play together on one device.'],settings:['Settings','Make 5D Chess your own.'],notifications:['Notifications','Updates from your games and ratings.']}
  const renderView=(view:string)=>{
    if(!['home',...Object.keys(titles)].includes(view))view='home'
    document.querySelectorAll<HTMLElement>('.lobby-view').forEach(v=>v.hidden=v.id!==view)
    el('flow-header').hidden=view==='home'
    if(titles[view]){el('flow-title').textContent=titles[view][0];el('flow-description').textContent=titles[view][1]}
    if(view==='make'){el<HTMLSelectElement>('game-players').value=String(count);el<HTMLSelectElement>('game-movement').value=movement}
    if(view==='local'){el<HTMLSelectElement>('local-movement').value=movement;updateLocalLinks()}
    document.title=`${view==='home'?'Home':titles[view][0]} · 5D Chess`
  }
  const showView=(view:string)=>{location.hash=view==='home'?'':view;renderView(view);window.scrollTo({top:0})}
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{
    if(b.dataset.view==='continue'&&place==='local'){location.href=localURL();return}
    if(b.dataset.view==='notifications'){openNotifications(b);return}
    showView(b.dataset.view!)
    if(['continue','join'].includes(b.dataset.view!))void loadGames().catch(cause=>error('lobby-error',cause.message))
  })
  window.addEventListener('hashchange',()=>renderView(location.hash.slice(1)||'home'))
  document.querySelectorAll<HTMLButtonElement>('[data-place]').forEach(b=>b.onclick=()=>{place=b.dataset.place as typeof place;updateChoices()})
  document.querySelectorAll<HTMLButtonElement>('[data-players]').forEach(b=>b.onclick=()=>{count=Number(b.dataset.players) as typeof count;updateChoices()})
  document.querySelectorAll<HTMLButtonElement>('[data-movement]').forEach(b=>b.onclick=()=>{movement=b.dataset.movement as Movement;updateChoices()})
  el('find-game').onclick=()=>{if(place==='local')location.href=localURL();else{showView('join');void loadGames().catch(cause=>error('lobby-error',cause.message))}}
  el('local-movement').onchange=updateLocalLinks
  el('show-all-games').onclick=()=>{showAll=true;renderGames()}
  for(const id of ['read-all','read-all-page'])el(id).onclick=()=>void markRead().catch(cause=>error('lobby-error',cause.message))
  el('rating-info').onclick=()=>el<HTMLDialogElement>('rating-dialog').showModal()
  el('close-rating-info').onclick=()=>el<HTMLDialogElement>('rating-dialog').close()
  const busy=async(formId:string,pending:string,work:()=>Promise<void>)=>{
    const button=el<HTMLFormElement>(formId).querySelector<HTMLButtonElement>('button[type="submit"]')!
    if(button.disabled)return
    const label=button.textContent;button.disabled=true;button.textContent=pending
    try{await work()}finally{button.disabled=false;button.textContent=label}
  }
  el<HTMLSelectElement>('game-players').onchange=()=>{count=Number(el<HTMLSelectElement>('game-players').value) as typeof count;updateChoices()}
  el<HTMLSelectElement>('game-movement').onchange=()=>{movement=el<HTMLSelectElement>('game-movement').value as Movement;updateChoices()}
  el<HTMLFormElement>('make-form').onsubmit=event=>{event.preventDefault();void busy('make-form','Creating…',async()=>{
    error('make-error','')
    try{
      const password=el<HTMLInputElement>('game-password').value
      const result=await api<{code:string}>('/games',{title:el<HTMLInputElement>('game-title').value.trim()||`${profile.name}'s game`,playerCount:Number(el<HTMLSelectElement>('game-players').value),movement:el<HTMLSelectElement>('game-movement').value,password})
      online(result.code)
    }catch(cause){error('make-error',cause instanceof Error?cause.message:'Could not create game')}
  })}
  el<HTMLFormElement>('join-form').onsubmit=event=>{event.preventDefault();void busy('join-form','Joining…',async()=>{
    error('join-error','');const code=el<HTMLInputElement>('join-code').value.trim().toUpperCase()
    try{await api(`/games/${code}/join`,{password:el<HTMLInputElement>('join-password').value});online(code)}catch(cause){error('join-error',cause instanceof Error?cause.message:'Could not join game')}
  })}
  el<HTMLFormElement>('quick-join-form').onsubmit=event=>{event.preventDefault();void busy('quick-join-form','Joining…',async()=>{
    error('quick-error','');const code=el<HTMLInputElement>('quick-code').value.trim().toUpperCase()
    try{await api(`/games/${code}/join`,{});online(code)}catch(cause){
      if(cause instanceof ApiError&&cause.status===403){showView('join');el<HTMLInputElement>('join-code').value=code;el('join-password').focus();error('join-error','This game needs its password.')}else error('quick-error',cause instanceof Error?cause.message:'Could not join game')
    }
  })}
  el<HTMLSelectElement>('setting-players').value=String(profile.settings.players)
  el<HTMLSelectElement>('setting-movement').value=profile.settings.movement
  el<HTMLInputElement>('setting-notifications').checked=profile.settings.moveNotifications
  el<HTMLFormElement>('settings-form').onsubmit=event=>{event.preventDefault();void busy('settings-form','Saving…',async()=>{
    error('settings-error','');el('settings-status').hidden=true
    try{
      const result=await api<{profile:Profile}>('/settings',{movement:el<HTMLSelectElement>('setting-movement').value,players:Number(el<HTMLSelectElement>('setting-players').value),moveNotifications:el<HTMLInputElement>('setting-notifications').checked})
      profile=result.profile;renderAccount(profile);void loadNotices().catch(cause=>error('lobby-error',cause.message));el('settings-status').textContent='Settings saved.';el('settings-status').hidden=false
    }catch(cause){error('settings-error',cause instanceof Error?cause.message:'Could not save settings')}
  })}
  updateChoices();renderView(location.hash.slice(1)||'home')
  const refresh=async()=>{
    const results=await Promise.allSettled([loadGames(),loadNotices(),loadLeaderboard(),refreshRating()])
    const failure=results.find(r=>r.status==='rejected')
    if(failure?.status==='rejected')error('lobby-error',failure.reason instanceof Error?failure.reason.message:'Some updates could not be loaded.')
    else error('lobby-error','')
  }
  const codeInput=el<HTMLInputElement>('quick-code')
  codeInput.addEventListener('input',()=>{codeInput.value=codeInput.value.replace(/[^a-z]/gi,'').slice(0,4).toUpperCase();document.querySelectorAll('.slot-display b').forEach((b,i)=>{b.textContent=codeInput.value[i]||'_';b.classList.toggle('filled',!!codeInput.value[i])})})
  const loadDeals=async()=>{const data=await api<Economy>('/economy');el('home-daily-deals').innerHTML=data.dailyDeals.map(d=>{const item=itemById(d.itemId)!;return `<a class="home-deal" href="/chess/collection.html#shop">${itemArt(item,48)}<span><strong>${item.name}</strong><small><s>${d.originalPrice}</s> ${d.price} coins</small></span></a>`}).join('')}
  void loadDeals().catch(()=>{el('home-daily-deals').textContent='Deals unavailable. Visit the shop to retry.'})
  window.setInterval(()=>{if(document.visibilityState==='visible')void loadDeals().catch(()=>{})},60000)
  void initDailySpin()
  await refresh()
  window.setInterval(()=>{if(document.visibilityState==='visible')void refresh()},15000)
}
if(document.body.dataset.page==='login')void login()
if(document.body.dataset.page==='lobby')void lobby()
