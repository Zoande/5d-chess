import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from 'playwright'
import {EFFECT_ITEMS} from '../src/effects.ts'
import {mkdir} from 'node:fs/promises'

test('all movement/capture recipes render distinctly, including Classic and Live board resolution',async t=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.setContent('<style>html,body{margin:0;background:#192019;color:#dfd7ba}canvas{width:1200px;height:750px}#minimap{display:none}</style><canvas id="scene" width="1200" height="750"></canvas>')
 const bundle=await build({stdin:{contents:`import {drawMovement,drawCapture} from './src/effects.ts';import {drawPiece,setCosmetics} from './src/art.ts';import {Scene} from './src/scene.ts';import {initialState,index} from './src/model.ts';import {legalMoves} from './src/moves.ts';import {resolveRound} from './src/resolve.ts';
 const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
 window.paint=id=>{ctx.clearRect(0,0,1200,750);if(id.startsWith('movement'))drawMovement(ctx,id,[{x:100,y:100},{x:230,y:100}],{x:230,y:100},.6,(x,y,a)=>{ctx.save();ctx.globalAlpha=a;drawPiece(ctx,'N','red',x,y,32);ctx.restore()});else drawCapture(ctx,id,{x:200,y:100},.45,()=>drawPiece(ctx,'N','blue',0,0,32));return canvas.toDataURL()};
 let scene;window.board=(movement,capture,mode)=>{const s=initialState(2,mode,['red','yellow']),cells=Array(196).fill(null);for(const [x,y,player,kind]of [[3,10,'red','K'],[7,5,'red','R'],[7,3,'yellow','N'],[9,4,'yellow','K']])cells[index({x,y})]={player,kind,moved:true};s.universes[0].boards[0].cells=cells;const m=legalMoves(s,{x:7,y:5,u:0,t:0},{x:7,y:3,u:0,t:0})[0];if(!m)throw Error('No fixture capture');const r=resolveRound(s,[m],{partial:true});if(!r.outcomes.some(o=>o.captures.length))throw Error('No fixture outcome');setCosmetics({red:{icon:'default',pieces:{},movement,capture}});scene??=new Scene(canvas,r.state,{pick(){},hover(){},scale(){},describe(){},rift(){}});scene.update({state:r.state,moves:[],queued:[],animation:{outcomes:r.outcomes,started:performance.now()-600,duration:1000,result:r.state,travel:r.travel,ticks:r.ticks}});return {captures:r.outcomes.reduce((n,o)=>n+o.captures.length,0),travel:!!r.travel}};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',write:false});await page.addScriptTag({content:bundle.outputFiles[0].text})
 const images=[];for(const item of EFFECT_ITEMS)images.push(await page.evaluate(id=>window.paint(id),item.id));assert.equal(new Set(images).size,20)
 for(const mode of ['classic','live']){const result=await page.evaluate(mode=>window.board('movement-time','capture-void',mode),mode);assert.ok(result.captures>0);assert.equal(result.travel,mode==='live');await page.waitForTimeout(100);if(process.env.CASES_SCREENSHOT_DIR){await mkdir(process.env.CASES_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.CASES_SCREENSHOT_DIR+'/board-effects-'+mode+'.png'})}}
 assert.deepEqual(errors,[])
})

test('dealer performs physical payouts, expressive Elo moods and the fifth-wager exit sequence',async t=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-webgl']});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<style>html,body{margin:0;background:#030707}canvas{width:100vw;height:100vh}</style><canvas></canvas>')
 const bundle=await build({stdin:{contents:`import {DiceScene} from './src/casino/dice-scene.ts';window.dealer=new DiceScene(document.querySelector('canvas'));window.dealer.setMode('elo',50,700);window.dealer.setMood(-.8);`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',write:false});await page.addScriptTag({content:bundle.outputFiles[0].text});await page.waitForFunction(()=>Number(document.querySelector('canvas').dataset.frame)>1,{timeout:30000})
 if(process.env.CASES_SCREENSHOT_DIR)await page.screenshot({path:process.env.CASES_SCREENSHOT_DIR+'/dealer-angry.png'})
 await page.evaluate(()=>{window.dealer.reward()});await page.waitForFunction(()=>document.querySelector('canvas').dataset.reaction==='payout');await page.waitForFunction(()=>document.querySelector('canvas').dataset.reaction==='idle',{timeout:30000});assert.equal(await page.evaluate(()=>window.dealer.diagnostics().coinOwner),'purse')
 await page.evaluate(()=>{window.dealer.setMood(.9);window.dealer.banish()});await page.waitForFunction(()=>document.querySelector('canvas').dataset.cutscene==='banish',{timeout:30000});await page.waitForFunction(()=>document.querySelector('canvas').dataset.reaction==='idle',{timeout:30000});await page.evaluate(()=>{window.dealer.setMode('normal');window.dealer.dispose()});assert.deepEqual(errors,[])
})
