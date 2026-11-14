import {api,getSession,initShell} from './shell.ts'
import {framedAvatar} from './cosmetic-art.ts'
interface Player {name:string;avatar:string;frame?:string;rating:number;games:number;rank:number}
interface Rankings {players:Player[];me:{rating:number;rank:number;games:number}}
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
let rows:Player[]=[],page=0,name=''
function render(){
 const search=el<HTMLInputElement>('leaderboard-search').value.trim().toLocaleLowerCase(),filtered=rows.filter(p=>p.name.toLocaleLowerCase().includes(search)),pages=Math.max(1,Math.ceil(filtered.length/100));page=Math.min(page,pages-1)
 const table=document.createElement('table');table.innerHTML='<thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Rated games</th><th scope="col">Elo</th></tr></thead><tbody></tbody>'
 for(const p of filtered.slice(page*100,(page+1)*100)){
  const row=document.createElement('tr');row.classList.toggle('self',p.name===name);row.innerHTML=`<td></td><td><span class="rank-player"><span class="small-avatar">${framedAvatar(p.avatar,p.frame)}</span><strong></strong></span></td><td></td><td></td>`
  row.cells[0].textContent=String(p.rank);row.querySelector('strong')!.textContent=p.name;row.cells[2].textContent=String(p.games);row.cells[3].textContent=String(p.rating);table.tBodies[0].append(row)
 }
 el('full-ranking-table').replaceChildren(table);if(!filtered.length){const empty=document.createElement('p');empty.className='card-empty';empty.textContent='No players match your search.';el('full-ranking-table').append(empty)}
 el('leaderboard-count').textContent=`${filtered.length} ${filtered.length===1?'player':'players'}${search?' found':''} · ${rows.length} total`
 el('ranking-page').textContent=`Page ${page+1} of ${pages}`;el<HTMLButtonElement>('ranking-prev').disabled=page===0;el<HTMLButtonElement>('ranking-next').disabled=page>=pages-1
}
async function init(){await initShell();const session=await getSession();if(!session.user){location.replace('/chess/login.html');return}name=session.user;const data=await api<Rankings>('/leaderboard/full');rows=data.players;el('leaderboard-self').textContent=`Your Elo: ${data.me.rating} · #${data.me.rank}`;render();el('leaderboard-search').oninput=()=>{page=0;render()};el('ranking-prev').onclick=()=>{page--;render()};el('ranking-next').onclick=()=>{page++;render()}}
void init().catch(cause=>{el('leaderboard-error').textContent=cause instanceof Error?cause.message:'Could not load leaderboard';el('leaderboard-error').hidden=false})
