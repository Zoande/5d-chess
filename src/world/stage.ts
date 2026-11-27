import {poolDepth} from './resort.ts'
import {staffId,bankStaff} from './service-staff.ts'
import {civicRoom,confined,tablePosition} from './civic-venues.ts'
import {HeldModel} from './overrun-models.ts'
import {WEAPONS,type WeaponId} from './arcade.ts'
import {supportModel} from './arcade-art.ts'
import {residentialAt,residentialPoints} from './residential.ts'
import type {CompanyView} from '../equity-v2.ts'
import {kitchenTools} from './kitchen-tools.ts'
import {restaurantPoints} from './restaurant-model.ts'
import {BITE_MS,type Grocery} from './food.ts'
import {eatingHand,foodVisual,staffProps} from './restaurant-art.ts'
import {WHEEL_X,WHEEL_Z} from '../casino/hall-decor.ts'
import {terrainHeight,inPool} from './terrain.ts'
import * as T from 'three'
import {liftPlatform,makeWorldArt,spinWheel} from './art.ts'
import {Figure} from '../casino/hall-stage.ts'
import {PlayerMotion,type PlayerSample} from './player-motion.ts'
import {CityDiagnostics} from './diagnostics.ts'
import {CityLighting} from './city-lighting.ts'
import {CityAssets} from './city-assets.ts'
import {resultRotation,v} from '../casino/scene/geometry.ts'
import {CITY,DICE_TABLE_INDEX,walkingHeight,boardPoints,groundZone,interactions,localSite,riderHeight,site,worldMove,WORLD_SPEED,SPRINT_SPEED,WORLD_TABLES,type WorldAction,type WorldView,type WorldZone} from './model.ts'
import type {Position} from '../roulette-hall-model.ts'

