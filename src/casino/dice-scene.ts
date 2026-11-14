import * as T from 'three'
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'
import {materials} from './scene/materials.ts'
import {box,mesh,cylinder,dice,resultRotation,v} from './scene/geometry.ts'
import {People} from './scene/rig.ts'
import {Table,type TableAction} from './scene/table.ts'

export type {TableAction} from './scene/table.ts'
export type DicePhase='idle'|'exchange'|'ready'|'rolling'|'result'
const smooth=(t:number)=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t)}
function track(t:number,keys:Array<[number,T.Vector3]>){
 for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return keys[i-1][1].clone().lerp(keys[i][1],smooth((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])))
 return keys.at(-1)![1].clone()
}
export class DiceScene {
 readonly world=new T.Scene()
 readonly camera=new T.PerspectiveCamera(62,1,.035,25)
 readonly table:Table
 private renderer:T.WebGLRenderer
 private people:People
 private die:T.Group
 private wager=new T.Group()
 private environment:T.WebGLRenderTarget
 private candles:T.PointLight[]=[]
 private phase:DicePhase='idle'
 private began=0;private duration=1;private finish:(()=>void)|undefined
 private ticker=0;private previous=0;private drawn=0;private frame=0;private disposed=false
 private yaw=0;private pitch=0;private lookYaw=0;private lookPitch=0
 private drag=new T.Vector2()
 private raycaster=new T.Raycaster()
 private resize:ResizeObserver
 private coinOwner='table';private dieOwner='keeper'
 private result=1;private coins=0;private stake=100;private face=1;private disabled=false
 private startPosition=v();private landing=v();private startRotation=new T.Quaternion()
 private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
 private fence:WebGLSync|null=null
 private mode:'normal'|'offer'|'elo'='normal';private cameraLocked=false;private speech:T.Sprite;private speechMap:T.CanvasTexture;private speechCanvas:HTMLCanvasElement;private speechUntil=0;private haze:T.ShaderMaterial[]=[]
 constructor(private canvas:HTMLCanvasElement){
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'})
  const glContext=this.renderer.getContext(),debug=glContext.getExtension('WEBGL_debug_renderer_info')
  const software=debug&&/swiftshader|llvmpipe|software/i.test(String(glContext.getParameter(debug.UNMASKED_RENDERER_WEBGL)))
  this.renderer.setPixelRatio(software?.45:Math.min(devicePixelRatio||1,1.5));this.renderer.setClearColor(0x030707)
  this.renderer.shadowMap.enabled=!software;this.renderer.shadowMap.type=T.PCFSoftShadowMap
  this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;this.renderer.outputColorSpace=T.SRGBColorSpace
  this.world.background=new T.Color(0x030707);this.world.fog=new T.FogExp2(0x040909,.135)
  const generator=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment()
  this.environment=generator.fromScene(room,.06);this.world.environment=this.environment.texture;this.world.environmentIntensity=.16;room.dispose();generator.dispose()
  const m=materials();this.table=new Table(this.world,m);this.people=new People(this.world,m);this.die=dice(m);this.world.add(this.die);this.die.scale.setScalar(.65)
  for(let i=0;i<5;i++){const coin=mesh(this.table.coin,m.gold,this.wager,[0,i*.01,0]);coin.rotation.y=i*.38}this.wager.visible=false;this.world.add(this.wager)
  this.speechCanvas=document.createElement('canvas');this.speechCanvas.width=1024;this.speechCanvas.height=256;this.speechMap=new T.CanvasTexture(this.speechCanvas);this.speechMap.colorSpace=T.SRGBColorSpace
  this.speech=new T.Sprite(new T.SpriteMaterial({map:this.speechMap,transparent:true,depthWrite:false,fog:false}));this.speech.position.set(0,1.98,-.82);this.speech.scale.set(1.22,.305,1);this.speech.visible=false;this.world.add(this.speech)
  for(const [z,density] of [[-.83,.19],[-1.74,.13]]){
   const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},density:{value:density}},vertexShader:'varying vec2 uvFog;void main(){uvFog=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 uvFog;uniform float time;uniform float density;void main(){vec2 p=uvFog;float edge=smoothstep(0.,.17,p.x)*smoothstep(0.,.17,1.-p.x)*smoothstep(0.,.16,p.y)*smoothstep(0.,.18,1.-p.y);float wisps=.73+.12*sin(p.x*17.+p.y*9.+time*.11)+.10*sin(p.y*21.-p.x*11.-time*.08);gl_FragColor=vec4(.018,.030,.030,edge*wisps*density);}'})
   const veil=mesh(new T.PlaneGeometry(4.5,2.8),material,this.world,[0,1.4,z],false);veil.renderOrder=2;this.haze.push(material)
  }
  const floor=mesh(new T.PlaneGeometry(12,12),m.wood,this.world,[0,0,0]);floor.rotation.x=-Math.PI/2
  for(const side of [-1,1]){
   box(this.world,[.13,3.1,6],[side*2.65,1.5,-.2],m.ebony)
   for(let i=0;i<6;i++){box(this.world,[.018,1.9,.023],[side*2.55,1.23,-2.3+i*.77],m.darkGold,.004);box(this.world,[.025,.025,.6],[side*2.54,.40,-2.0+i*.77],m.wood,.008)}
  }
  box(this.world,[5.4,3.1,.14],[0,1.5,-2.8],m.ebony)
  for(let i=-3;i<=3;i++)box(this.world,[.016,2.35,.02],[i*.61,1.3,-2.70],m.darkGold,.003)
  const pendant=mesh(new T.ConeGeometry(.36,.24,48,1,true),m.ebony,this.world,[0,2.58,-.05]);pendant.rotation.x=Math.PI
  cylinder(this.world,.05,.035,[0,2.46,-.05],m.brass)
  const light=new T.SpotLight(0xffdfaa,37,7,.70,.62,2);light.position.set(0,2.44,-.05);light.target.position.set(0,.85,-.05);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.bias=-.0002;light.shadow.normalBias=.012;light.shadow.camera.near=.1;light.shadow.camera.far=6;this.world.add(light,light.target)
  this.world.add(new T.HemisphereLight(0xabc5c1,0x171b15,.14))
  const rim=new T.PointLight(0x688d91,.45,2.4,2);rim.position.set(.1,1.9,-1.85);this.world.add(rim)
  for(const side of [-1,1]){
   const x=side*1.08,z=-.57;cylinder(this.world,.095,.018,[x,.916,z],m.brass)
   cylinder(this.world,.033,.21,[x,1.025,z],m.wax)
   const drips=mesh(new T.TorusGeometry(.032,.004,6,24),m.wax,this.world,[x,1.10,z]);drips.rotation.x=Math.PI/2
   cylinder(this.world,.002,.025,[x,1.14,z],m.ink,6)
   const flameMaterial=new T.MeshBasicMaterial({color:0xffcf79,transparent:true,opacity:.86,depthWrite:false})
   const flame=mesh(new T.SphereGeometry(1,12,10),flameMaterial,this.world,[x,1.174,z],false);flame.scale.set(.013,.039,.013)
   const candle=new T.PointLight(0xffa54a,1.3,1.9,2);candle.position.set(x,1.20,z);this.world.add(candle);this.candles.push(candle)
  }
  // Quiet airborne dust, not weightless coins. A single draw call.
  const dust=new Float32Array(90*3);for(let i=0;i<90;i++){dust[i*3]=Math.sin(i*73.3)*2.2;dust[i*3+1]=.4+(i%19)/10;dust[i*3+2]=Math.cos(i*31.7)*2}
  const dustGeometry=new T.BufferGeometry();dustGeometry.setAttribute('position',new T.BufferAttribute(dust,3));this.world.add(new T.Points(dustGeometry,new T.PointsMaterial({color:0xa99462,size:.004,transparent:true,opacity:.22,depthWrite:false})))
  this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(canvas);this.fit();this.pose(0)
  const tick=(now:number)=>{
   if(this.disposed)return
   this.ticker=requestAnimationFrame(tick)
   if(document.visibilityState!=='visible')return
   const interval=this.phase==='rolling'||this.phase==='exchange'?16:this.reduced?125:48
   if(now-this.drawn<interval)return
   // Do not build a queue of stale frames on integrated/software GPUs. Input
   // remains responsive while the previous shadowed frame completes.
   const gl=this.renderer.getContext() as WebGL2RenderingContext
   if(this.fence){const status=gl.clientWaitSync(this.fence,0,0);if(status===gl.TIMEOUT_EXPIRED)return;gl.deleteSync(this.fence);this.fence=null}
   const dt=Math.min(.25,(now-this.previous)/1000||.016);this.previous=now;this.drawn=now
   this.yaw=T.MathUtils.damp(this.yaw,this.lookYaw,12,dt);this.pitch=T.MathUtils.damp(this.pitch,this.lookPitch,12,dt)
   this.updateCamera();this.pose(now);this.table.animate(dt);if(this.mode==='elo')this.wager.visible=false;this.haze.forEach(m=>m.uniforms.time.value=now/1000);if(this.speech.visible){const remaining=this.speechUntil-now;this.speech.material.opacity=T.MathUtils.clamp(remaining/900,0,1);this.speech.visible=remaining>0}
   this.candles.forEach((c,i)=>c.intensity=1.28+Math.sin(now*.002+i)*.035+Math.sin(now*.007+i)*.012)
   this.renderer.render(this.world,this.camera);this.canvas.dataset.frame=String(++this.frame);this.canvas.dataset.pitch=this.pitch.toFixed(3)
   this.fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush()
  };this.ticker=requestAnimationFrame(tick)
 }
 private fit(){
  const width=Math.max(1,this.canvas.clientWidth),height=Math.max(1,this.canvas.clientHeight)
  this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.table.layout(width/height<1.1);this.updateCamera()
 }
 private updateCamera(){
  const portrait=T.MathUtils.clamp((1.1-this.camera.aspect)/.65,0,1)
  this.camera.position.set(0,1.57+portrait*.70,1.64+portrait*1.2)
  const direction=v(Math.sin(this.yaw)*Math.cos(this.pitch),-.24-Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch)).normalize()
  if(portrait)direction.y-=portrait*.16
  this.camera.lookAt(this.camera.position.clone().add(direction));this.camera.updateMatrixWorld()
 }
 private pose(now:number){
  const t=T.MathUtils.clamp((now-this.began)/this.duration,0,1),ex=this.phase==='exchange'
  let left=v(-.50,.86,1.06),right=v(.50,.86,1.06),kl=v(-.42,.94,-.58),kr=v(.42,.94,-.58),pl=0,dl=0,lc=.15,rc=.2,kc=.15
  if(ex){
   pl=Math.sin(Math.PI*t)*1.0;dl=smooth((t-.38)/.25)*(1-smooth((t-.82)/.18))
   left=track(t,[[0,left],[.18,v(-.80,.965,.75)],[.31,v(-.80,1.02,.75)],[.57,v(-.14,1.04,.22)],[.72,v(-.14,1.04,.22)],[1,v(-.46,.94,.94)]])
   kr=track(t,[[0,kr],[.42,kr],[.65,v(-.13,1.06,.14)],[.74,v(-.13,1.06,.14)],[.94,v(-.63,.96,-.64)],[1,kr]])
   kl=track(t,[[0,kl],[.64,kl],[.83,v(.24,1.06,.24)],[.91,v(.24,1.06,.24)],[1,kl]])
   right=track(t,[[0,right],[.65,right],[.84,v(.24,1.04,.34)],[.92,v(.24,1.04,.34)],[1,v(.44,1.02,.84)]])
   lc=t<.22?smooth(t/.22)*.2:t<.70?.85:.12;kc=t>.61&&t<.94?.85:.18;rc=t>.83?.72:.2
  }else if(this.phase==='ready'){
   right.set(.44,1.02,.84);right.add(v(this.drag.x*.15,this.drag.y*.07,Math.abs(this.drag.y)*.05));rc=.72
  }else if(this.phase==='rolling'){
   right=track(t,[[0,right],[.12,v(.40,1.12,.94)],[.25,v(.26,1.03,.54)],[.40,v(.44,.95,.86)],[1,v(.44,.95,.86)]])
   rc=t<.18?.65:.12
  }
  this.people.pose(pl,dl,left,right,kl,kr,lc,rc,kc)
  this.world.updateMatrixWorld(true)
  if(ex){
   if(t<.22){this.wager.visible=true;this.wager.position.set(-.83,.936,.773)}
   else if(t<.70){
    if(this.coinOwner!=='player'){this.people.left.hand.grip.attach(this.wager);this.coinOwner='player'}
    this.wager.position.lerp(v(0,.008,0),.25)
   }else if(t<.94){
    if(this.coinOwner!=='keeper'){this.people.keeperRight.hand.grip.attach(this.wager);this.coinOwner='keeper'}
    this.wager.position.lerp(v(0,.005,0),.25)
   }else if(this.coinOwner!=='bank'){this.table.bank.attach(this.wager);this.wager.position.set(.02,.08,.02);this.coinOwner='bank'}
   if(t<.86){if(this.dieOwner!=='keeper'){this.people.keeperLeft.hand.grip.attach(this.die);this.dieOwner='keeper'}this.die.position.lerp(v(0,.054,-.018),.3)}
   else if(this.dieOwner!=='player'){this.people.right.hand.grip.attach(this.die);this.dieOwner='player'}
  }
  if(this.phase==='ready'||ex&&t>.86){
   if(this.dieOwner!=='player'){this.people.right.hand.grip.attach(this.die);this.dieOwner='player'}
   this.die.position.lerp(v(0,.055,-.014),.3);this.die.quaternion.slerp(new T.Quaternion().setFromEuler(new T.Euler(.28,.25,-.2)),.12)
  }else if(this.phase==='rolling'){
   if(t<.17){this.die.position.lerp(v(0,.05,-.01),.25)}
   else{
    if(this.dieOwner!=='world'){this.world.attach(this.die);this.startPosition.copy(this.die.position);this.startRotation.copy(this.die.quaternion);this.dieOwner='world'}
    const q=T.MathUtils.clamp((t-.17)/.83,0,1),flight=T.MathUtils.clamp(q/.57,0,1)
    this.die.position.copy(this.startPosition).lerp(this.landing,smooth(flight))
    const bounce=q<.57?Math.sin(Math.PI*flight)*.48:Math.abs(Math.sin((q-.57)/.43*Math.PI*3))*Math.pow(1-(q-.57)/.43,2)*.13
    this.die.position.y=T.MathUtils.lerp(this.startPosition.y,this.landing.y,flight)+bounce
    const spin=new T.Quaternion().setFromEuler(new T.Euler(q*15,q*9,q*13));this.die.quaternion.copy(this.startRotation).multiply(spin)
    if(q>.66)this.die.quaternion.slerp(resultRotation(this.result),smooth((q-.66)/.34))
   }
  }else if(this.phase==='idle'){
   this.die.position.set(-.16,.960,-.35);this.die.quaternion.copy(resultRotation(1))
  }
  if((ex||this.phase==='rolling')&&t===1){
   const was=this.phase;this.phase=was==='exchange'?'ready':'result'
   if(was==='rolling'){this.die.position.copy(this.landing);this.die.quaternion.copy(resultRotation(this.result))}
   this.refresh();const resolve=this.finish;this.finish=undefined;resolve?.()
  }
 }
 private refresh(){this.table.setState(this.coins,this.stake,this.face,this.phase,this.disabled)}
 setMode(mode:'normal'|'offer'|'elo',stake=0,reward=0,reason?:string){this.mode=mode;this.table.setMode(mode,stake,reward,reason);this.people.setSoul(mode==='elo');this.canvas.dataset.tableMode=mode;this.refresh()}
 setState(coins:number,stake:number,face:number,disabled:boolean){this.coins=coins;this.stake=stake;this.face=face;this.disabled=disabled;this.refresh()}
 setCoins(coins:number){this.coins=coins;this.refresh()}
 lockCamera(locked:boolean){this.cameraLocked=locked;this.canvas.dataset.cameraLocked=String(locked);if(locked){this.recenter();this.yaw=0;this.pitch=0;this.updateCamera()}}
 speak(text:string,duration=5000){
  const c=this.speechCanvas,ctx=c.getContext('2d')!;ctx.clearRect(0,0,c.width,c.height);ctx.font='italic 43px Georgia,serif';ctx.textAlign='center';ctx.textBaseline='middle'
  const words=text.split(/\s+/),lines:string[]=[];let line='';for(const word of words){const next=(line+' '+word).trim();if(ctx.measureText(next).width>940&&line){lines.push(line);line=word}else line=next}if(line)lines.push(line)
  ctx.shadowColor='#000';ctx.shadowBlur=15;ctx.fillStyle='#d6c9a8';lines.slice(0,3).forEach((l,i)=>ctx.fillText(l,c.width/2,128+(i-(lines.length-1)/2)*56));this.speechMap.needsUpdate=true;this.speechUntil=performance.now()+duration;this.speech.material.opacity=1;this.speech.visible=true
 }
 getLook(){return {yaw:this.lookYaw,pitch:this.lookPitch}}
 setLook(yaw:number,pitch:number){if(this.cameraLocked)return;this.lookYaw=T.MathUtils.clamp(yaw,-.72,.72);this.lookPitch=T.MathUtils.clamp(pitch,-.22,1.03)}
 recenter(){this.lookYaw=0;this.lookPitch=0}
 setDrag(x:number,y:number){this.drag.set(T.MathUtils.clamp(x/220,-1,1),T.MathUtils.clamp(-y/220,-.4,1))}
 ready(){this.phase='ready';this.drag.set(0,0);this.dieOwner='player';this.people.right.hand.grip.attach(this.die);this.die.position.set(0,.055,-.014);this.refresh()}
 async exchange(){
  this.world.attach(this.wager);this.wager.visible=true;this.coinOwner='table';this.dieOwner='keeper';this.people.keeperLeft.hand.grip.attach(this.die);this.die.position.set(0,.054,0)
  this.phase='exchange';this.began=performance.now();this.duration=this.reduced?150:3600;this.recenter();this.refresh();await new Promise<void>(resolve=>this.finish=resolve)
 }
 async roll(result:number){
  this.result=result;this.phase='rolling';this.began=performance.now();this.duration=this.reduced?400:2100
  this.landing.set(T.MathUtils.clamp(this.drag.x*.22,-.25,.25),.960,-.12+this.drag.y*.08);this.drag.set(0,0);this.recenter();this.refresh();await new Promise<void>(resolve=>this.finish=resolve)
 }
 pick(clientX:number,clientY:number):TableAction|{kind:'throw'}|undefined{
  const rect=this.canvas.getBoundingClientRect();this.raycaster.setFromCamera(new T.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1),this.camera)
  const candidates:T.Object3D[]=this.table.controls.filter(c=>c.object.visible&&!c.disabled).map(c=>c.object)
  if(this.phase==='ready')candidates.push(this.die)
  for(const hit of this.raycaster.intersectObjects(candidates,true)){
   let object:T.Object3D|null=hit.object
   while(object){if(object===this.die)return {kind:'throw'};if(object.userData.control)return object.userData.control.action;object=object.parent}
  }
 }
 controls(){
  const width=this.canvas.clientWidth,height=this.canvas.clientHeight
  return this.table.controls.map(c=>{
   const corners=[v(-c.size[0]/2,.04,-c.size[1]/2),v(c.size[0]/2,.04,-c.size[1]/2),v(c.size[0]/2,.04,c.size[1]/2),v(-c.size[0]/2,.04,c.size[1]/2)].map(p=>c.object.localToWorld(p).project(this.camera))
   const xs=corners.map(p=>(p.x*.5+.5)*width),ys=corners.map(p=>(-.5*p.y+.5)*height)
   return {id:c.id,action:c.action,disabled:c.disabled,x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),visible:c.object.visible&&corners.every(p=>p.z<1)&&Math.max(...ys)>0&&Math.min(...ys)<height}
  })
 }
 highlight(id:string|undefined){for(const c of this.table.controls)(c.edge.material as T.MeshStandardMaterial).emissive.set(c.id===id?0x5b3a12:0x000000)}
 diagnostics(){return {phase:this.phase,coinOwner:this.coinOwner,dieOwner:this.dieOwner,look:this.getLook(),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles}}
 dispose(){
  if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.ticker);this.resize.disconnect();this.finish?.();this.finish=undefined
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>()
  this.world.traverse(object=>{if(object instanceof T.Mesh||object instanceof T.Points){geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value)}}})
  if(this.fence)(this.renderer.getContext() as WebGL2RenderingContext).deleteSync(this.fence)
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();this.speechMap.dispose();this.speech.material.dispose();this.environment.dispose();this.renderer.dispose()
 }
}
