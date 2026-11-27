import assert from 'node:assert/strict'
import {readdir} from 'node:fs/promises'
import test from 'node:test'
import {chromium} from 'playwright'
import {createApplication} from '../server/application.ts'
import {CityLife} from '../server/city-life.ts'
import {ChessStore} from '../server/storage.ts'

test('turning from a quiet street toward city lights reuses prepared shaders', {timeout:105_000},async()=>{
  const store=new ChessStore('.',{memory:true}),app=createApplication(store),server=app.createServer()
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  let browser
  try{
    const base='http://127.0.0.1:'+server.address().port
    const chunk=(await readdir('dist/chess/chunks')).find(name=>/^stage-.*\.js$/.test(name))
    assert.ok(chunk)
    browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
    const page=await browser.newPage({viewport:{width:640,height:448}}),errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    page.on('console',entry=>{if(entry.type()==='error')errors.push(entry.text())})
    await page.route('**/chess/world.js',route=>route.fulfill({contentType:'text/javascript',body:''}))
    await page.goto(base+'/chess/world.html')
    const now=14*150_000,position={x:-34,z:12,yaw:Math.PI}
    const view={id:'render',now,coins:0,caveOpen:true,players:[],
      you:{name:'Walker',avatar:'default',online:true,zone:'city',...position},
      housing:{keys:[],occupied:[],expires:{}},residential:{doors:{},lifts:{}},...new CityLife(now).snapshot(position,now)}
    const result=await page.evaluate(async({url,view})=>{
      const {CityStage}=await import(url)
      const stage=new CityStage(document.querySelector('#world-canvas'),document.querySelector('#city-world'),()=>{})
      cancelAnimationFrame(stage.frame)
      const gl=stage.renderer.getContext(),linkProgram=gl.linkProgram.bind(gl)
      let programs=0
      gl.linkProgram=program=>{programs++;linkProgram(program)}
      const start=performance.now()
      stage.set(view,0,true)
      const deadline=performance.now()+30_000
      while(stage.preparingGraphics){
        stage.prepareGraphics(view.now)
        if(performance.now()>deadline)throw Error('City graphics did not finish preparing')
        if(stage.preparingGraphics)await new Promise(requestAnimationFrame)
      }
      stage.renderScene()
      gl.finish()
      const playableMs=performance.now()-start,initial=programs,draws=[],frames=[]
      for(const yaw of [5,6,7,0,1,2,3,4]){
        const frameStart=performance.now()
        stage.yaw=yaw*Math.PI/4
        stage.cameraView(view.now)
        stage.renderScene()
        gl.finish();frames.push(performance.now()-frameStart)
        draws.push(stage.renderer.info.render.calls)
      }
      gl.finish()
      return {playableMs,frames,initial,compiledWhileTurning:programs-initial,draws}
    },{url:base+'/chess/chunks/'+chunk,view})
    if(process.env.CITY_BENCH)console.log(JSON.stringify(result))
    assert.ok(result.initial>0)
    assert.ok(result.draws.every(count=>count>0))
    assert.ok(Math.max(...result.draws)>Math.min(...result.draws)*2)
    assert.equal(result.compiledWhileTurning,0)
    assert.deepEqual(errors,[])
  }finally{
    await browser?.close()
    server.closeAllConnections()
    await new Promise(resolve=>server.close(resolve))
    app.drain();store.close()
  }
})
