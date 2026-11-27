import {commandResult,observeWire} from './live-wire.mjs'
import {readdir} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {cityRoute} from '../server/city-life.ts'

// Observe the real stage being driven by the ordinary world client. All movement
// goes through browser controls, prediction, presence, and server collision.
export async function observeCity(page){
  observeWire(page)
  const stage=(await readdir('dist/chess/chunks')).find(f=>/^stage-.*\.js$/.test(f))
  await page.route('**/chess/world.js',async route=>{
    const response=await route.fetch()
    const observer="import {CityStage as ObservedStage} from './chunks/"+stage+"';const observedSet=ObservedStage.prototype.set;ObservedStage.prototype.set=function(...args){window.walkObservation=this;return observedSet.apply(this,args)};\n"
    await route.fulfill({response,body:observer+await response.text()})
  })
}
export function browserWalker(page,touch=false){
  let session
  async function move(points){
    await page.waitForFunction(()=>window.walkObservation&&!window.walkObservation.pause)
    if(touch){
      session??=await page.context().newCDPSession(page)
      const b=await page.locator('[data-joystick]').boundingBox()
      assert.ok(b&&b.width>15,'touch joystick visible')
      assert.ok(await page.locator('[data-joystick]').evaluate(stick=>{
        const area=stick.getBoundingClientRect()
        return stick.contains(document.elementFromPoint(area.x+area.width/2,area.y+area.height/2))
      }),'touch joystick is reachable above the inventory')
      await page.evaluate(()=>document.querySelector('[data-joystick]').addEventListener('pointerdown',e=>window.walkPointer=e.pointerId,{once:true,capture:true}))
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]})
    }
    try{return await page.evaluate(async({points,touch})=>{
      const stage=window.walkObservation,held=new Set(),stick=document.querySelector('[data-joystick]'),area=stick.getBoundingClientRect()
      function steer(x,z){
        if(touch){
          stick.dispatchEvent(new PointerEvent('pointermove',{pointerType:'touch',pointerId:window.walkPointer,clientX:area.x+area.width*(.5+x*.32),clientY:area.y+area.height*(.5+z*.32)}))
        }else{
          const keys=new Set([x>.4?'d':x<-.4?'a':'',z>.4?'s':z<-.4?'w':''].filter(Boolean))
          for(const k of held)if(!keys.has(k)){window.dispatchEvent(new KeyboardEvent('keyup',{key:k}));held.delete(k)}
          for(const k of keys)if(!held.has(k)){window.dispatchEvent(new KeyboardEvent('keydown',{key:k}));held.add(k)}
        }
      }
      try{
        for(const pt of points){
          let best=Infinity,last=performance.now()
          for(;;){
            const p=stage.position,dx=pt.x-p.x,dz=pt.z-p.z,d=Math.hypot(dx,dz)
            if(d<(touch?.13:.15)){
              steer(0,0)
              const q=stage.view.you
              if(!['station','gunshop'].includes(q.zone)&&!q.zone.startsWith('precinct:')||Math.hypot(pt.x-q.x,pt.z-q.z)<.20)break
              if(performance.now()-last>4500)return {blocked:pt,position:{...p},zone:q.zone,server:q}
              await new Promise(requestAnimationFrame)
              continue
            }
            if(d<best-.045){best=d;last=performance.now()}
            if(performance.now()-last>4500)return {blocked:pt,position:{...p},zone:stage.view.you.zone,server:stage.view.you}
            const a=stage.position.yaw
            const scale=touch?Math.max(d,.92):d
            steer((dx*Math.cos(a)-dz*Math.sin(a))/scale,(dz*Math.cos(a)+dx*Math.sin(a))/scale)
            await new Promise(requestAnimationFrame)
          }
        }
        return {done:true}
      }finally{steer(0,0)}
    },{points,touch})}
    finally{if(touch)await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
  }
  async function walk(...points){const r=await move(points);assert.ok(r.done,JSON.stringify(r))}
  async function outside(goal){
    let last
    for(let attempt=0;attempt<9;attempt++){
      const current=await page.evaluate(()=>({at:window.walkObservation.position,traffic:window.walkObservation.view.traffic?.vehicles??[]}))
      const path=cityRoute(current.at,goal,attempt?current.traffic:[])
      assert.ok(path.length)
      last=await move([...path,goal])
      if(last.done)return
    }
    assert.fail('No playable street route '+JSON.stringify({goal,last}))
  }
  async function use(id){
    if(!touch)await page.locator('#world-canvas').focus()
    const ready=id=>{
      const s=window.walkObservation,q=s.view.you
      return !s.pause&&s.nearest?.id===id&&Math.hypot(s.position.x-q.x,s.position.z-q.z)<.20
    }
    await page.waitForFunction(ready,id,{timeout:9500})
    const response=commandResult(page,'use')
    if(touch)await page.locator('[data-world-use]').tap()
    else await page.keyboard.press('e')
    const result=await response.catch(async error=>{
      const state=await page.evaluate(()=>{
        const s=window.walkObservation
        return {point:s.nearest?.id,paused:s.pause,position:s.position,server:s.view.you,dialog:document.querySelector('dialog[open]')?.id,focus:document.activeElement?.nodeName}
      })
      throw Error(id+' '+JSON.stringify(state),{cause:error})
    })
    assert.equal(result.status,200,result.message)
    assert.equal(result.request.data.target,id)
    return result
  }
  return {walk,outside,use}
}
