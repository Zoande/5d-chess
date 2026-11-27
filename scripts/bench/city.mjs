// CPU and wire workload with a reproducible simulation clock (no sleeps or external services).
import {ChessStore} from '../../server/storage.ts'
import {CityWorlds} from '../../server/world.ts'
import {RouletteHall} from '../../server/roulette-hall.ts'
import {pack} from '../../server/city-inventory.ts'

const percentile=(values,p)=>values.toSorted((a,b)=>a-b)[Math.ceil(values.length*p)-1]
export async function benchmark(encode=view=>JSON.stringify(view),live=false){
  for(const count of [2,10,50]){
    const store=new ChessStore('.',{memory:true}),hall=new RouletteHall(store),city=new CityWorlds(store,hall)
    hall.stop()
    const update=live?city.command.bind(city):city.update.bind(city)
    const names=Array.from({length:count},(_,i)=>'Bench'+i)
    const start=Date.UTC(2026,10,26,11)
    store.transaction(tx=>names.forEach((name,i)=>{
      const a={name,hash:'',salt:'',wallet:{coins:100,starterGranted:true,inventory:[],loadout:{pieces:{},icon:'default'}}}
      tx.users.add(name,a)
      if(i===0)Object.assign(pack(a),{stars:1,remaining:600000})
    }))
    let writes=0,bytes=0
    const transaction=store.transaction.bind(store)
    store.transaction=work=>{writes++;return transaction(work)}
    const positions=names.map((n,i)=>update(n,'teleport',{scene:true,to:i===count-1?'kfc':'city'},start))
    const timings=[]
    for(let frame=1;frame<=60;frame++){
      const now=start+frame*200,t=performance.now()
      city.step?.(now)
      names.forEach((n,i)=>{
        const old=positions[i],p=old.you
        const view=update(n,'presence',{scene:true,world:old.id,zone:p.zone,x:p.x+Math.sin(frame*.15+i)*.12,z:p.z,yaw:frame*.04},now)
        positions[i]=view;bytes+=Buffer.byteLength(encode(view,n,frame,count))
      })
      timings.push(performance.now()-t)
    }
    console.log(JSON.stringify({players:count,frames:timings.length,stepMsP50:+percentile(timings,.5).toFixed(2),stepMsP95:+percentile(timings,.95).toFixed(2),
      bytesPerPlayerSecond:Math.round(bytes/count/12),writeTransactions:writes}))
    store.close()
  }
}
if(import.meta.main)await benchmark()