const TAU=Math.PI*2
const STANDING_EYE=1.637,SEATED_EYE=1.47
function shadow(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64
  const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(32,32,0,32,32,32)
  gradient.addColorStop(0,'#0009');gradient.addColorStop(1,'#0000')
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64)
  return new T.CanvasTexture(canvas)
}
type Avatar={figure:Figure;tag?:HTMLElement;props?:ReturnType<typeof staffProps>;target?:WorldView['you'];sample?:PlayerSample}
export class CityStage {
  private renderer:T.WebGLRenderer
  private gl?:WebGL2RenderingContext
  private fence:WebGLSync|null=null
  private art?:ReturnType<typeof makeWorldArt>
  private view?:WorldView
  private camera=new T.PerspectiveCamera(58,1,.16,720)
  private lighting?:CityLighting
  private preparing?:CityAssets
  private graphicsReady=false
  private shadow?:T.CanvasTexture
  private figures=new Map<string,Avatar>()
  private playerMotion=new Map<string,PlayerMotion>()
  private labelPoint=new T.Vector3()
  private support=new Map<string,T.Group>()
  private npc=new Map<string,Figure>()
  private cast=new Map<string,{member:WorldView['you'];officer:boolean;style?:number;motion:PlayerMotion;sample:PlayerSample}>()
  readonly diagnostics?:CityDiagnostics
  private restaurantNpc=new Map<string,{figure:Figure;props:ReturnType<typeof staffProps>}>()
  private lifts=new Map<string,T.Group>()
  private liftFacing?:{from:number;delta:number;started:number}
  private arrows=new Set<string>()
  private stick={x:0,z:0}
  private voluntaryUnlock=false
  private wasLocked=false
  private onPause:()=>void
  private held=new HeldModel(true)
  private chase=false
  private chaseVisible=false
  private snackHand?:T.Group
  private snacks=new Map<Grocery,T.Group>()
  private eat?:()=>boolean
  private weapon?:WeaponId
  private firing?:(operation:'fire'|'reload',target?:string)=>void
  private holdingFire=false
  private nextTrigger=0
  private aiming=false
  get sprinting(){return !this.pause&&!this.aiming&&!this.view?.arcade?.custody&&this.arrows.has('shift')}
  setLoadout(id:WeaponId|undefined,fire:(operation:'fire'|'reload',target?:string)=>void,eat:()=>boolean){
    this.eat=eat
    if(this.weapon!==id){this.holdingFire=false;this.aiming=false}
    this.weapon=id;this.firing=fire
    if(!id)this.aiming=false
  }
  private fireAtReticle(){
    if(!this.weapon||!this.view||this.view.arcade?.custody)return
    const current=performance.now(),mag=this.view.arcade?.magazines?.[this.weapon]
    if(current<this.nextTrigger||mag&&(mag.readyAt>Date.now()+this.clock||mag.rounds<1))return
    this.nextTrigger=current+WEAPONS[this.weapon].delay
    const reach=WEAPONS[this.weapon].range,me=this.view.you
    let nearest=Infinity,target:string|undefined
    for(const c of this.view.arcade?.contacts??[]){
      if(!c.inSight||c.kind==='dog'||c.kind==='helicopter')continue
      const distance=c.distance??Math.hypot(c.x-me.x,c.z-me.z)
      if(distance>reach||distance>=nearest)continue
      const p=this.labelPoint.set(c.x,(c.height??walkingHeight(c.zone as WorldZone,c.x,c.z))+1.12,c.z).project(this.camera)
      // Project the city character's torso into the reticle in screen space.
      if(p.z>0&&p.z<1&&Math.abs(p.x)*this.camera.aspect<.42/Math.max(1,distance)&&Math.abs(p.y)<1.65/Math.max(1,distance)){
        nearest=distance;target=c.id
      }
    }
    this.firing?.('fire',target)
  }
  toggleCamera(){this.chase=!this.chase;this.parent.dataset.camera=this.chase?'third':'first'}
  private cameraAim=new T.Vector3()
  private tools?:ReturnType<typeof kitchenTools>
  private station?:{point:string;x:number;y:number;phase:number;sent:boolean;fillAt:number}
  private gesture?:(gesture:string)=>void
  private lockedAt=0
  private drag?:{id:number;x:number;y:number}
  private last=0
  private lastStep=0
  private frame=0
  private yaw=0
  private pitch=0
  private clock=0
  private zone?:WorldZone
  private predictedZone?:WorldZone
  private caveOpen=true
  private pause=false
  private lastMessage=0
  private speech=new Map<string,{text:string;until:number}>()
  private nearest?:WorldAction
  private promptButton:HTMLButtonElement
  private promptLabel:HTMLElement
  private darkness:HTMLElement
  private promptedView?:WorldView
  private promptedX=NaN
  private promptedZ=NaN
  private viewportWidth=0
  private viewportHeight=0
  private input=new AbortController()
  private reduced=matchMedia('(prefers-reduced-motion:reduce)').matches
  private resize:ResizeObserver
  private canvas:HTMLCanvasElement
  private parent:HTMLElement
  private onAction:(point?:WorldAction)=>void
  private wasMoving=false
  position:Position={...CITY}
  get moving(){return (this.arrows.size>Number(this.arrows.has('shift'))||Math.hypot(this.stick.x,this.stick.z)>.09)&&!this.pause}
  get preparingGraphics(){return !!this.art&&!this.graphicsReady}
  constructor(canvas:HTMLCanvasElement,parent:HTMLElement,onAction:(point?:WorldAction)=>void,onPause:()=>void=()=>{},private onMovementChange=()=>{},private onGraphicsReady=()=>{},private onGraphicsError=()=>{}){
    this.canvas=canvas;this.parent=parent;this.onAction=onAction;this.onPause=onPause
    this.promptButton=parent.querySelector('[data-world-use]')!
    this.promptLabel=this.promptButton.querySelector('span')!
    this.darkness=parent.querySelector('.world-dark')!
    try{
      const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'})
      this.renderer=renderer
      this.gl=renderer.getContext() as WebGL2RenderingContext
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22
      this.shadow=shadow()
    }catch{
      throw new Error('The city requires WebGL 2. Enable hardware acceleration in your browser and try again.')
    }
    if(new URLSearchParams(location.search).get('debug')==='1')this.diagnostics=new CityDiagnostics(parent)
    this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(this.canvas)
    this.bind();this.fit();this.frame=requestAnimationFrame(this.tick)
  }
  lock(value:boolean){
    this.pause=value
    if(value){this.holdingFire=false;this.aiming=false;this.arrows.clear();this.stick={x:0,z:0};this.drag=undefined;this.releaseMouse()}
  }
  set(view:WorldView,offset:number,reposition=false,sent?:Position){
    const prior=this.view?.you,next=view.you
    const changedWorld=view.id!==this.view?.id
    const seat=(p:WorldView['you']|undefined)=>p?.homePose?'home:'+p.homePose.id:p?.barSeat!==undefined?'bar:'+p.barSeat:p?.boardSeat!==undefined?'board:'+p.boardSeat:p?.dining!==undefined?'dining:'+p.dining:p?.chair?'chair:'+p.chair.table+':'+p.chair.index:p?.lounge?'couch:'+p.lounge.couch+':'+p.lounge.index:''
    const seatChanged=seat(prior)!==seat(next)
    const housingChanged=this.view?.housing?.keys.some(key=>!view.housing?.keys.includes(key))
    const reported=sent??this.position
    const changedVenue=prior?.zone!==next.zone&&(civicRoom(next.zone)||!!prior&&civicRoom(prior.zone))
    // The two flights are less than a metre apart. A wall or stair landing can
    // stop a server step sooner than prediction when the player turns a corner.
    const stoppedAtSample=!!sent&&!this.moving&&Math.hypot(this.position.x-sent.x,this.position.z-sent.z)<.025
    const correctionLimit=stoppedAtSample?.025:civicRoom(next.zone)?.27:1.35
    if(changedWorld||reposition||seatChanged||changedVenue&&this.predictedZone!==next.zone||housingChanged||prior?.lift&&!next.lift||next.lift&&!prior?.lift||Math.hypot(next.x-reported.x,next.z-reported.z)>correctionLimit){
      if(!changedWorld&&!reposition&&!seatChanged&&Math.hypot(next.x-reported.x,next.z-reported.z)>correctionLimit)this.diagnostics?.corrected()
      this.position={x:next.x,z:next.z,yaw:next.yaw}
      this.predictedZone=next.zone
    }
    if(changedWorld||reposition||seatChanged){
      this.liftFacing=undefined
      this.yaw=next.yaw;this.pitch=0
      if(next.chair){
        const {x,z}=WORLD_TABLES[next.chair.table],table=site('casino',x,z)
        this.yaw=Math.atan2(next.x-table.x,next.z-table.z)
        this.pitch=-.24
      }
      if(next.dining!==undefined)this.pitch=-.33
      if(next.chair||next.lounge||next.dining!==undefined||next.barSeat!==undefined||next.boardSeat!==undefined)this.releaseMouse()
    }
    if(next.lift&&residentialAt(next.zone)){
      this.yaw=next.yaw;this.pitch=0
    }else if(next.lift&&!prior?.lift){
      const delta=Math.atan2(Math.sin(Math.PI-this.yaw),Math.cos(Math.PI-this.yaw))
      if(this.reduced){this.yaw=Math.PI;this.pitch=0}
      else this.liftFacing={from:this.yaw,delta,started:performance.now()}
    }
    const biteChanged=this.view?.arcade?.bite?.ends!==view.arcade?.bite?.ends
    this.clock=offset;this.view=view;this.zone=next.zone;this.caveOpen=view.caveOpen
    if(biteChanged){
      this.updateBite(view.now)
      // Queue the first bite pose even when the previous street frame is still drawing.
      if(view.arcade?.bite&&this.gl&&this.fence){this.gl.deleteSync(this.fence);this.fence=null}
    }
    if(changedWorld){this.lastMessage=0;this.speech.clear();this.playerMotion.clear();this.cast.clear()}
    for(const member of view.players){
      let motion=this.playerMotion.get(member.name)
      if(!motion){motion=new PlayerMotion();this.playerMotion.set(member.name,motion)}
      motion.push(member,view.now)
    }
    for(const name of this.playerMotion.keys())if(!view.players.some(member=>member.name===name))this.playerMotion.delete(name)
    const present=new Set<string>()
    const resident=(id:string,member:WorldView['you'],officer:boolean,style?:number)=>{
      present.add(id)
      let entry=this.cast.get(id)
      if(!entry){
        entry={member,officer,style,motion:new PlayerMotion(),sample:{x:member.x,z:member.z,yaw:member.yaw,zone:member.zone,height:0}}
        this.cast.set(id,entry)
      }
      entry.member=member.homePose?.kind==='sit'?{...member,lounge:{couch:0,index:0}}:member
      entry.motion.push(entry.member,view.now)
    }
    for(const npc of view.residents??[])resident(npc.id,npc,false,npc.style)
    for(const c of view.arcade?.contacts??[])if(c.kind==='officer'){
      const previous=this.cast.get(c.id)?.member
      const yaw=previous&&Math.hypot(c.x-previous.x,c.z-previous.z)>.02?Math.atan2(previous.x-c.x,previous.z-c.z):previous?.yaw??0
      resident(c.id,{name:c.label,avatar:'default',online:true,x:c.x,z:c.z,yaw,zone:c.zone as WorldZone},true)
    }
    for(const id of this.cast.keys())if(!present.has(id))this.cast.delete(id)
    const receivedAt=performance.now()
    for(const line of view.chat??[]){
      if(line.id<=this.lastMessage)continue
      this.lastMessage=line.id
      if(view.now-line.at>=6500)continue
      this.speech.set(line.name,{text:line.text,until:receivedAt+6500})
      const tag=this.figures.get(line.name)?.tag
      if(tag){tag.textContent=line.text;tag.classList.add('speech')}
    }
    if(!this.art)this.buildScene()
    if(this.art){
      this.art.seal.visible=!this.caveOpen&&next.zone!=='cave'
      this.art.grotto.visible=!this.art.seal.visible
      this.art.restaurant.update(view.restaurant)
      this.art.resort.update(view,this.graphicsReady)
      this.art.civic(next.zone,next.x,next.z)
      const hidden=view.arcade?.recoveringStaff??[]
      this.art.staff.forEach((a,i)=>a.root.visible=!hidden.includes(i<bankStaff.length?staffId('bank',i):staffId('exchange',i-bankStaff.length)))
      this.art.shopClerk.root.visible=!hidden.includes(staffId('gunshop',0))
      this.art.hotelClerks.forEach((a,i)=>a.root.visible=!hidden.includes(staffId('hotel',i)))
      this.art.actors.forEach((a,i)=>a.root.visible=!hidden.includes(staffId('casino',i)))
      this.art.bar.bartender.root.visible=!hidden.includes(staffId('casino',4))
      this.art.homes.clerks.forEach((a,i)=>a.root.visible=!hidden.includes(staffId('home:block-'+i+':0',0)))
      if(next.zone.startsWith('floor:'))this.art.floor(next.zone.slice(6))?.actors.forEach((a,i)=>a.root.visible=!hidden.includes(staffId(next.zone,i)))
      const target=next.lift?.to??next.zone
      if(target.startsWith('floor:'))this.art.floor(target.slice(6))
    }
  }
  quote(symbol:string,points:{price:number}[],value?:number){this.art?.floor(symbol)?.screens.forEach(update=>update(points,value))}
  ownership(symbol:string,company:CompanyView){this.art?.floor(symbol)?.ownership?.(company)}
  act(){this.onAction(this.nearest)}
  setStation(point:string|undefined,submit:(gesture:string)=>void){
    this.gesture=submit
    if(point===this.station?.point)return
    this.station=point?{point,x:0,y:0,phase:0,sent:false,fillAt:0}:undefined
    this.arrows.clear()
  }
  get kitchenMotion(){return this.station&&{x:this.station.x,y:this.station.y}}
  private moveTool(dx:number,dy:number){
    const s=this.station,r=this.view?.restaurant,job=r?.kitchen
    if(!s||!job||s.sent)return
    s.x=T.MathUtils.clamp(s.x+dx/110,-1,1);s.y=T.MathUtils.clamp(s.y-dy/110,-1,1)
    this.onMovementChange()
    const now=Date.now()+this.clock
    if(s.point.endsWith(':soda')){
      if(s.y>.32&&Math.abs(s.x)<.23&&!s.fillAt)s.fillAt=performance.now()+560
      if(s.y<.12||Math.abs(s.x)>.33)s.fillAt=0
    }else if(s.point.endsWith(':fryer')){
      if(s.y<-.25)s.phase=1
      if(s.phase&&s.x>.48&&s.y>-.07)this.completeTool('scoop')
    }else if(now>=job.readyAt){
      if(s.y<-.21&&Math.abs(s.x)<.5)s.phase=1
      if(s.phase&&job.patty==='raw'&&s.y>.39)this.completeTool('flip')
      else if(s.phase&&job.patty==='flipped'&&s.x>.56&&s.y>-.12)this.completeTool('assemble')
    }
  }
  private completeTool(gesture:string){
    const s=this.station
    if(!s||s.sent)return
    s.sent=true;this.gesture?.(gesture)
  }
  resetTool(){if(this.station)Object.assign(this.station,{x:0,y:0,phase:0,sent:false,fillAt:0})}
  private mouseLook=false
  resumeMouse(requested=false){
    if(requested)this.mouseLook=true
    if(!this.mouseLook||this.pause||this.view?.you.chair||this.view?.you.lounge||this.view?.you.dining!==undefined||this.view?.you.barSeat!==undefined||this.view?.you.boardSeat!==undefined||
      !matchMedia('(any-pointer: fine)').matches||document.pointerLockElement===this.canvas)return
    this.lockedAt=performance.now()
    this.canvas.requestPointerLock?.()?.catch(()=>{})
  }
  private releaseMouse(){
    if(document.pointerLockElement!==this.canvas)return
    this.voluntaryUnlock=true;document.exitPointerLock()
  }
  private turn(dx:number,dy:number){
    if(this.pause||this.view?.you.chair)return
    if(this.station){this.moveTool(dx,dy);return}
    this.liftFacing=undefined
    this.yaw-=dx*.0032
    this.pitch=T.MathUtils.clamp(this.pitch-dy*.0032,-1.34,1.34)
  }
  private buildScene(){
    this.art=makeWorldArt(this.caveOpen)
    this.art.scene.matrixAutoUpdate=false
    this.tools=kitchenTools(this.art.scene)
    this.lighting=new CityLighting(this.art.scene)
  }
  private prepareGraphics(now:number){
    if(this.graphicsReady||!this.art)return
    if(!this.preparing){
      this.cameraView(now);this.avatars(.016,now);this.motion(now,.016)
      this.lighting?.update(this.camera)
      this.preparing=new CityAssets(this.renderer,this.art.scene,this.camera)
    }
    if(this.preparing.step()){
      this.preparing.dispose();this.preparing=undefined
      this.graphicsReady=true;this.onGraphicsReady()
    }
  }
  private renderScene(){
    if(!this.art)return
    this.lighting?.update(this.camera)
    this.renderer.render(this.art.scene,this.camera)
  }
  private clearScene(){
    this.preparing?.dispose();this.preparing=undefined
    for(const entry of this.figures.values()){entry.figure.dispose();entry.tag?.remove()}
    this.figures.clear()
    for(const entry of this.restaurantNpc.values())entry.figure.dispose()
    this.restaurantNpc.clear()
    if(this.art){
      if(this.art.scene.background instanceof T.Texture)this.art.scene.background.dispose()
      this.art.scene.traverse(obj=>{
        if(obj instanceof T.Mesh){
          obj.geometry.dispose()
          for(const material of Array.isArray(obj.material)?obj.material:[obj.material]){
            if(material.map!==this.shadow)material.map?.dispose()
            material.dispose()
          }
        }
      })
    }
    this.npc.clear();this.lifts.clear();this.playerMotion.clear();this.lighting=undefined;this.art=undefined
  }
  private fit(){
    const w=Math.max(1,this.canvas.clientWidth),h=Math.max(1,this.canvas.clientHeight)
    if(w===this.viewportWidth&&h===this.viewportHeight)return
    this.viewportWidth=w;this.viewportHeight=h
    this.camera.aspect=w/h;this.camera.fov=w<h?67:56;this.camera.updateProjectionMatrix()
    this.renderer.setSize(w,h,false)
  }
  private bind(){
    const {signal}=this.input,allowed=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift']
    window.addEventListener('keydown',e=>{
      if(this.pause||e.ctrlKey||e.altKey||e.metaKey||document.activeElement?.matches('input,select,textarea,[contenteditable]'))return
      const k=e.key.toLowerCase()
      if(this.station&&k.startsWith('arrow')){
        e.preventDefault();this.moveTool(k==='arrowleft'?-24:k==='arrowright'?24:0,k==='arrowup'?-24:k==='arrowdown'?24:0);return
      }
      if(k==='v'&&!e.repeat){this.toggleCamera();return}
      if(k==='r'&&this.weapon&&!e.repeat){this.firing?.('reload');return}
      if(k==='e'&&!e.repeat){e.preventDefault();this.act();return}
      if(allowed.includes(k)){this.arrows.add(k);e.preventDefault()}
    },{signal})
    window.addEventListener('keyup',e=>this.arrows.delete(e.key.toLowerCase()),{signal})
    window.addEventListener('blur',()=>{this.arrows.clear();this.drag=undefined;this.stick={x:0,z:0}},{signal})
    document.addEventListener('pointerlockchange',()=>{
      const locked=document.pointerLockElement===this.canvas
      if(!locked&&this.wasLocked&&!this.voluntaryUnlock)this.onPause()
      this.wasLocked=locked;this.voluntaryUnlock=false
      if(locked&&(this.pause||this.view?.you.chair||this.view?.you.lounge))this.releaseMouse()
    },{signal})
    document.addEventListener('mousemove',e=>{
      if(document.pointerLockElement!==this.canvas)return
      if(performance.now()-this.lockedAt<250&&Math.hypot(e.movementX,e.movementY)>180)return
      this.turn(e.movementX,e.movementY)
    },{signal})
    this.canvas.addEventListener('pointerdown',e=>{
      if(this.pause)return
      if(e.button===0&&document.pointerLockElement===this.canvas&&!this.station&&this.eat?.())return
      if(document.pointerLockElement===this.canvas&&this.weapon&&this.parent.hasAttribute('data-armed')){
        if(e.button===2){this.aiming=true;return}
        if(e.button===0){this.holdingFire=true;this.fireAtReticle();return}
      }
      if(e.button!==0)return
      this.canvas.focus({preventScroll:true})
      if(e.pointerType==='mouse'){this.resumeMouse(true);if(!this.station)return}
      if(this.drag)return
      this.canvas.setPointerCapture(e.pointerId);this.drag={id:e.pointerId,x:e.clientX,y:e.clientY}
    },{signal})
    this.canvas.addEventListener('contextmenu',e=>{if(this.weapon)e.preventDefault()},{signal})
    window.addEventListener('pointerup',e=>{if(e.button===2)this.aiming=false;if(e.button===0)this.holdingFire=false},{signal})
    this.canvas.addEventListener('pointermove',e=>{
      if(this.pause||document.pointerLockElement===this.canvas)return
      if(e.pointerType==='mouse'&&!this.station)return
      const d=this.drag
      if(!d||d.id!==e.pointerId)return
      this.turn(e.clientX-d.x,e.clientY-d.y)
      d.x=e.clientX;d.y=e.clientY
    },{signal})
    this.canvas.addEventListener('lostpointercapture',e=>{if(this.drag?.id===e.pointerId)this.drag=undefined},{signal})
    const stick=this.parent.querySelector<HTMLElement>('[data-joystick]')!,thumb=stick.querySelector<HTMLElement>('i')!
    let pointer:number|undefined
    const move=(event:PointerEvent)=>{
      const area=stick.getBoundingClientRect(),r=area.width*.32
      const x=(event.clientX-area.x-area.width/2)/r,z=(event.clientY-area.y-area.height/2)/r
      const scale=Math.max(1,Math.hypot(x,z))
      this.stick={x:x/scale,z:z/scale};thumb.style.transform=`translate(${this.stick.x*r}px,${this.stick.z*r}px)`
    }
    stick.addEventListener('pointerdown',e=>{if(this.pause||pointer!==undefined)return;e.preventDefault();pointer=e.pointerId;stick.setPointerCapture(pointer);move(e)},{signal})
    stick.addEventListener('pointermove',e=>{if(e.pointerId===pointer)move(e)},{signal})
    stick.addEventListener('lostpointercapture',()=>{pointer=undefined;this.stick={x:0,z:0};thumb.style.transform=''},{signal})
    window.addEventListener('pagehide',e=>{if(!e.persisted)this.stop()},{signal})
  }
  private lastCivicDirection=0
  private step(dt:number){
    if(!this.zone||this.pause||this.station||this.view?.you.chair||this.view?.you.lounge||this.view?.you.dining!==undefined||this.view?.you.barSeat!==undefined||this.view?.you.boardSeat!==undefined||this.view?.you.lift||this.view?.you.homePose)return
    const keys=this.arrows
    const x=this.stick.x+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))
    const z=this.stick.z+Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'))
    if(civicRoom(this.zone)){
      const direction=x||z?1+((Math.round(Math.atan2(z,x)*4/Math.PI)+8)%8):0
      if(direction!==this.lastCivicDirection){this.lastCivicDirection=direction;this.onMovementChange()}
    }
    const length=Math.max(1,Math.hypot(x,z)),speed=(this.sprinting?SPRINT_SPEED:WORLD_SPEED)*dt/length*(this.zone==='oasis'&&inPool(localSite(this.zone,this.position.x,this.position.z).x,localSite(this.zone,this.position.x,this.position.z).z)?.53:1)
    const heading=this.yaw
    if(this.view?.arcade?.custody){
      Object.assign(this.position,confined(this.view.arcade.custody.cell,
        this.position.x+(x*Math.cos(heading)+z*Math.sin(heading))*speed,
        this.position.z+(z*Math.cos(heading)-x*Math.sin(heading))*speed))
    }else if(x||z){
      const dx=x*Math.cos(heading)+z*Math.sin(heading),dz=z*Math.cos(heading)-x*Math.sin(heading)
      const inCave=groundZone(this.position.x,this.position.z)==='cave'
      const zone=this.predictedZone??this.zone
      const {zone:destination,...position}=worldMove(zone,this.position,this.position.x+dx*speed,this.position.z+dz*speed,(this.sprinting?SPRINT_SPEED:WORLD_SPEED)*dt,this.caveOpen||inCave,this.view?.housing?.keys,this.view?.residential,Date.now()+this.clock,this.view?.traffic?.vehicles)
      this.position=position;this.predictedZone=destination
    }
    this.position.yaw=this.yaw
  }
  private prompt(){
    const {x,z}=this.position
    if(this.view===this.promptedView&&x===this.promptedX&&z===this.promptedZ)return
    this.promptedView=this.view;this.promptedX=x;this.promptedZ=z
    const zone=this.predictedZone??this.zone??groundZone(x,z)
    const seated=this.view?.you.boardSeat!==undefined||this.view?.you.barSeat!==undefined
    const pose=this.view?.you.homePose
    let candidate:WorldAction|undefined
    if(this.view?.arcade?.custody){
      const b=this.view.arcade.custody,{x:tx,z:tz}=tablePosition(b.cell)
      if(b.ends===null&&Math.hypot(x-tx,z-tz)<1.7)candidate={id:'cell-table',label:'Open jigsaw table',x:tx,z:tz}
    }
    else if(seated||pose)candidate={id:'stand-scenery',label:pose?.kind==='rest'?'Get up':'Stand up',x,z}
    else if(this.zone&&!this.view?.you.chair&&!this.view?.you.lounge&&!this.view?.you.lift){
      const points=zone==='kfc'?restaurantPoints(this.view?.restaurant,this.view?.you.dining).map(p=>({...p,...site(zone,p.x,p.z)})):
        [...interactions(zone,this.view?.housing?.keys),...boardPoints(zone,this.view?.boardTaken),...residentialPoints(zone,this.position,this.view?.housing?.keys??[],this.view?.residential)]
      let best=Infinity
      for(const point of points){
        const squared=(x-point.x)**2+(z-point.z)**2
        if(squared<best&&squared<=(point.range??1.65)**2){candidate=point;best=squared}
      }
    }
    const was=this.nearest?.id,previousLabel=this.nearest?.label
    this.nearest=candidate
    if(was===candidate?.id&&previousLabel===candidate?.label)return
    this.promptButton.hidden=!candidate
    this.promptLabel.textContent=candidate?.label??''
  }
  private avatars(dt:number,now:number){
    if(!this.view||!this.art)return
    const roster=[this.view.you,...this.view.players]
    const active=new Set(roster.map(p=>p.name))
    const neededLifts=new Set<string>()
    for(const member of roster){
      const local=this.view.you.name===member.name
      let current=this.figures.get(member.name)
      if(!current){
        let tag:HTMLElement|undefined
        if(!local){tag=document.createElement('span');tag.className='world-name';tag.textContent=member.name;this.parent.querySelector('.world-names')!.append(tag)}
        current={figure:new Figure(this.art.scene,member,this.shadow!),tag};current.figure.usePlayerModel();this.figures.set(member.name,current)
        current.figure.root.position.y=riderHeight(member,now)
      }
      const figure=current.figure
      figure.equipped=local?this.weapon:member.equipped
      if(local)figure.setFirstPerson(!this.chaseVisible)
      if(current.target!==member){
        current.target=member
        figure.target=member.dining===undefined&&member.barSeat===undefined&&member.boardSeat===undefined&&member.homePose?.kind!=='sit'?member:{...member,lounge:{couch:0,index:0}}
      }
      const motion=!local?this.playerMotion.get(member.name):undefined
      if(motion){
        current.sample??={x:member.x,z:member.z,yaw:member.yaw,height:0,zone:member.zone}
        motion.sample(now,current.sample)
      }
      const sample=motion?current.sample:undefined
      const height=sample?.height??riderHeight(member,now)
      figure.root.position.y=local&&!member.lift?walkingHeight(this.predictedZone??member.zone,this.position.x,this.position.z):
        height
      const cleaning=(member.workingUntil??0)>now&&(member.workKind==='mop'||member.workKind==='wipe')
      if((member.carrying||cleaning||member.kfcRole)&&!current.props)current.props=staffProps(figure.root)
      if(current.props){
        current.props.hold(member.carrying?'tray':member.kitchenHand,member.carriedItems)
        current.props.apron.visible=!!member.kfcRole&&member.dining===undefined
        current.props.cloth.visible=cleaning&&member.workKind==='wipe'
        current.props.mop.visible=cleaning&&member.workKind==='mop'
        current.props.mop.rotation.z=.19+Math.sin(now*.008)*.13
      }
      figure.pose(member.online?dt:0,member.online?now:0,local?this.position:sample,!!member.carrying||!!member.kitchenHand||(member.workingUntil??0)>now,(member.eatingUntil??0)>now,member.homePose,local?this.kitchenMotion:member.kitchenMotion)
      const interior=member.zone==='exchange'||member.zone.startsWith('floor:')
      if(interior&&member.zone.startsWith('floor:'))this.art.floor(member.zone.slice(6))
      if(interior){
        const key=member.lift?member.name:member.zone
        neededLifts.add(key)
        let cabin=this.lifts.get(key)
        if(!cabin){cabin=liftPlatform(this.art.scene);this.lifts.set(key,cabin)}
        cabin.visible=true;cabin.position.y=height
        cabin.getObjectByName('travel-doors')!.visible=!!member.lift
      }
      if(current.tag){
        const mark=this.labelPoint.copy(figure.root.position)
        mark.y+=1.91
        mark.project(this.camera)
        const hidden=(sample?.zone??member.zone)!==this.view.you.zone||mark.z<=-1||mark.z>=1||Math.abs(mark.x)>.98||Math.abs(mark.y)>.96||this.camera.position.distanceToSquared(figure.root.position)>16**2
        if(current.tag.hidden!==hidden)current.tag.hidden=hidden
        const message=this.speech.get(member.name),latest=message&&performance.now()<message.until?message:undefined
        if(message&&!latest)this.speech.delete(member.name)
        const label=latest?.text??member.name
        if(current.tag.textContent!==label)current.tag.textContent=label
        current.tag.classList.toggle('speech',!!latest)
        if(!hidden)current.tag.style.transform=`translate3d(${this.viewportWidth*(.5+.5*mark.x)}px,${this.viewportHeight*(.5-.5*mark.y)}px,0) translate(-50%,-50%)`
      }
    }
    for(const [key,cabin] of this.lifts)if(!neededLifts.has(key))cabin.visible=false
    for(const [name,entry] of this.figures)if(!active.has(name)){entry.figure.dispose();entry.tag?.remove();this.figures.delete(name)}
    this.restaurantCast(dt,now)
    const contacts=this.view.arcade?.contacts??[]
    const props=[...contacts.filter(c=>c.kind==='dog'||c.kind==='helicopter'),...(this.view.arcade?.drops??[]).map(d=>({...d,kind:'drop' as const}))]
    for(const [id,g] of this.support)if(!props.some(p=>p.id===id)){
      this.art.scene.remove(g);this.support.delete(id)
      g.traverse(obj=>{if(obj instanceof T.InstancedMesh){obj.dispose();obj.material.dispose()}})
    }
    for(const c of props){
      let g=this.support.get(c.id)
      if(!g){g=supportModel(c.kind);this.support.set(c.id,g);this.art.scene.add(g)}
      g.visible=true;g.position.set(c.x,walkingHeight(this.view.you.zone,c.x,c.z)+(c.kind==='helicopter'?6:0),c.z)
      if(c.kind==='helicopter')g.rotation.y=now*.0006
    }
    for(const [id,{member,officer,style,motion,sample}] of this.cast){
      let figure=this.npc.get(id)
      motion.sample(now,sample)
      const visible=(this.camera.position.x-sample.x)**2+(this.camera.position.y-sample.height)**2+(this.camera.position.z-sample.z)**2<49**2
      if(!visible){if(figure)figure.root.visible=false;continue}
      if(!figure){figure=new Figure(this.art.scene,member,this.shadow!,officer?'officer':false,style);this.npc.set(id,figure)}
      figure.root.visible=true;figure.target=member;figure.root.position.y=sample.height
      figure.pose(dt,now,sample,false,false,member.homePose)
    }
    for(const [id,figure] of this.npc)if(!this.cast.has(id)){figure.dispose();this.npc.delete(id)}
  }
  private restaurantCast(dt:number,now:number){
    if(!this.art)return
    const actors=this.view?.restaurant?.actors??[],active=new Set(actors.map(a=>a.id))
    for(const actor of actors){
      const seated=actor.pose==='eat'||actor.pose==='sit'
      const character={...site('kfc',actor.x,actor.z),name:actor.name,online:true,avatar:'default',yaw:actor.yaw,
        lounge:seated?{couch:0,index:0}:undefined}
      let entry=this.restaurantNpc.get(actor.id)
      if(!entry){
        const figure=new Figure(this.art.scene,character,this.shadow!,actor.role??false)
        entry={figure,props:staffProps(figure.root)};this.restaurantNpc.set(actor.id,entry)
      }
      const {figure,props}=entry
      figure.target=character
      props.hold(actor.pose==='tray'?'tray':undefined,actor.items)
      props.mop.visible=actor.pose==='mop'
      props.cloth.visible=actor.pose==='wipe'
      props.cloth.position.x=.24+Math.sin(now*.007)*.10
      props.mop.rotation.z=.19+Math.sin(now*.005)*.14
      figure.pose(dt,now,undefined,actor.pose==='work'||actor.pose==='tray'||actor.pose==='mop'||actor.pose==='wipe',actor.pose==='eat')
    }
    for(const [id,entry] of this.restaurantNpc)if(!active.has(id)){entry.figure.dispose();this.restaurantNpc.delete(id)}
  }
  private updateBite(now:number){
    const bite=this.view?.arcade?.bite,eating=!!bite&&now<bite.ends
    if(this.snackHand)this.snackHand.visible=eating
    if(bite&&eating){
      if(!this.snackHand){this.snackHand=eatingHand();this.camera.add(this.snackHand)}
      const hand=this.snackHand
      for(const [id,snack] of this.snacks)snack.visible=id===bite.item
      let snack=this.snacks.get(bite.item)
      if(!snack){snack=foodVisual(bite.item);hand.add(snack);this.snacks.set(bite.item,snack)}
      const t=T.MathUtils.clamp(1-(bite.ends-now)/BITE_MS,0,1)
      const raised=Math.sin(Math.PI*t)**.7
      snack.visible=true
      hand.position.set(.17-.12*raised,-.36+.22*raised,-.53+.21*raised)
      hand.rotation.set(raised*(bite.item==='cola'||bite.item==='coffee'||bite.item==='tea'?.69:.23),-.3,.09*Math.sin(t*Math.PI*4))
      hand.scale.setScalar(1.35-.35*t)
    }
    this.parent.toggleAttribute('data-eating',eating)
    return eating
  }
  private cameraView(now:number){
    const me=this.view?.you,{x,z}=this.position
    if(this.liftFacing){
      const {started,from,delta}=this.liftFacing,progress=Math.min(1,(performance.now()-started)/420)
      this.yaw=from+delta*progress*progress*(3-2*progress)
      if(progress===1)this.liftFacing=undefined
    }
    this.camera.position.set(x,(me&&!me.lift?walkingHeight(this.predictedZone??me.zone,x,z):me?riderHeight(me,now):0)+(me?.homePose?(me.homePose.kind==='rest'?me.homePose.height+.16:me.homePose.height+.91):(me?.chair||me?.lounge||me?.dining!==undefined||me?.barSeat!==undefined||me?.boardSeat!==undefined?SEATED_EYE:STANDING_EYE)),z)
    if(me?.zone==='oasis'){
      const p=localSite('oasis',x,z)
      if(inPool(p.x,p.z))this.camera.position.y+=Math.sin(now*.0027)*.055
    }
    this.camera.rotation.set(T.MathUtils.clamp(this.pitch+(me?.homePose?.kind==='rest'?1.05:0),-1.55,1.55),this.yaw,0,'YXZ')
    if(me?.homePose?.id.startsWith('salon-')){
      const slots=me.homePose.id.startsWith('salon-slots')
      const focus=site(me.zone,slots?8.02:-6,0)
      this.camera.lookAt(focus.x,walkingHeight(me.zone,x,z)+(slots?1.58:.90),z)
    }
    const chair=me?.chair,round=chair&&this.view?.hall?.tables[chair.table]
    if(chair&&round){
      const table=WORLD_TABLES[chair.table],dice=chair.table===DICE_TABLE_INDEX
      const wheel=site('casino',table.x+(dice?0:WHEEL_X),table.z+(dice?0:WHEEL_Z))
      const spin=dice?undefined:round.spin
      const blend=spin?(this.reduced?Number(now<spin.ends+900):
        T.MathUtils.smoothstep(now,spin.started,spin.started+1050)*(1-T.MathUtils.smoothstep(now,spin.ends+700,spin.ends+1900))):0
      const tableCenter=wheel.x+.83*T.MathUtils.smoothstep(this.camera.aspect,.72,1.4)
      this.cameraAim.set(T.MathUtils.lerp(me.x*.12+wheel.x*.88,tableCenter,blend),1.12,wheel.z)
      this.camera.position.lerp(v(tableCenter,3.53,wheel.z+.26),blend)
      this.camera.lookAt(this.cameraAim)
    }
    const s=this.station,r=this.view?.restaurant
    if(s&&r?.kitchen&&this.tools){
      const {p,fryer,soda}=this.tools.aim(s.point,r)
      const side=fryer||soda
      this.camera.position.set(p.x-(side?1.16:0),1.90,p.z+(side?0:1.09))
      this.camera.lookAt(p.x,1.16,p.z)
    }
    this.tools?.show(s?.point,r,s?.x??0,s?.y??0,!!s?.fillAt,!!s?.phase)
    const eating=this.updateBite(now)
    const free=!eating&&!!me&&!me.chair&&!me.lounge&&!me.homePose&&!me.lift&&me.dining===undefined&&me.boardSeat===undefined&&me.barSeat===undefined&&!this.station&&!me.carrying&&!me.kitchenHand&&!this.view?.arcade?.custody
    this.chaseVisible=false
    if(this.chase&&free){
      const behind=worldMove(me.zone,{x,z,yaw:this.yaw},x+2.8*Math.sin(this.yaw),z+2.8*Math.cos(this.yaw),2.8,true,this.view?.housing?.keys,this.view?.residential,now)
      this.chaseVisible=Math.hypot(behind.x-x,behind.z-z)>.52
      if(this.chaseVisible){
        this.camera.position.set(behind.x,this.camera.position.y+.59,behind.z)
        this.camera.lookAt(x,this.camera.position.y-.84,z)
      }
    }
    const armed=free&&!this.chaseVisible&&!this.pause?this.weapon:undefined
    if(this.holdingFire&&document.pointerLockElement===this.canvas&&(armed==='ar'||armed==='smg'))this.fireAtReticle()
    this.held.setWeapon(armed)
    this.parent.toggleAttribute('data-armed',!!armed)
    if(this.art&&this.camera.parent!==this.art.scene)this.art.scene.add(this.camera)
    if(this.held.parent!==this.camera)this.camera.add(this.held)
    const kick=this.reduced?0:Math.max(0,1-(now-(this.view?.arcade?.lastShot??0))/150)
    this.parent.toggleAttribute('data-hit',!!armed&&!!this.view?.arcade?.lastHit&&now-(this.view.arcade.lastShot??0)<245)
    const bob=this.moving&&!this.reduced?Math.sin(now*(this.sprinting?.015:.011))*.009:0
    this.held.position.set(this.aiming?.012:.22,(this.aiming?-.115:-.235)+bob+kick*.025,-.40+kick*.045)
    this.held.rotation.set(kick*.10,this.aiming?0:.07,0)
    const zoom=this.aiming&&armed?(armed==='sniper'?1.85:1.24):1
    if(this.camera.zoom!==zoom){this.camera.zoom=zoom;this.camera.updateProjectionMatrix()}
    this.camera.updateMatrixWorld()
  }
  private motion(now:number,dt:number){
    if(!this.art)return
    if(this.zone==='hotel:2'||this.zone==='hotel:3'){
      const {x,z}=this.position,local=localSite(this.zone,x,z)
      this.art.resort.tick(this.zone,now,x,z,poolDepth(local.x,local.z)>.04,this.reduced)
    }
    const salon=site('casino',0,0)
    this.art.furnishings.visible=(this.position.x-salon.x)**2+(this.position.z-salon.z)**2<36**2
    this.art.lightZone(this.zone,dt)
    this.art.urban(this.view?.traffic,dt,this.reduced)
    this.art.homes.update(this.view?.residential,this.view?.housing?.occupied,now,dt,this.position.x,this.position.z)
    if(!this.reduced){this.art.ambient?.(now);this.art.restaurant.tick(now)}
    if(this.zone==='gunshop')this.art.shopClerk.pose(now,this.view?.interaction==='counter'?.16:0)
    if(this.zone==='hotel')this.art.hotelClerks.forEach(actor=>actor.pose(now))
    if(this.zone==='bank'||this.zone==='exchange')this.art.staff.forEach(actor=>actor.pose(now))
    const zones=[this.view?.you.zone,this.view?.you.lift?.to].filter((z):z is WorldZone=>!!z)
    const open=(zone:WorldZone)=>[this.view?.you,...this.view?.players??[]].some(p=>{
      if(!p||p.zone!==zone||p.lift)return false
      const at=localSite(zone,p.x,p.z)
      return Math.abs(at.x)<2.13&&at.z<-2.8
    })
    this.art.lobbyDoors(open('exchange'),dt)
    for(const zone of new Set(zones)){
      if(!zone.startsWith('floor:'))continue
      const floor=this.art.floor(zone.slice(6))
      floor?.actors.forEach(actor=>actor.pose(now))
      floor?.doors(open(zone),dt)
    }
    if(!this.art.furnishings.visible)return
    if(this.zone==='casino')this.art.bar.tick(this.view?.bar,now)
    const tables=this.view?.hall?.tables??this.view?.tableMotion
    for(const [i,actor] of this.art.actors.entries()){
      const spin=tables?.[i]?.spin
      actor.pose(now,spin&&now<spin.started+800?.25:0)
    }
    this.art.wheels?.forEach((wheel,i)=>{
      this.art?.wagerTokens[i](this.view?.hall?.tables[i]?.wagers)
      const table=tables?.[i],spin=table?.spin,n=spin?.pocket??table?.recent[0]
      if(n===undefined)return
      const progress=spin&&!this.reduced?T.MathUtils.clamp((now-spin.started)/(spin.ends-spin.started),0,1):1
      spinWheel(wheel,n,progress)
    })
    const table=tables?.[DICE_TABLE_INDEX],die=this.art.publicDie,roll=table?.spin
    if(die){
      const n=roll?.pocket??table?.recent[0]??1
      const p=roll&&!this.reduced?T.MathUtils.clamp((now-roll.started)/(roll.ends-roll.started),0,1):1
      if(p<.86){
        die.rotation.set(p*TAU*5,p*TAU*4,p*TAU*2)
        die.position.set(Math.sin(p*9)*.48,1.165+Math.abs(Math.sin(p*17.5))*(1-p)*.63,.08+Math.sin(p*4)*.24)
      }else{die.quaternion.copy(resultRotation(n));die.position.set(0,1.165,.08)}
    }
  }
  stop(){
    if(this.input.signal.aborted)return
    this.lock(true)
    this.input.abort();this.resize.disconnect();cancelAnimationFrame(this.frame)
    this.clearScene();this.renderer.dispose();this.diagnostics?.close();this.cast.clear()
  }
  private tick=(time:number)=>{
    try{this.updateFrame(time)}catch(error){
      console.error('City graphics failed',error);this.stop();this.onGraphicsError();return
    }
    this.frame=requestAnimationFrame(this.tick)
  }
  private updateFrame(time:number){
    if(document.hidden){this.lastStep=0;return}
    const stepTime=Math.min(.25,(time-(this.lastStep||time))/1000)
    this.lastStep=time
    if(this.gl?.isContextLost())return
    if(this.preparingGraphics){
      this.prepareGraphics(Date.now()+this.clock)
      if(this.preparingGraphics)return
    }
    if(!this.pause&&this.station?.fillAt&&time>=this.station.fillAt)this.completeTool('fill')
    this.step(stepTime);this.prompt()
    const moving=this.moving
    if(moving!==this.wasMoving){this.wasMoving=moving;this.onMovementChange()}
    if(this.gl&&this.fence){
      if(this.gl.clientWaitSync(this.fence,0,0)===this.gl.TIMEOUT_EXPIRED)return
      this.gl.deleteSync(this.fence);this.fence=null
    }
    const dt=Math.min(.14,(time-this.last)/1000||.035);this.last=time
    if(this.art){
      const now=Date.now()+this.clock
      this.cameraView(now);this.avatars(dt,now);this.motion(now,dt)
      this.renderScene()
      if(this.diagnostics)this.diagnostics.rendered(time,this.renderer.info.render.calls,this.figures.size+[...this.npc.values()].filter(f=>f.root.visible).length+this.restaurantNpc.size)
      if(this.gl){this.fence=this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE,0);this.gl.flush()}
    }
    const zone=this.zone??''
    if(this.canvas.dataset.zone!==zone)this.canvas.dataset.zone=zone
    const {x,z}=this.position,ground=!this.zone?.startsWith('floor:')&&groundZone(x,z)
    const opacity=ground==='cave'?String(Math.max(0,(7.7-localSite('cave',x,z).z)/15)**1.55*.94):'0'
    if(this.darkness.style.opacity!==opacity)this.darkness.style.opacity=opacity
  }
}
