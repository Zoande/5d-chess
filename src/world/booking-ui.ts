import {coins,safeText} from './services.ts'
import type {WorldView} from './model.ts'
import {reportTime} from '../floor-report.ts'

export function openBooking(dialog:HTMLDialogElement,initial:WorldView,pay:(id:string)=>Promise<void>){
  const body=dialog.querySelector<HTMLElement>('.world-dialog-body')!
  body.innerHTML=`<header class="world-service-head"><div><span>MERIDIAN POLICE</span><h2 id="world-dialog-title">Booking &amp; bail</h2></div><form method="dialog"><button aria-label="Close">×</button></form></header>
    <p data-balance></p><ul class="world-ledger booking-list"></ul><p role="status" class="counter-feedback"></p>`
  const list=body.querySelector('ul')!,status=body.querySelector<HTMLElement>('[role=status]')!
  let current=initial,last='',pending=false
  function refresh(next:WorldView){
    if(!list.isConnected||next.interaction!=='booking')return
    current=next
    const rows=next.arcade?.bailRegister??[],key=JSON.stringify([rows,next.coins,pending])
    if(key===last)return
    last=key
    body.querySelector('[data-balance]')!.textContent='Your banked balance · '+coins(next.coins)
    list.innerHTML=rows.map(b=>{
      const sentence=b.price===null?'Moderation release only':b.ends===null?'Jigsaw sentence':'Until '+reportTime(b.ends)+' (Amsterdam)'
      const button=b.price===null?'':`<button type="button" class="world-primary" data-bail="${safeText(b.id)}" ${pending||next.coins<b.price?'disabled':''}>Bail (${coins(b.price)})</button>`
      return `<li><div><strong>${safeText(b.name)}</strong><span>${safeText(b.reason)}</span><small>${sentence}</small></div>${button}</li>`
    }).join('')||'<li>All cells are available.</li>'
  }
  list.onclick=async e=>{
    const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-bail]')
    const row=current.arcade?.bailRegister?.find(b=>b.id===button?.dataset.bail)
    if(!row||pending||!button||button.disabled)return
    pending=true;refresh(current)
    try{await pay(row.id);status.textContent=row.name+' was released on bail.'}
    catch(error){status.textContent=error instanceof Error?error.message:'Bail payment failed.'}
    finally{pending=false;refresh(current)}
  }
  refresh(initial)
  if(!dialog.open)dialog.showModal()
  return refresh
}
