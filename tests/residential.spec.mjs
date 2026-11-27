import {observeWire,commandResult} from './live-wire.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {chromium} from 'playwright'
import {ChessStore} from '../server/storage.ts'
import {createApplication} from '../server/application.ts'
import {pack,carry} from '../server/city-inventory.ts'
import {cityRoute} from '../server/city-life.ts'
import {CITY_DAY_MS} from '../src/world/city-residents.ts'
import {BUILDINGS,buildingById,contains,homeZone,residentialSite,residentialStep} from '../src/world/residential.ts'
import {UNITS} from '../src/world/housing.ts'
import {site} from '../src/world/model.ts'
import {COUNTERS} from '../src/world/restaurant-model.ts'

test('residential walkthrough through both buildings, house styles, furniture and takeaway storage', {timeout:660_000},async()=>{
  const out=process.env.RESIDENTIAL_SCREENSHOTS
  if(out)await mkdir(out,{recursive:true})
  const realNow=Date.now,startedAt=Math.floor(realNow()/CITY_DAY_MS)*CITY_DAY_MS
  let offset=0
  Date.now=()=>startedAt+offset
  const store=new ChessStore('.', {memory:true}), app=createApplication(store),server=app.createServer()
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  let browser,current
  try{
    const base='http://127.0.0.1:'+server.address().port
    browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
    const context=await browser.newContext({viewport:{width:960,height:668},reducedMotion:'reduce'}),errors=[]
    const name='ResidentialTest'
    assert.equal((await context.request.post(base+'/api/signup',{data:{username:name,password:'fixture',confirm:'fixture'}})).status(),201)
    const keys=UNITS.filter(u=>u.tenure!=='resident').map(u=>u.id)
    store.transaction(tx=>tx.putMetadata('cityDeeds',Object.fromEntries(keys.map(id=>[id,{holder:name,until:0}]))))
    store.transaction(tx=>carry(pack(tx.users.get(name)),'cash',12))
    async function action(path,data={}){
      offset+=35
      const response=await context.request.post(base+'/api/world/'+path,{data:{scene:true,...data}})
      const result=await response.json()
      assert.ok(response.ok(),path+' '+JSON.stringify(data)+' '+result.error)
      current=result
      return result
    }
    async function walk(x,z,yaw=0,reroute=false){
      let stalled=0
      for(let i=0;i<85;i++){
        offset+=900
        const {x:beforeX,z:beforeZ}=current.you
        await action('presence',{x,z,yaw,world:current.id})
        if(Math.hypot(current.you.x-x,current.you.z-z)<.034)return true
        stalled=Math.hypot(current.you.x-beforeX,current.you.z-beforeZ)<.02?stalled+1:0
        if(reroute&&stalled===5)return false
      }
      assert.fail('Blocked walking to '+[x,z]+' from '+JSON.stringify(current.you))
    }
    async function outdoors(destination){
      for(let attempt=0;attempt<12;attempt++){
        const waypoints=cityRoute(current.you,destination,attempt?current.traffic.vehicles:[])
        assert.ok(waypoints.length,'property connects to the pedestrian network')
        let arrived=true
        for(const p of waypoints)if(!await walk(p.x,p.z,0,true)){arrived=false;break}
        if(arrived)return
      }
      assert.fail('No clear walk to '+JSON.stringify(destination)+' from '+JSON.stringify(current.you))
    }
    async function local(b,x,z,yaw=0){
      const p=residentialSite(b,x,z)
      await walk(p.x,p.z,yaw+(b.facing<0?Math.PI:0))
    }
    async function capture(label,check){
      if(!out&&!check)return
      const page=await context.newPage();observeWire(page)
      page.on('pageerror',e=>errors.push(e.message))
      try{
        await page.goto(base+'/chess/world.html')
        await page.locator('#world-canvas[data-zone="'+current.you.zone+'"]').waitFor({timeout:42_000})
        if(out&&label==='04-resting')await page.screenshot({path:join(out,label+'.jpg'),type:'jpeg',timeout:55_000})
        if(check)await check(page)
        if(out&&label!=='04-resting')await page.screenshot({path:join(out,label+'.jpg'),type:'jpeg',timeout:55_000})
      }finally{await page.close()}
      await action('presence')
    }
    async function path(b,level,goal){
      offset+=400
      await action('presence')
      const grid=.15,zone=homeZone(b.id,level),key=(x,z)=>x+','+z
      const ox=(current.you.x-b.x)*b.facing,oz=(current.you.z-b.z)*b.facing
      const gx=Math.round(ox/grid),gz=Math.round(oz/grid)
      const walkable=(x,z)=>{
        const p=residentialSite(b,x*grid,z*grid)
        return residentialStep(zone,p.x,p.z,keys,current.residential,current.now)===zone
      }
      const [sx,sz]=[-1,0,1].flatMap(x=>[-1,0,1].map(z=>[gx+x,gz+z]))
        .sort((a,b)=>Math.hypot(a[0]*grid-ox,a[1]*grid-oz)-Math.hypot(b[0]*grid-ox,b[1]*grid-oz))
        .find(p=>walkable(...p))??[gx,gz]
      const parent=new Map(),nodes=[[sx,sz]],visited=new Set([key(sx,sz)])
      const unit=b.levels[level].units.find(u=>u.id===goal.unit)
      let route=[]
      for(let k=0;k<nodes.length;k++){
        const [x,z]=nodes[k]
        if((!unit||contains(unit.rect,x*grid,z*grid))&&(goal.rect?contains(goal.rect,x*grid,z*grid):Math.hypot(x*grid-goal.x,z*grid-goal.z)<(goal.range??.23))){
          for(let step=[x,z];step;step=parent.get(key(...step)))route.unshift(step)
          break
        }
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const next=[x+dx,z+dz],code=key(...next)
          if(visited.has(code))continue
          visited.add(code)
          if(walkable(...next)){nodes.push(next);parent.set(code,[x,z])}
        }
      }
      assert.ok(route.length,b.id+' path from '+[ox,oz]+' to '+JSON.stringify(goal))
      await local(b,sx*grid,sz*grid)
      for(let i=1;i<route.length;i++){
        const [x,z]=route[i],prior=route[i-1],next=route[i+1]
        if(!next||next[0]-x!==x-prior[0]||next[1]-z!==z-prior[1])await local(b,x*grid,z*grid,goal.yaw??0)
      }
    }

    await action('teleport',{to:'kfc'})
    const register=site('kfc',COUNTERS[0],-.55)
    await walk(register.x,register.z)
    await action('use',{target:'kfc:menu:0'})
    await capture('01-takeaway-order',async page=>{
      await page.getByRole('button',{name:'Add Krull burger'}).click()
      await page.getByRole('button',{name:'Add Soda'}).click()
      await page.getByRole('button',{name:'Takeaway',exact:true}).click()
      await page.getByRole('button',{name:'Place order'}).click()
      await page.getByText('The kitchen is preparing your takeaway.',{exact:true}).first().waitFor()
    })
    for(let i=0;i<28;i++){offset+=1000;await action('presence')}
    assert.equal(current.restaurant.meal?.status,'served')
    await action('use',{target:'kfc:collect'})
    await capture('02-collect-takeaway',async page=>{
      await page.getByRole('button',{name:'Collect order'}).click()
      await page.locator('#world-service').waitFor({state:'hidden'})
    })
    async function checkDrawer(b,level,id){
      const drawer=b.levels[level].points.find(p=>p.unit===id&&p.id.startsWith('drawer:'))
      await path(b,level,{...drawer,range:.65})
      await action('use',{target:drawer.id})
      await capture(id+'-drawer',async page=>{
        await page.getByRole('button',{name:/Put away Cash/}).click()
        await page.getByRole('button',{name:/Take Cash/}).click()
        await page.getByRole('button',{name:/Take Cash/}).waitFor({state:'detached'})
      })
    }
    for(const b of BUILDINGS.slice(0,2)){
      await action('teleport',{to:'city'})
      await outdoors(residentialSite(b,0,b.rect.f+1.02))
      await action('use',{target:'door:'+b.id+'-street'})
      offset+=400
      await local(b,0,3.5,-.67)
      await capture(b.id+'-reception')
      if(b.block===0){
        const chair=b.levels[0].points.find(p=>p.pose?.kind==='sit'&&p.id.includes('lobby-2'))
        await path(b,0,{...chair,range:.42})
        await capture('05-lobby-seating',async page=>{
          await page.getByRole('button',{name:/Sit down/}).click()
          await page.getByRole('button',{name:/Stand up/}).waitFor()
          assert.equal((await action('presence')).you.homePose.kind,'sit')
          await page.getByRole('button',{name:/Stand up/}).click()
          await page.getByRole('button',{name:/Stand up/}).waitFor({state:'hidden'})
        })
        await path(b,0,{x:5.6,z:1.25})
      }
      await local(b,6.65,1.25);await local(b,b.lift.x,1.25)
      // Each building is a separate public lobby and cabin.
      await local(b,b.lift.x,b.lift.z)
      await action('use',{target:'lift:'+b.id})
      await capture(b.id+'-elevator',async page=>{
        const depart=commandResult(page,'home-floor')
        await page.getByRole('button',{name:'1',exact:true}).click()
        await depart
        offset+=3100
        await page.locator('#world-canvas[data-zone="'+homeZone(b.id,1)+'"]').waitFor()
      })
      assert.equal(current.you.zone,homeZone(b.id,1))
      offset+=600
      await local(b,b.lift.x,.31)
      const s=b.stairs,dz=s.back-s.front
      await local(b,s.x-s.width/2,s.front-.42)
      await local(b,s.x-s.width/2,s.front+dz*.51,Math.PI)
      await capture(b.id+'-stairs',async page=>{
        const start=current.you.z
        const clock=setInterval(()=>{offset+=120},110)
        try{
          await page.evaluate(()=>new Promise(resolve=>{
            const move=type=>window.dispatchEvent(new KeyboardEvent(type,{key:'w'}))
            move('keydown')
            setTimeout(()=>{move('keyup');resolve()},400)
          }))
          for(let i=0;i<12;i++){
            if((await action('presence')).you.z>start+.25)break
            await page.waitForTimeout(180)
          }
          assert.ok(current.you.z>start+.25,'keyboard movement advances on the staircase')
        }finally{clearInterval(clock)}
        assert.match(current.you.zone,/^stairs:/)
      })
      await local(b,s.x-s.width/2,s.front+dz*.90)
      await local(b,s.x+s.width/2,s.front+dz*.90)
      await local(b,s.x+s.width/2,s.front-.44)
      assert.equal(current.you.zone,homeZone(b.id,2))
      const floor=b.levels[2]
      for(const [index,u] of floor.units.entries()){
        const entrance=floor.doors.find(d=>d.id===u.id)
        await path(b,2,{x:entrance.x,z:entrance.z+.64})
        await action('use',{target:'door:'+u.id})
        offset+=400
        await local(b,entrance.x,entrance.z-.46)
        if(b.block===0||index===2)await capture(b.id+'-'+index+'-living')
        for(const d of floor.doors.filter(d=>d.id.startsWith(u.id+'-')).sort((a,b)=>Number(b.id.endsWith('-kitchen'))-Number(a.id.endsWith('-kitchen')))){
          await path(b,2,{...d,range:.94})
          await action('use',{target:'door:'+d.id})
        }
        if(b.block===0&&index===0)await checkDrawer(b,2,u.id)
        const fridge=floor.points.find(p=>p.unit===u.id&&p.id.startsWith('fridge:'))
        await path(b,2,{...fridge,range:.69,yaw:Math.PI/2})
        if(b.block===0&&index===0){
          await action('use',{target:fridge.id})
          await capture('03-fridge-deposit',async page=>{
            await page.locator('[data-food-item="cola"]').first().getByRole('button',{name:'Store all'}).click()
            await page.locator('[data-food-item="cola"]').last().getByText('×1').waitFor()
            await page.getByRole('button',{name:'Close',exact:true}).click()
          })
        }else await capture(b.id+'-'+index+'-kitchen')
        for(const tile of floor.tiles.filter(t=>t.kind==='bath'&&contains(u.rect,(t.rect.l+t.rect.r)/2,(t.rect.b+t.rect.f)/2))){
          await path(b,2,{rect:tile.rect,unit:u.id,yaw:Math.PI/2})
          if(b.block===0)await capture(b.id+'-'+index+'-bath')
        }
        for(const [j,bed] of floor.points.filter(p=>p.unit===u.id&&p.pose?.kind==='rest').entries()){
          await path(b,2,{...bed,range:.43,yaw:Math.PI/2})
          if(b.block===1&&j===0||b.block===0&&index===2)await capture(b.id+'-'+index+'-bedroom-'+j)
          await action('use',{target:bed.id})
          assert.equal(current.you.homePose.kind,'rest')
          if(index===0&&b.block===0)await capture('04-resting',async page=>{
            await page.getByRole('button',{name:/Get up/}).click()
            await page.getByRole('button',{name:/Get up/}).waitFor({state:'hidden'})
          })
          if(current.you.homePose)await action('stand-scenery')
          assert.equal(current.you.homePose,undefined)
        }
      }
    }
    for(const index of [0,2,5,6]){
      const b=buildingById.get('house-'+index),front=residentialSite(b,0,b.rect.f+.74)
      await action('teleport',{to:'city'})
      await outdoors(front)
      await action('use',{target:'door:'+b.id})
      await local(b,0,2.69)
      await capture(b.id+'-interior')
      const s=b.stairs
      if(s){
        await local(b,s.x-s.width/2,s.front+.43)
        await local(b,s.x-s.width/2,s.front+(s.back-s.front)*.9)
        await local(b,s.x+s.width/2,s.front+(s.back-s.front)*.9)
        await local(b,s.x+s.width/2,s.front+.43)
        assert.equal(current.you.zone,homeZone(b.id,1))
      offset+=600
        await capture(b.id+'-upstairs')
      }
      const floor=b.levels[s?1:0]
      for(const d of floor.doors.filter(d=>d.id!==b.id).sort((a,b)=>Number(b.id.endsWith('-kitchen'))-Number(a.id.endsWith('-kitchen')))){
        await path(b,s?1:0,{...d,range:.99})
        await action('use',{target:'door:'+d.id})
      }
      if(index===2)await checkDrawer(b,0,b.id)
      for(const bed of floor.points.filter(p=>p.pose?.kind==='rest')){
        await path(b,s?1:0,{...bed,range:.49,yaw:Math.PI/2})
        await action('use',{target:bed.id})
        await action('stand-scenery')
      }
    }
    assert.deepEqual(errors,[])
  }finally{
    Date.now=realNow
    app.drain()
    await browser?.close()
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})
    store.close()
  }
})
