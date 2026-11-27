import {shared as map} from './map-data.ts'
import {royalResort} from './resort-art.ts'
import {armoryClerk,bankStaff,hotelStaff,exchangeStaff,casinoStaff,floorStaff} from './service-staff.ts'
import {arcadeBuildings} from './arcade-art.ts'
import {urbanArt} from './urban-art.ts'
import {basinBed,tunnelBed,poolLevel} from './terrain.ts'
import {ownershipSegments} from './company-desk.ts'
import {DISPLAY_X,DISPLAY_Z,financeFigures,reportTime,type FloorReport,type ShareRegister} from '../floor-report.ts'
import {isExchangeStock,type ExchangeSymbol} from '../stock-model.ts'
import {salonBar} from './salon-bar.ts'
import {buildRestaurant} from './restaurant-art.ts'
import {landscape,Scenery} from './landscape.ts'
import {residentialArt} from './residential-art.ts'
import {contactShade} from './shade.ts'
import {avenues,venueDetail} from './civic.ts'
import * as T from 'three'
import {box,cylinder,mesh,v,dice,resultRotation} from '../casino/scene/geometry.ts'
import {materials} from '../casino/scene/materials.ts'
import {batchOpaque,batchStatic} from '../casino/scene/static-batch.ts'
import {buildBankArchitecture,buildBankVault} from '../bank-stage.ts'
import {buildHall,buildHallTables,WHEEL_X,WHEEL_Z} from '../casino/hall-decor.ts'
import {CityGuest} from './guest.ts'
import {ROULETTE_ORDER} from '../casino-model.ts'
import {SEAT_OFFSETS,type HallTable} from '../roulette-hall-model.ts'
import {FLOOR_HEIGHT,FLOOR_LIST,CREDIT_ADVISOR,FINANCIAL_ADVISOR,BOARD_TABLE,BOARD_SEATS,PLAN,PUBLIC_DICE,site,floorHeight,stockFloor,type WorldZone} from './model.ts'

const std=(color:number,metalness=0,roughness=.74)=>new T.MeshStandardMaterial({color,metalness,roughness})
const brass=std(0xb78b57,.65,.35),oak=std(0x372725,.15,.48),ink=std(0x182930,.28,.57)
const ivory=std(0xd6c4a8,.12,.55),blue=std(0x334f60,.14,.46),gold=new T.MeshBasicMaterial({color:0xffc980})
const glass=new T.MeshStandardMaterial({color:0x8ebfcb,transparent:true,opacity:.23,roughness:.16,metalness:.35,depthWrite:false,side:T.DoubleSide})
const stone=std(0x7c7770,.12,.64),rock=std(0x504847,.14,.91),leather=std(0x3c5665),rug=std(0x54353a)
const foliage=[std(0x2c604d),std(0x43805b),std(0x557c56)]
const tau=Math.PI*2
const light=(scene:T.Object3D,c:number,p:number,r:number,x:number,y:number,z:number)=>{
  const lamp=new T.PointLight(c,p,r)
  lamp.position.set(x,y,z);scene.add(lamp)
}
function block(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,material:T.Material){
  return mesh(new T.BoxGeometry(w,h,d),material,parent,[x,y,z])
}
function texture(width:number,height:number,paint:(ctx:CanvasRenderingContext2D)=>void){
  const c=document.createElement('canvas');c.width=width;c.height=height
  paint(c.getContext('2d')!)
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return texture
}
const bannerTextures=new Map<string,T.CanvasTexture>()
export function banner(parent:T.Object3D,text:string,size:[number,number],point:number[],color='#f5dba5',backdrop='transparent',fit=false){
  const width=fit?Math.min(1024,Math.round(104*size[0]/size[1])):768
  const height=fit?Math.round(width*size[1]/size[0]):160
  const key=JSON.stringify([text,color,backdrop,width,height])
  let map=bannerTextures.get(key)
  if(!map){
    map=texture(width,height,c=>{
      if(backdrop!=='transparent'){c.fillStyle=backdrop;c.fillRect(0,0,width,height)}
      c.fillStyle=color;c.font='600 '+(fit?height*.78:78)+'px Georgia'
      if(fit&&c.measureText(text).width>width*.94)c.font='600 '+height*.78*width*.94/c.measureText(text).width+'px Georgia'
      c.textAlign='center';c.textBaseline='middle';c.fillText(text,width/2,height/2,width*.952)
    })
    bannerTextures.set(key,map)
  }
  return mesh(new T.PlaneGeometry(...size),new T.MeshBasicMaterial({map,transparent:true,depthWrite:false}),parent,point,false)
}
function plane(parent:T.Object3D,w:number,d:number,x:number,y:number,z:number,material:T.Material){
  const m=mesh(new T.PlaneGeometry(w,d),material,parent,[x,y,z])
  m.rotation.x=-Math.PI/2;return m
}
function paving(){
  const map=texture(256,256,c=>{
    c.fillStyle='#27393e';c.fillRect(0,0,256,256)
    for(let j=0;j<8;j++)for(let i=-1;i<8;i++){
      const x=i*40+(j%2)*20,y=j*32
      const shade=['#3a4a4b','#405356','#46585a','#49575a','#374b51'][(j*7+i+10)%5]
      c.fillStyle=shade;c.fillRect(x+1,y+1,38,30)
      c.strokeStyle='#abb6ac30';c.beginPath();c.moveTo(x+3,y+3);c.lineTo(x+37,y+3);c.stroke()
    }
  })
  map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(15,13)
  return new T.MeshStandardMaterial({map,roughness:.62})
}
function bench(parent:T.Object3D,x:number,z:number,yaw=0,material=oak){
  const g=new T.Group();parent.add(g);g.position.set(x,0,z);g.rotation.y=yaw
  box(g,[2.4,.13,.66],[0,.47,0],material,.045)
  box(g,[2.38,.43,.1],[0,.71,.28],material,.041)
  for(const dx of [-.89,.89]){
    block(g,.10,.40,.52,dx,.22,0,brass);box(g,[.08,.28,.55],[dx,.61,0],ink,.02)
  }
  batchStatic(g)
}
function chairSeat(g:T.Object3D,x:number){
  box(g,[.76,.18,.63],[x,.43,1.68],leather,.07)
  box(g,[.75,.52,.13],[x,.73,1.99],leather,.05)
  for(const dx of [-.26,.26])for(const z of [1.44,1.91])cylinder(g,.024,.43,[x+dx,.22,z],brass,9)
}
function potted(parent:T.Object3D,x:number,z:number,scale=1){
  const group=new T.Group();group.position.set(x,0,z);group.scale.setScalar(scale);parent.add(group)
  mesh(new T.CylinderGeometry(.31,.23,.48,13),stone,group,[0,.24,0])
  cylinder(group,.11,1.45,[0,.94,0],oak,9)
  for(let i=0;i<5;i++){
    const a=i*2.4
    mesh(new T.IcosahedronGeometry(.33+i*.02,1),foliage[i%3],group,[Math.sin(a)*.22,1.22+i*.19,Math.cos(a)*.28]).scale.y=1.35
  }
  batchStatic(group);return group
}
function lamp(parent:T.Object3D,x:number,z:number){
  const g=new T.Group();g.position.set(x,0,z);parent.add(g)
  cylinder(g,.16,.27,[0,.16,0],brass,12);cylinder(g,.039,3.15,[0,1.65,0],ink,10)
  block(g,.44,.055,.44,0,3.28,0,brass);block(g,.21,.28,.21,0,3.46,0,gold)
  mesh(new T.ConeGeometry(.28,.19,4),ink,g,[0,3.68,0])
  const pool=texture(48,48,c=>{
    const gradient=c.createRadialGradient(24,24,2,24,24,24);gradient.addColorStop(0,'#ffcb6c46');gradient.addColorStop(1,'#ffcb6c00');c.fillStyle=gradient;c.fillRect(0,0,48,48)
  })
  plane(g,5,5,0,.013,0,new T.MeshBasicMaterial({map:pool,transparent:true,depthWrite:false}))
  batchStatic(g)
}
function glazing(parent:T.Object3D,x:number,y:number,z:number,w:number,h:number){
  const pane=mesh(new T.PlaneGeometry(w,h),glass,parent,[x,y,z],false)
  pane.renderOrder=2
  block(parent,.043,h,.067,x,y,z+.027,brass);block(parent,w,.035,.061,x,y+.12,z+.027,brass)
}
function landmarks(parent:T.Object3D){
  for(const [type,label] of [['hotel','ROYAL HOTEL & CASINO'],['bank','FIFTH DIMENSION BANK'],['exchange','THE EXCHANGE']] as const){
    const {x,z,width,front}=PLAN[type],root=new T.Group();root.position.set(x,0,z);parent.add(root)
    const props=new Scenery(),finish=type==='hotel'?0x774951:type==='bank'?0xcabd9f:0x43636a,gilt=0xbd965e
    const bar=(xx:number,y:number,offset:number,w:number,h:number,d:number,tint:number)=>props.add('box',xx,y,front+offset,w,h,d,tint)
    for(const side of [-1,1]){
      potted(root,side*width*.82,front+.77,1.02)
      for(const fraction of [.53,.94]){
        const a=side*width*fraction
        if(type==='bank'){
          props.add('post',a,2.13,front+.45,.58,4.23,.58,0xd8c9aa)
          for(const y of [.17,.37,3.95,4.14])props.add('post',a,y,front+.45,.79,.16,.79,gilt)
        }else{
          bar(a,2.61,.26,.35,5.2,.52,finish);bar(a,2.68,.55,.075,4.8,.07,gilt)
        }
      }
    }
    const height=type==='bank'?5.35:4.7
    bar(0,height,.25,width*1.98,type==='bank'?1.12:1.24,.52,finish)
    for(const y of [height-.55,height+.55])bar(0,y,.59,width*2.05,.12,.22,gilt)
    bar(0,height,.62,type==='exchange'?6.95:9.35,.94,.12,0x243b40)
    banner(root,label,[type==='exchange'?6.48:8.9,.88],[0,height,front+.69])
    if(type==='hotel'){
      // A stepped crown with sunburst ribs over a projecting bulb-lined marquee.
      for(let n=0;n<3;n++)bar(0,5.43+n*.41,-.14,12.5-n*3.2,.49,.89,finish)
      for(let n=-6;n<=6;n++)bar(n*.46,6.02-Math.abs(n)*.051,.38,.14,1.36-Math.abs(n)*.09,.13,gilt)
      for(const [w,y,d,c] of [[7.15,3.65,2.05,0x754550],[7.42,3.52,2.2,gilt],[7.19,3.38,2.04,0x65434b]])bar(0,y,.92,w,.14,d,c)
      for(let n=-12;n<=12;n++)props.add('crown',n*.279,3.38,front+1.98,.114,.116,.10,0xffe5a9)
      // The rear gaming hall gets its own cornice and repeated window pilasters.
      const end=PLAN.casino.z-PLAN.hotel.z
      for(const side of [-1,1]){
        for(const y of [.27,4.06,5.45])props.add('box',side*11.40,y,end+1.1,.32,.15,15.85,gilt)
        for(let i=0;i<8;i++)props.add('box',side*11.40,2.71,end-6.5+i*2.15,.30,5.43,.15,finish)
      }
    }else if(type==='bank'){
      props.add('gable',0,6.58,front+.08,width*1.96,1.58,.91,0xcbbfa5)
      props.add('gable',0,6.51,front+.57,width*1.57,1.12,.06,0x887f6b)
      props.add('gable',0,6.46,front+.62,width*1.30,.76,.06,0xcbbfa5)
    }else{
      bar(0,3.66,.70,5.82,.18,1.42,0x96b3ae)
      for(const side of [-1,1])for(let k=0;k<3;k++)bar(side*(width-.36*k),7.12,.31,.12,13.8,.24,k%2?gilt:0x899e98)
    }
    for(const side of [-1,1]){
      for(let n=0;n<6;n++){
        const z=-5.8+n*2.05
        props.add('box',side*(width+.17),2.65,z,.18,5.3,.24,finish)
        props.add('box',side*(width+.24),2.65,z,.06,3.76,.07,gilt)
      }
      props.add('box',side*(width+.14),4.81,0,.32,.25,14.6,finish)
    }
    props.finish(root)
  }
}
function fountain(scene:T.Scene){
  const plaza=new T.Group();scene.add(plaza)
  cylinder(plaza,2.87,.18,[0,.13,0],ivory,64);cylinder(plaza,2.68,.35,[0,.345,0],stone,64)
  const glints=texture(256,256,c=>{
    c.fillStyle='#427f83';c.fillRect(0,0,256,256)
    for(let i=0;i<134;i++){
      const x=(i*83)%256,y=(i*61)%256
      c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+3,y-2,x+7,y+1,x+12+i%15,y-1)
      c.strokeStyle=i%5?'#8ec8b94c':'#b2ded580';c.lineWidth=.7;c.stroke()
    }
  })
  cylinder(plaza,2.57,.021,[0,.535,0],new T.MeshStandardMaterial({map:glints,roughness:.22,metalness:.23}),60)
  // Travertine paving, bronze spill bowls and a double-sided cast knight.
  const mosaic=new Scenery()
  for(let i=0;i<72;i++){
    const a=i*tau/72
    mosaic.add('box',3.11*Math.sin(a),.016,3.11*Math.cos(a),.25,.033,.42,i%6===0?0xa27a50:0xcab99b,a)
  }
  mosaic.finish(plaza)
  const basin=(y:number,r:number)=>{
    const bowl=mesh(new T.LatheGeometry([[.24,0],[r*.63,.06],[r,.29],[r,.35],[r*.90,.35],[r*.78,.23],[.24,.15]].map(([x,y])=>new T.Vector2(x,y)),48),brass,plaza,[0,y,0])
    cylinder(plaza,r*.9,.019,[0,bowl.position.y+.329,0],std(0x70aca8,.36,.18),48)
  }
  cylinder(plaza,.41,1.05,[0,.85,0],ivory,16);basin(.97,1.12)
  cylinder(plaza,.24,.79,[0,1.59,0],stone,12);basin(1.73,.59)
  cylinder(plaza,.28,.22,[0,2.10,0],brass,24)
  const silhouette=new T.Shape()
  silhouette.moveTo(-.48,0);silhouette.quadraticCurveTo(-.24,.29,-.44,.79)
  silhouette.lineTo(-.50,.97);silhouette.lineTo(-.42,1.38);silhouette.lineTo(-.23,1.23)
  silhouette.lineTo(-.09,1.47);silhouette.lineTo(.016,1.21);silhouette.quadraticCurveTo(.36,1.12,.66,.74)
  silhouette.lineTo(.59,.56);silhouette.lineTo(.32,.55);silhouette.lineTo(.08,.73)
  silhouette.quadraticCurveTo(-.10,.47,.38,.09);silhouette.lineTo(.40,0);silhouette.closePath()
  const patina=std(0x467b70,.52,.37),cast=new T.Group();cast.position.set(0,2.21,0);cast.rotation.y=-.27;plaza.add(cast)
  mesh(new T.ExtrudeGeometry(silhouette,{depth:.22,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.055,bevelThickness:.05}),patina,cast,[0,0,-.11])
  for(const z of [-.17,.17])mesh(new T.SphereGeometry(.034,10,6),brass,cast,[.09,1.02,z])
  for(let i=0;i<8;i++){
    const a=i*tau/8,point=(r:number,y:number)=>new T.Vector3(Math.sin(a)*r,y,Math.cos(a)*r)
    const arc=new T.QuadraticBezierCurve3(point(.93,1.26),point(1.66,2.21),point(2.20,.535))
    mesh(new T.TubeGeometry(arc,18,.022,5,false),std(0x94d5cf,.21,.24),plaza,[0,0,0],false)
  }
  const ripples=Array.from({length:3},()=>{
    const ring=mesh(new T.RingGeometry(.94,1,56),new T.MeshBasicMaterial({color:0xb7eddf,transparent:true,opacity:.19,depthWrite:false}),plaza,[0,.553,0],false)
    ring.rotation.x=-Math.PI/2;return ring
  })
  const spray=new T.InstancedMesh(new T.SphereGeometry(.031,6,4),std(0xacf1e1,.19,.2),60),matrix=new T.Matrix4()
  spray.frustumCulled=false;plaza.add(spray)
  const animate=(time:number)=>{
    ripples.forEach((ring,i)=>{
      const progress=(time/2200+i/3)%1
      ring.scale.setScalar(.7+progress*1.76);ring.material.opacity=.21*Math.sin(progress*Math.PI)
    })
    for(let i=0;i<spray.count;i++){
      const angle=Math.floor(i/10)*tau/6+.22,steps=(time/1380+i%10/10)%1,d=.62+steps*1.58
      matrix.makeTranslation(Math.sin(angle)*d,1.31+steps*(1.48-2.26*steps),Math.cos(angle)*d)
      spray.setMatrixAt(i,matrix)
    }
    spray.instanceMatrix.needsUpdate=true
  }
  animate(0)
  return animate
}
function street(){
  const group=new T.Group()
  avenues(group)
  plane(group,23.6,14.8,0,-.016,.52,paving())
  landmarks(group)
  const guide=new T.Group();guide.position.set(map.guide.x,0,map.guide.z);guide.rotation.y=map.guide.yaw;group.add(guide)
  box(guide,[2.53,1.31,.17],[0,1.43,0],ink,.06)
  banner(guide,'CLOCK SQUARE',[2.24,.28],[0,1.81,.093])
  banner(guide,'LOCAL DIRECTORY',[2.18,.28],[0,1.42,.093])
  banner(guide,'STREETS   /   VENUES',[2.03,.27],[0,1.11,.093])
  for(const x of [-.98,.98])block(guide,.10,.81,.15,x,.43,0,brass)
  const trailSign=new T.Group();trailSign.position.set(1.8,0,44);trailSign.rotation.y=Math.PI;group.add(trailSign)
  block(trailSign,.14,1.85,.16,0,.92,0,oak)
  block(trailSign,1.58,.35,.14,.17,1.57,0,leather)
  banner(trailSign,'Mill trail  ›',[1.42,.32],[.17,1.57,.078],'#f3e6cc')
  return group
}
function frontWindow(scene:T.Object3D,width:number,z:number,wall:T.Material,openDoor=true){
  const g=new T.Group();scene.add(g)
  block(g,width,.39,.25,0,3.84,z,wall)
  const span=width/7
  for(let n=0;n<=7;n++)block(g,n===0||n===7?.49:.20,3.88,.31,-width/2+n*span,1.94,z,wall)
  for(let n=0;n<7;n++){
    if(n===3&&openDoor)continue
    const x=-width/2+(n+.5)*span
    block(g,span-.13,.72,.23,x,.36,z,wall)
    glazing(g,x,2.237,z,span-.18,3.04)
  }
  batchStatic(g)
}
function gallery(scene:T.Object3D,type:'hotel'|'exchange'){
  const w=type==='hotel'?19:16,dep=type==='hotel'?15.8:15
  const metal=type==='hotel'?brass:blue,wall=type==='hotel'?std(0x583741):std(0x234653)
  if(type==='hotel'){
    plane(scene,w,dep,0,0,0,paving())
    block(scene,w,.25,dep,0,5.82,0,ink)
  }else liftDeck(scene,paving())
  block(scene,.24,5.75,dep,-w/2,2.855,0,wall);block(scene,.24,5.75,dep,w/2,2.855,0,wall)
  if(type==='hotel'){
    block(scene,(w-2.8)/2,5.7,.26,-(w+2.8)/4,2.85,-7.9,wall)
    block(scene,(w-2.8)/2,5.7,.26,(w+2.8)/4,2.85,-7.9,wall)
    block(scene,2.9,2.1,.27,0,4.67,-7.9,wall)
    box(scene,[4.4,.38,.23],[0,3.62,-7.64],ink,.06)
    banner(scene,'GAMING FLOOR',[4.18,.34],[0,3.62,-7.51])
    plane(scene,3.65,15.5,0,.016,0,rug)
    for(const x of [-1.70,1.70])plane(scene,.039,15.38,x,.022,0,brass)
    for(const x of [-6.58,6.58])for(const z of [-.7,3.6]){
      bench(scene,x,z,x>0?Math.PI/2:-Math.PI/2,leather);potted(scene,x*.92,z+.77)
    }
    for(const side of [-1,1]){
      block(scene,4.6,.15,12,side*6.85,3.27,-.75,oak)
      block(scene,.06,.092,11.5,side*4.58,4.21,-.75,metal)
      for(const z of [-5.8,-4,-2.2,-.4,1.4,3.2,4.8])block(scene,.05,1,.05,side*4.58,3.73,z,metal)
    }
    for(const x of [-4.24,4.24]){
      box(scene,[.17,2.94,.16],[x,1.53,-7.68],brass,.025)
      block(scene,.074,1.36,.05,x,2.64,-7.57,gold)
    }
    frontWindow(scene,w,7.78,wall)
  }else{
    liftDoorway(scene,wall)
    banner(scene,'ELEVATOR',[2.28,.3],[0,3.65,-4.07])
    frontWindow(scene,w,7.48,wall)
    plane(scene,3.38,11.48,0,.013,1.84,std(0x294e55))
    for(const x of [-3.78,3.78])potted(scene,x,.8,1.3)
    box(scene,[4.06,1.08,1.01],[.63,.55,-1.97],blue,.09)
    box(scene,[4.16,.066,1.05],[.63,1.095,-1.97],ivory,.055)
    banner(scene,'EXCHANGE RECEPTION',[3.7,.32],[.63,2.52,-2.14])
    bench(scene,5.8,3,Math.PI/2,leather)
    const advisor=FINANCIAL_ADVISOR
    box(scene,[2.4,.86,.86],[advisor.x,.46,advisor.z-1.08],oak,.07)
    box(scene,[2.48,.07,.92],[advisor.x,.92,advisor.z-1.08],ivory,.032)
    banner(scene,'FINANCIAL ADVISOR',[2.22,.28],[advisor.x,.61,advisor.z-.63],'#fae9c4')
    box(scene,[.59,.32,.08],[advisor.x+.73,1.12,advisor.z-1.19],ink,.025)
    potted(scene,-6.92,.2,.77)
  }
  for(const x of [-w*.38,w*.38])for(const z of [-3.0,1.4,5.6]){
    cylinder(scene,.13,5.66,[x,2.84,z],ivory,14)
    cylinder(scene,.2,.11,[x,5.5,z],metal,14)
  }
  for(const x of [-4.3,4.3]){
    light(scene,0xffd298,47,11,x,4,1.2)
    const band=box(scene,[2.2,.077,.51],[x,4.59,-2.7],gold,.028)
    band.castShadow=false
  }
}
function makeScreen(scene:T.Object3D,symbol:string,x:number){
  const canvas=document.createElement('canvas');canvas.width=704;canvas.height=368
  const ctx=canvas.getContext('2d')!,tex=new T.CanvasTexture(canvas)
  tex.colorSpace=T.SRGBColorSpace
  box(scene,[4.17,.21,.67],[x,.15,-4.29],ink,.052)
  for(const a of [-1.48,1.48])box(scene,[.18,2.21,.26],[x+a,1.15,-4.34],brass,.032)
  box(scene,[4.07,2.27,.15],[x,2.59,-4.25],ink,.064)
  mesh(new T.PlaneGeometry(3.96,2.16),new T.MeshBasicMaterial({map:tex}),scene,[x,2.59,-4.16])
  return (points:{price:number}[],current?:number)=>{
    const w=704,h=368
    ctx.fillStyle=symbol==='LOT'?'#352538':symbol==='CAS'?'#221c25':'#12282e';ctx.fillRect(0,0,w,h)
    ctx.font='600 35px Georgia';ctx.fillStyle='#cae7e0';ctx.fillText(symbol,30,53)
    if(current!==undefined){ctx.font='600 26px system-ui';ctx.textAlign='right';ctx.fillText(current.toLocaleString('en',{maximumFractionDigits:2})+' coins',670,53);ctx.textAlign='left'}
    for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(32,85+i*53);ctx.lineTo(671,85+i*53);ctx.strokeStyle='#c7e5e241';ctx.stroke()}
    if(points.length){
      const values=points.map(p=>p.price),lo=Math.min(...values),hi=Math.max(...values),range=Math.max(.01,hi-lo)
      const display=points.length===1?[points[0],points[0]]:points
      ctx.beginPath();display.forEach((p,i)=>{const a=32+639*i/(display.length-1),b=285-(p.price-lo)/range*174;i?ctx.lineTo(a,b):ctx.moveTo(a,b)})
      ctx.strokeStyle=symbol==='CAS'||symbol==='LOT'?'#e9bd73':'#89dfbf';ctx.lineWidth=5;ctx.stroke()
      ctx.lineTo(671,307);ctx.lineTo(32,307);ctx.closePath();ctx.fillStyle='#76cfa522';ctx.fill()
    }
    ctx.fillStyle='#a4bfb8';ctx.font='20px system-ui';ctx.fillText(points.length?'Price history':'Waiting for market data',32,344)
    tex.needsUpdate=true
  }
}
function cave(scene:T.Object3D,oasis:boolean){
  // Ribbons share vertices along the sloping bed, banks and grass lip.
  const ribbon=(left:number,right:number,lh:(z:number)=>number,rh:(z:number)=>number,mat:T.Material)=>{
    const positions:number[]=[],indices:number[]=[],uv:number[]=[]
    for(let i=0;i<=32;i++){
      const z=7.7-i*.5
      positions.push(left,lh(z),z,right,rh(z),z);uv.push(0,i/4,1,i/4)
      if(i){const j=i*2;indices.push(j-2,j-1,j,j,j-1,j+1)}
    }
    const g=new T.BufferGeometry()
    g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals()
    scene.add(new T.Mesh(g,mat))
  }
  const bed=oasis?basinBed:tunnelBed
  const lip=()=>-.085
  ribbon(-4,-2.25,lip,bed,rock);ribbon(-2.25,2.25,bed,bed,std(oasis?0x676f61:0x4f4944));ribbon(2.25,4,bed,lip,rock)
  // A continuous stone vault meets the meadow roof above the underground span.
  const vertices:number[]=[],faces:number[]=[],tints:number[]=[],tone=new T.Color()
  const ribs=12,bays=18
  for(let i=0;i<=bays;i++)for(let j=0;j<=ribs;j++){
    const a=j*Math.PI/ribs,offset=.19*Math.sin(j*2.5+i*.81)+.11*Math.sin(i*1.9+j*.83)
    const z=.92-i*9.2/bays+.33*Math.cos(a*2.7)
    const radius=2.92+offset+.22*Math.cos(i*.42),h=bed(z)
    vertices.push(Math.cos(a)*radius,h+.37+Math.sin(a)*(3.75+offset),z)
    tone.setHex(oasis?0x697b71:0x65594c).multiplyScalar(.78+.24*(1+Math.sin(j*1.8+i*.73))/2)
    tints.push(tone.r,tone.g,tone.b)
    if(i&&j){const k=i*(ribs+1)+j;faces.push(k-ribs-2,k-1,k,k-ribs-2,k,k-ribs-1)}
  }
  const vault=new T.BufferGeometry()
  vault.setAttribute('position',new T.Float32BufferAttribute(vertices,3));vault.setAttribute('color',new T.Float32BufferAttribute(tints,3));vault.setIndex(faces);vault.computeVertexNormals()
  scene.add(new T.Mesh(vault,new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.87,side:T.DoubleSide})))
  const details=new Scenery()
  for(let i=0;i<21;i++)for(const side of [-1,1]){
    const z=7.25-i*.74+.23*Math.sin(i*2.7+side),h=bed(z)
    const x=side*(2.42+.16*Math.sin(i*1.8))
    details.add('stone',x,h+.31,z,.8,.72+Math.sin(i)*.19,1.16,oasis?0x617568:0x5b534b,i)
    if(z>-.2){
      const edge=side*(3.65+.16*Math.cos(i))
      details.add('stone',edge,-.14,z,.74,.52,.98,0x899079,i)
      for(let k=0;k<3;k++)details.add('pine',edge+k*.12,.12,z+.11*k,.13,.34,.13,0x899358,i,k*.12)
    }else if(oasis){
      for(let k=0;k<4;k++){
        const reach=.18+.52*k/4
        details.add('pine',side*(2.27-reach*.19),poolLevel+.13+reach*.37,z+.08*k,.14,reach,.13,k%2?0x709973:0x487a60,i,side*(.21+.12*k))
      }
    }else if(i%3===0)details.add('pine',x*.68,h+3.05,z,.3,.88,.3,0x70675d,i,Math.PI)
  }
  details.finish(scene)
  if(oasis){
    const normal=texture(128,128,c=>{
      const img=c.createImageData(128,128)
      for(let y=0;y<128;y++)for(let x=0;x<128;x++){
        const k=4*(128*y+x),u=x*Math.PI/64,v=y*Math.PI/64
        img.data[k]=128+23*Math.cos(5*u+2*Math.sin(2*v));img.data[k+1]=128+32*Math.cos(7*v+1.8*Math.sin(u));img.data[k+2]=249;img.data[k+3]=255
      }
      c.putImageData(img,0,0)
    })
    normal.colorSpace=T.NoColorSpace;normal.wrapS=normal.wrapT=T.RepeatWrapping;normal.repeat.set(2,3)
    plane(scene,4.48,6.81,0,poolLevel,-4.88,new T.MeshStandardMaterial({color:0x307b79,normalMap:normal,normalScale:new T.Vector2(.64,.64),roughness:.28,metalness:.16,transparent:true,opacity:.73}))
    light(scene,0x72dfdf,32,8,0,-2.9,-4.8)
    light(scene,0xf4d5a1,12,6,-1.4,-1.5,.9)
  }else light(scene,0xb3c6bf,8,5,0,-.42,4.4)
  block(scene,7,8,.28,0,-4.05,-8.22,rock)
  batchStatic(scene)
  const ripples:T.Mesh[]=[]
  if(oasis){
    const film=new T.MeshBasicMaterial({color:0xade9de,transparent:true,opacity:.27,depthWrite:false})
    for(let i=0;i<7;i++){
      const ring=mesh(new T.RingGeometry(.43,.44,36),film,scene,[Math.sin(i*3.3)*1.2,poolLevel+.015,-2.6-i*.67])
      ring.rotation.x=-Math.PI/2;ripples.push(ring)
    }
  }
  return (time:number)=>ripples.forEach((r,i)=>{const s=.78+.35*Math.sin(time*.0017+i);r.scale.set(s,s*.62,1)})
}

function liftDeck(room:T.Object3D,finish:T.Material){
  const edge=-4.17,front=7.48
  plane(room,16,front-edge,0,0,(front+edge)/2,finish)
  for(const x of [-4.76,4.76])plane(room,6.48,3.31,x,0,-5.825,finish)
}
function liftDoorway(room:T.Object3D,finish:T.Material){
  for(const x of [-4.74,4.74])block(room,6.52,5.75,.25,x,2.86,-6.12,finish)
  block(room,3.07,2.5,.25,0,4.64,-4.21,finish)
  for(const x of [-1.52,1.52])block(room,.065,3.44,.10,x,1.73,-4.20,brass)
  block(room,3.13,.075,.10,0,3.42,-4.20,brass)
}
function slidingDoors(room:T.Object3D){
  const metal=std(0x82999d,.53,.30),edge=std(0x344c53,.55,.34)
  const leaves=[-1,1].map(side=>{
    const door=new T.Group();room.add(door)
    box(door,[1.48,3.35,.13],[0,1.69,-4.18],metal,.024)
    for(const x of [-.64,.64])block(door,.032,3.18,.016,x,1.70,-4.105,edge)
    block(door,1.42,.105,.035,0,.14,-4.1,edge)
    block(door,.39,.034,.03,side*.39,1.54,-4.09,brass)
    door.position.x=side*.745
    return door
  })
  for(const side of [-1,1])box(room,[1.43,3.44,.29],[side*2.23,1.72,-3.99],ink,.041)
  let progress=0
  return (open:boolean,dt:number)=>{
    progress=T.MathUtils.damp(progress,Number(open),9.5,dt)
    leaves.forEach((door,i)=>door.position.x=(i?1:-1)*(.745+1.47*progress))
  }
}
function boardroom(room:T.Group,symbol:string){
  const casino=symbol==='CAS',metal=casino?brass:std(0x77989f,.47,.29)
  const cloth=std(casino?0x48303b:0x27434b),base=casino?oak:std(0x172930,.37,.5)
  const face=casino?'#f5d08d':'#9addd5'
  const surround=std(casino?0x4c282c:0x37575d)
  const glow=new T.MeshBasicMaterial({color:casino?0xffbe76:0xb7e5de})
  for(const side of [-1,1]){
    block(room,.14,4.06,6.64,side*7.73,2.03,3.94,surround)
    if(casino){
      for(const at of [1.22,3.86,6.49]){
        box(room,[.084,2.73,1.94],[side*7.64,2.59,at],oak,.039)
        for(const z of [-.79,.79])block(room,.06,2.44,.045,side*7.575,2.59,at+z,brass)
        for(const z of [-.29,0,.29]){
          const stem=box(room,[.10,1.39,.043],[side*7.54,2.63,at+z],metal,.015)
          stem.rotation.x=z*.60
        }
        box(room,[.17,.55,.39],[side*7.46,2.43,at],glow,.05)
      }
    }else{
      for(let i=0;i<31;i++)block(room,.082,3.89,.028,side*7.635,2.04,.68+i*.213,base)
      for(const y of [1.03,3.52])block(room,.05,.049,6.18,side*7.55,y,3.92,glow)
      const title=banner(room,side<0?'FIFTH DIMENSION BANK':'CAPITAL MARKETS',[5,.34],[side*7.51,2.65,3.95],face)
      title.rotation.y=-side*Math.PI/2
    }
  }
  const {z}=BOARD_TABLE
  plane(room,9.5,5.76,0,.018,z,cloth)
  if(casino){
    for(const sign of [-1,1])plane(room,9.45,.055,0,.022,z+sign*2.77,metal)
    for(const x of [-4.21,4.21])for(const sign of [-1,1]){
      const accent=plane(room,.28,.28,x,.024,z+sign*2.26,metal);accent.rotation.z=Math.PI/4
    }
  }else{
    for(let stripe=-4;stripe<=4;stripe++)plane(room,.032,5.68,stripe,.022,z,metal)
  }
  for(const x of [-4.66,4.66])plane(room,.071,5.67,x,.022,z,metal)
  for(const x of [-1.84,1.84]){
    box(room,[1.08,.72,.88],[x,.39,z],base,.093)
    box(room,[1.26,.092,1.05],[x,.094,z],metal,.035)
  }
  box(room,[6.48,.154,1.90],[0,.89,z],base,.077)
  box(room,[6.53,.039,1.93],[0,.973,z],metal,.018)
  box(room,[6.40,.034,1.81],[0,1,z],cloth,.014)
  for(const seat of BOARD_SEATS){
    const g=new T.Group();room.add(g);g.position.set(seat.x,0,seat.z);g.rotation.y=seat.yaw
    box(g,[.72,.17,.61],[0,.49,0],base,.066)
    box(g,[.74,.52,.14],[0,.76,.28],cloth,.058)
    for(const x of [-.26,.26])for(const z of [-.21,.21])cylinder(g,.028,.43,[x,.24,z],metal,9)
    box(g,[.206,.014,.21],[0,1.026,-.60],ivory,.012)
    mesh(new T.CylinderGeometry(.048,.035,.145,12),metal,g,[.24,1.1,-.61])
  }
  for(const x of [-6.86,6.86])for(const at of [1.1,4.5]){
    block(room,.38,4.5,.48,x,2.25,at,base)
    block(room,.12,3.31,.093,x,2.31,at+.27,metal)
    block(room,.083,2.94,.04,x,2.31,at+.33,casino?gold:new T.MeshBasicMaterial({color:0xa8e6e7}))
  }
  for(const x of [-2.57,0,2.57]){
    const pendant=new T.Group();room.add(pendant);pendant.position.set(x,0,z)
    cylinder(pendant,.028,2.27,[0,4.63,0],metal,12)
    if(casino){
      cylinder(pendant,.43,.22,[0,3.52,0],gold,22)
      cylinder(pendant,.49,.055,[0,3.65,0],metal,26)
    }else{
      box(pendant,[1.4,.09,.60],[0,3.63,0],metal,.031)
      box(pendant,[1.27,.045,.51],[0,3.58,0],new T.MeshBasicMaterial({color:0xd6eedc}),.021)
    }
  }
  const sign=banner(room,casino?'ROYAL SALON  /  CAS':'FIFTH DIMENSION  /  BNK',[5.24,.46],[0,2.78,7.08],face)
  sign.rotation.y=Math.PI
  for(const x of [-5.6,5.6])potted(room,x,6.43,.89)
}

function displayPanel(room:T.Group,side:number,base:T.Material,metal:T.Material){
  const canvas=document.createElement('canvas');canvas.width=1152;canvas.height=640
  const ctx=canvas.getContext('2d')!,map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace
  const display=new T.Group();display.position.set(side*DISPLAY_X,0,DISPLAY_Z);display.rotation.y=-side*Math.PI/2;room.add(display)
  box(display,[4.5,.16,.64],[0,.09,0],base,.04)
  for(const x of [-1.78,1.78])box(display,[.15,.8,.28],[x,.43,-.08],metal,.038)
  box(display,[4.42,2.54,.14],[0,1.98,0],base,.062)
  mesh(new T.PlaneGeometry(4.25,2.36),new T.MeshBasicMaterial({map}),display,[0,1.98,.082],false)
  return {ctx,map}
}

function floorDisplays(room:T.Group,symbol:ExchangeSymbol){
  const warm=symbol==='CAS'||symbol==='LOT',base=warm?oak:std(0x172930,.37,.5)
  const metal=warm?brass:std(0x77989f,.47,.29),face=warm?'#f5d08d':'#9addd5'
  const {ctx,map}=displayPanel(room,1,base,metal),finance=displayPanel(room,-1,base,metal)
  let previous=''
  const ownership=(c?:ShareRegister)=>{
    const rows=c?ownershipSegments(c):[]
    const key=JSON.stringify([c?.issued,c?.yourShares,rows])
    if(key===previous)return
    previous=key
    const tint=ctx.createLinearGradient(0,0,1152,640);tint.addColorStop(0,warm?'#301e2b':'#102e37');tint.addColorStop(1,'#07171c')
    ctx.fillStyle=tint;ctx.fillRect(0,0,1152,640)
    ctx.fillStyle=face;ctx.font='650 35px system-ui';ctx.fillText(symbol+'   SHARE REGISTER',54,72)
    ctx.fillRect(54,94,1044,2)
    if(!c){ctx.font='26px system-ui';ctx.fillText('Connecting to the exchange…',54,154);map.needsUpdate=true;return}
    const format=(share:number)=>new Intl.NumberFormat('en',{style:'percent',maximumFractionDigits:2}).format(share/c.issued)
    let start=-Math.PI/2
    rows.forEach(([name,shares,color],i)=>{
      const end=start+tau*shares/c.issued,y=144+i*42
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(270,313,171,start,end);ctx.arc(270,313,109,end,start,true);ctx.closePath();ctx.fill()
      ctx.fillRect(508,y-18,17,17);ctx.fillStyle='#e5f0ed';ctx.font='550 25px system-ui';ctx.fillText(name,543,y,406)
      ctx.textAlign='right';ctx.fillText(format(shares),1094,y);ctx.textAlign='left'
      start=end
    })
    ctx.fillStyle='#f1f3e6';ctx.textAlign='center';ctx.font='600 37px system-ui';ctx.fillText(c.issued.toLocaleString('en'),270,316)
    ctx.fillStyle='#adc9c6';ctx.font='22px system-ui';ctx.fillText('shares issued',270,349);ctx.textAlign='left'
    ctx.fillStyle='#ffffff15';ctx.fillRect(54,572,1044,43);ctx.fillStyle=face;ctx.font='650 26px system-ui'
    ctx.fillText('YOUR SHARE   '+format(c.yourShares),74,602)
    map.needsUpdate=true
  }
  function update(report?:FloorReport){
    ownership(report?.register)
    const pen=finance.ctx
    const wash=pen.createLinearGradient(0,0,1152,640)
    wash.addColorStop(0,warm?'#392934':'#163940');wash.addColorStop(1,'#09181e')
    pen.fillStyle=wash;pen.fillRect(0,0,1152,640)
    pen.fillStyle=face;pen.font='650 35px system-ui';pen.fillText(symbol+'   FINANCIAL REPORT',54,72)
    pen.textAlign='right';pen.font='23px system-ui';pen.fillText('COINS',1098,72);pen.textAlign='left'
    pen.fillRect(54,94,1044,2)
    if(report){
      financeFigures(report).forEach(([label,value],i)=>{
        const x=i%2?602:54,y=i<2?154:362
        pen.fillStyle='#bfd3d2';pen.font='27px system-ui';pen.fillText(label,x,y)
        pen.fillStyle=i===3?face:'#f7f5e9';pen.font='600 60px system-ui';pen.fillText(value,x,y+86,478)
      })
      pen.fillStyle='#ffffff36';pen.fillRect(54,285,1044,2)
      pen.fillStyle=face;pen.font='25px system-ui'
      pen.fillText('NEXT PAYOUT   '+reportTime(report.nextPayout)+'  ·  Amsterdam',54,555)
      pen.fillStyle='#b9ccc9';pen.font='21px system-ui';pen.fillText('Based on current earnings and shareholdings.',54,602)
    }else{pen.font='26px system-ui';pen.fillText('Connecting to the exchange…',54,154)}
    finance.map.needsUpdate=true
  }
  update()
  return update
}

function elevator(scene:T.Object3D){
  const shaft=new T.Group();shaft.position.set(PLAN.exchange.x,0,PLAN.exchange.z);scene.add(shaft)
  const height=(FLOOR_LIST.length+1)*FLOOR_HEIGHT
  block(shaft,3.15,height,.22,0,height/2,-7.45,ink)
  for(const side of [-1,1]){
    block(shaft,.13,height,3.23,side*1.53,height/2,-5.83,ink)
    block(shaft,.072,height,.065,side*1.34,height/2,-7.26,brass)
  }
  return shaft
}
// The clock and enamel signs use the precinct’s slate and brass finishes.
function prisonTradingFloor(room:T.Group){
  const slate=std(0x344357,.28,.48),enamel=std(0x182b40,.22,.57)
  // Hang the fascia in front of the lift head, above its clear opening.
  for(const x of [-2.16,2.16])block(room,.08,1.06,.08,x,5.35,-2.96,brass)
  block(room,4.68,1.06,.18,0,4.39,-2.97,slate)
  for(const y of [3.87,4.91])block(room,4.74,.065,.22,0,y,-2.95,brass)
  banner(room,'MERIDIAN PRISON',[3.22,.39],[.47,4.54,-2.86],'#f6dfad','#26394a',true)
  banner(room,'PRI  /  DAILY DIVIDENDS',[2.92,.20],[.47,4.15,-2.86],'#d4c5a4','#26394a',true)
  const seal=new T.Group();seal.position.set(-1.73,4.4,-2.85);room.add(seal)
  mesh(new T.CircleGeometry(.397,48),enamel,seal,[0,0,0])
  mesh(new T.TorusGeometry(.397,.024,8,48),brass,seal,[0,0,.025])
  for(let i=0;i<12;i++){
    const a=i*tau/12
    block(seal,.022,.063,.023,.33*Math.sin(a),.33*Math.cos(a),.042,ivory).rotation.z=-a
  }
  block(seal,.025,.22,.025,0,.10,.058,gold)
  block(seal,.18,.025,.025,.08,0,.058,gold)
  for(const side of [-1,1]){
    const x=side*2.7
    block(room,2.29,.73,.055,x,.54,-1.40,slate)
    banner(room,side<0?'PRI   /   BUY':'PRI   /   SELL',[1.52,.24],[x,.55,-1.36],'#f6dfad','#26394a',true)
  }
  plane(room,4.39,5.14,0,.019,2,brass)
  plane(room,4.29,5.04,0,.022,2,enamel)
  for(const x of [-1.94,1.94])plane(room,.025,4.76,x,.024,2,brass)
}
function tower(shaft:T.Object3D){
  const tile=paving(),standardWall=std(0x234653),casinoWall=std(0x51333c),bankWall=std(0x375560),lotteryWall=std(0x453356),prisonWall=std(0x344357),trim=std(0x90adb2,.28,.48)
  const sections:T.Group[]=[]
  for(const [i,{symbol}] of FLOOR_LIST.entries()){
    const height=floorHeight(`floor:${symbol}`)
    if(i%8===0){
      const section=new T.Group();section.name='Exchange exterior';section.position.y=height;shaft.add(section);sections.push(section)
    }
    const section=sections.at(-1)!
    const room=new T.Group();room.position.y=height-section.position.y;section.add(room)
    const wall=symbol==='CAS'?casinoWall:symbol==='BNK'?bankWall:symbol==='LOT'?lotteryWall:symbol==='PRI'?prisonWall:standardWall
    liftDeck(room,tile);liftDoorway(room,wall)
    for(const side of [-1,1]){
      const x=side*7.96
      block(room,.22,1.09,15,x,.545,0,wall)
      block(room,.27,.63,15,x,5.57,0,wall)
      const pane=mesh(new T.PlaneGeometry(14.83,4.22),glass,room,[x,3.17,0],false)
      pane.rotation.y=side*Math.PI/2
      for(const z of [-7.42,-4.47,-1.49,1.49,4.47,7.42])block(room,.34,5.81,.15,x,2.9,z,trim)
      block(room,.32,.11,15,x,3.49,0,ink)
      block(room,.47,.22,15,x,5.76,0,trim)
      // A service spine encloses the landings and reads vertically at street level.
      block(room,6.35,5.87,.17,side*4.75,2.92,-7.46,wall)
      for(const k of [2.32,4.62,6.91])block(room,.18,6,.39,side*k,3,-7.51,trim)
    }
    block(room,16,.18,11.65,0,5.91,1.655,ink)
    block(room,16,1.16,.16,0,.58,7.48,wall)
    block(room,16,.44,.22,0,5.68,7.48,trim)
    const pane=mesh(new T.PlaneGeometry(15.8,4.32),glass,room,[0,3.31,7.47],false);pane.renderOrder=2
    for(const x of [-7.9,-5.26,-2.63,0,2.63,5.26,7.9])block(room,.082,4.56,.092,x,3.31,7.446,trim)
    for(const x of [-2.7,2.7]){
      block(room,2.33,.98,.70,x,.49,-1.77,symbol==='CAS'?oak:symbol==='LOT'?lotteryWall:blue)
      block(room,2.45,.06,.74,x,1.015,-1.77,symbol==='CAS'||symbol==='LOT'?brass:ivory)
    }
    for(const x of [-3.8,3.8])block(room,2.6,.055,.37,x,5.77,1.07,gold)
  }
  for(const section of sections)batchOpaque(section)
  const decor=new Map<string,{actors:CityGuest[];screens:ReturnType<typeof makeScreen>[];doors:ReturnType<typeof slidingDoors>;report?:ReturnType<typeof floorDisplays>}>()
  return (symbol:string)=>{
    let entry=decor.get(symbol)
    if(!entry){
      if(!stockFloor(symbol))return
      const room=new T.Group();room.position.y=floorHeight(`floor:${symbol}`);shaft.add(room)
      venueDetail(room,'floor',symbol)
      const name=FLOOR_LIST.find(stock=>stock.symbol===symbol)!.name
      if(symbol==='PRI')prisonTradingFloor(room)
      else if(symbol==='LOT')banner(room,name,[5.9,.58],[0,4.28,-4.08],'#ffe8b7','#453356',true)
      else banner(room,name,[6,.39],[0,4.17,-4.08],symbol==='CAS'?'#ffdca1':'#ccecee')
      const actors=floorStaff.map((p,i)=>new CityGuest(room,p.x,p.z,i?0xd2a17d:0xaa7c61,i?(symbol==='CAS'?0x674451:0x374d5d):0x365263,true,i))
      const screens=[makeScreen(room,symbol,-4.53),makeScreen(room,symbol,4.53)]
      if(symbol==='LOT'){
        // The gilded draw cage is suspended above the brokers, clear of the aisle.
        const carpet=texture(512,512,ctx=>{
          ctx.fillStyle='#432a48';ctx.fillRect(0,0,512,512)
          for(const inset of [8,15]){
            ctx.strokeStyle='#c99c62';ctx.lineWidth=2;ctx.strokeRect(inset,inset,512-2*inset,512-2*inset)
          }
          ctx.translate(256,256);ctx.strokeStyle='#986b57'
          for(let n=0;n<12;n++){
            ctx.rotate(Math.PI/6);ctx.beginPath();ctx.ellipse(0,-41,28,66,0,0,Math.PI*2);ctx.stroke()
          }
        })
        plane(room,6,4.1,0,.018,2.15,new T.MeshStandardMaterial({map:carpet,roughness:1}))
        const center=new T.Group();center.position.set(0,2.65,-2.3);room.add(center)
        const hoop=new T.TorusGeometry(.84,.024,8,48)
        for(let n=0;n<8;n++)mesh(hoop,brass,center,[0,0,0]).rotation.y=n*Math.PI/8
        const ball=new T.SphereGeometry(.19,16,12)
        for(let n=0;n<7;n++){
          const a=n*Math.PI*2/7
          mesh(ball,[ivory,gold,lotteryWall][n%3],center,[.49*Math.cos(a),-.3+.13*(n%3),.43*Math.sin(a)])
        }
        const rim=mesh(new T.TorusGeometry(.84,.035,8,48),gold,center,[0,0,0]);rim.rotation.x=Math.PI/2
        for(const [x,number] of [[-2.7,'07'],[2.7,'49']] as const){
          mesh(new T.CylinderGeometry(.27,.27,.065,32),brass,room,[x,.57,-1.39]).rotation.x=Math.PI/2
          banner(room,number,[.43,.24],[x,.57,-1.35],'#fff3cb','transparent',true)
        }
        block(room,.045,2.5,.045,0,4.64,-2.3,brass)
        for(const x of [-.5,.5])block(room,.018,.44,.018,x,1.57,-2.3,brass)
        banner(room,'WEEKLY DRAW   /   SHARE DEALING',[4.1,.27],[0,1.27,-2.28],'#f9df9b','#453356',true)
      }
      if(symbol==='CAS'||symbol==='BNK')boardroom(room,symbol)
      const report=isExchangeStock(symbol)?floorDisplays(room,symbol):undefined
      entry={actors,screens,doors:slidingDoors(room),report};decor.set(symbol,entry)
    }
    return entry
  }
}
export function liftPlatform(parent:T.Object3D){
  const car=new T.Group();parent.add(car)
  car.position.set(PLAN.exchange.x,0,PLAN.exchange.z)
  block(car,2.93,.16,3.06,0,-.075,-5.74,bronzeFloor)
  block(car,2.93,.052,.1,0,.038,-4.22,brass)
  const doors=new T.Group();car.add(doors);doors.name='travel-doors';doors.visible=false
  for(const side of [-1,1]){
    block(doors,1.47,3.38,.09,side*.735,1.69,-4.29,bronzeFloor)
    block(doors,.035,3.29,.04,side*.061,1.67,-4.36,brass)
    block(car,.07,3.42,2.98,side*1.46,1.71,-5.78,ink)
  }
  block(car,2.93,3.4,.08,0,1.7,-7.23,ink)
  block(car,2.92,.08,2.98,0,3.44,-5.75,ivory)
  return car
}
const bronzeFloor=std(0x60584c,.35,.74)
export function makeWorldArt(open:boolean){
  const scene=new T.Scene()
  const sky=texture(1024,512,c=>{
    const wash=c.createLinearGradient(0,0,0,512)
    for(const [stop,tint] of [[0,'#427fa9'],[.31,'#83b5cc'],[.47,'#ded6bd'],[.53,'#e8ddc6'],[1,'#a9ad97']] as const)wash.addColorStop(stop,tint)
    c.fillStyle=wash;c.fillRect(0,0,1024,512)
    const sun=c.createRadialGradient(692,207,1,692,207,55)
    sun.addColorStop(0,'#fff6d9');sun.addColorStop(.095,'#fff1cb');sun.addColorStop(.12,'#ffedcaaa');sun.addColorStop(1,'#ffdfaa00')
    c.fillStyle=sun;c.fillRect(636,151,112,112)
  })
  sky.mapping=T.EquirectangularReflectionMapping;scene.background=sky
  scene.fog=new T.FogExp2(0xc2c9be,.0056)
  const skylight=new T.HemisphereLight(0xdbe9ff,0xa89072,1.95)
  scene.add(skylight)
  const sun=new T.DirectionalLight(0xffe2bb,1.47);sun.position.set(-12,18,10);scene.add(sun)
  scene.add(street());contactShade(scene);const water=fountain(scene),{wind,seal}=landscape(scene)
  const civic=arcadeBuildings(scene,(parent,text,size,point,fg,bg)=>banner(parent,text,size,point,fg,bg,true))
  const homes=residentialArt(scene,banner),urban=urbanArt(scene,banner)
  const ambient=(time:number)=>{water(time);wind(time);poolRipples(time)}
  const rooms={} as Record<keyof typeof PLAN,T.Group>
  for(const zone of Object.keys(PLAN) as (keyof typeof PLAN)[]){
    const group=new T.Group(),{x,z}=PLAN[zone];group.position.set(x,0,z);scene.add(group);rooms[zone]=group
  }
  const {hotel,casino,bank,exchange}=rooms
  gallery(hotel,'hotel');venueDetail(hotel,'hotel');batchOpaque(hotel)
  const resort=royalResort(hotel,banner)
  buildHall(casino,true);const bar=salonBar(casino);venueDetail(casino,'casino')
  const wheels=buildHallTables(casino),wagerTokens=wheels.map(wheel=>rouletteWagers(wheel.group)),actors:CityGuest[]=[]
  for(const {x,z} of casinoStaff.slice(0,3))actors.push(new CityGuest(casino,x,z,0xb78968,0x29323d,true))
  const table=new T.Group();casino.add(table);table.position.set(PUBLIC_DICE.x,0,PUBLIC_DICE.z)
  box(table,[4.05,.24,2.03],[0,.88,0],oak,.13);box(table,[4.14,.042,2.13],[0,1.008,0],brass,.045)
  box(table,[3.95,.039,1.94],[0,1.045,0],std(0x653f57),.033)
  for(const offset of SEAT_OFFSETS)chairSeat(table,offset)
  for(const dx of [-1.42,1.42])for(const dz of [-.59,.59]){
    cylinder(table,.19,.018,[dx,1.079,dz],brass,30)
    cylinder(table,.165,.019,[dx,1.084,dz],leather,30)
  }
  banner(casino,'THE AMBER BAR',[3.3,.41],[-6.25,3.67,8.47]).rotation.y=Math.PI
  banner(table,'IVORY DICE',[2.45,.40],[0,1.68,-.87])
  const publicDie=dice(materials());table.add(publicDie);publicDie.position.set(0,1.165,.08);publicDie.quaternion.copy(resultRotation(1))
  actors.push(new CityGuest(casino,casinoStaff[3].x,casinoStaff[3].z,0x9a6e53,0x57363e,true,1))
  for(const x of [-1,1]){
    const wall=new T.Group();casino.add(wall);wall.position.set(x*11.25,0,1.1);wall.rotation.y=x*Math.PI/2
    frontWindow(wall,15.59,0,ink,false)
    block(wall,15.5,1.62,.30,0,4.68,0,ink)
  }
  for(const side of [-1,1]){
    const width=(22.5-2.8)/2
    block(casino,width,3.74,.25,side*(2.8+width)/2,1.87,8.9,ink)
  }
  block(casino,22.5,1.65,.25,0,4.56,8.9,ink)
  venueDetail(bank,'bank');buildBankArchitecture(bank,true);buildBankVault(bank);frontWindow(bank,20.4,8.05,blue)
  block(bank,20.4,2.68,.25,0,5.33,8.05,blue)
  const advisor=CREDIT_ADVISOR,deskZ=advisor.z-1.25
  box(bank,[1.92,.74,.72],[advisor.x,.39,deskZ],oak,.044)
  box(bank,[2.02,.077,.79],[advisor.x,.81,deskZ],ivory,.049)
  box(bank,[.41,.008,.37],[advisor.x-.46,.858,deskZ+.12],ivory,.013)
  cylinder(bank,.04,.31,[advisor.x+.63,.99,deskZ],brass,10)
  cylinder(bank,.16,.045,[advisor.x+.63,1.15,deskZ],gold,18)
  banner(bank,'CREDIT ADVISOR',[1.67,.25],[advisor.x,.56,deskZ+.367])
  batchOpaque(bank)
  gallery(exchange,'exchange');venueDetail(exchange,'exchange');batchOpaque(exchange)
  const uniforms=[[0xb38469,0x284557,1],[0xd5ad86,0x313c59,2],[0x946344,0x213344,0],[0xbc8b68,0x49676c,2],[0xc89b79,0x4b3d58,1],[0xa57556,0x304550,2]]
  const staff=[...bankStaff,...exchangeStaff].map((p,i)=>new CityGuest(i<bankStaff.length?bank:exchange,p.x,p.z,uniforms[i][0],uniforms[i][1],true,uniforms[i][2]))
  const shopPoint=site('gunshop',armoryClerk.x,armoryClerk.z)
  const shopClerk=new CityGuest(scene,shopPoint.x,shopPoint.z,0x95694e,0x286963,true,1)
  shopClerk.pose(0)
  const hotelClerks=hotelStaff.map((p,i)=>new CityGuest(hotel,p.x,p.z,i?0xbb9473:0xab8069,i?0x684458:0x384a45,true,i+1))
  const lobbyDoors=slidingDoors(exchange),floor=tower(elevator(scene))
  rooms.cave.rotation.y=rooms.oasis.rotation.y=Math.PI
  cave(rooms.cave,false)
  const poolRipples=cave(rooms.oasis,true)
  const grotto=rooms.cave;seal.visible=!open;grotto.visible=open
  const restaurant=buildRestaurant(rooms.kfc)
  function lightZone(zone:string|undefined,dt:number){
    const target=zone==='cave'?.38:zone==='oasis'?.84:zone==='casino'?1.24:zone==='city'?1.95:1.62
    skylight.intensity=T.MathUtils.damp(skylight.intensity,target,3,dt)
  }
  return {scene,civic,resort,lightZone,homes,urban,actors,staff,shopClerk,hotelClerks,wheels,wagerTokens,publicDie,floor,ambient,seal,grotto,restaurant,bar,lobbyDoors}
}
function rouletteWagers(table:T.Group){
  const tones=[0xe9c186,0x72bcbc,0xcf8799,0xc2a8e5]
  const stacks=tones.map(color=>{
    const group=new T.Group();table.add(group)
    const chip=std(color,.2,.46)
    const layers=Array.from({length:5},(_,i)=>cylinder(group,.059,.011,[0,i*.012,0],i%2===0?chip:ivory,18))
    group.visible=false
    return {group,layers}
  })
  let current:HallTable['wagers']
  let digest=''
  return (wagers:HallTable['wagers'])=>{
    if(wagers===current)return
    current=wagers
    const key=wagers?JSON.stringify(wagers):''
    if(key===digest)return
    digest=key
    stacks.forEach(({group,layers},i)=>{
      const bet=wagers?.[i];group.visible=!!bet
      if(!bet)return
      const {choice,stake}=bet
      const options=['low','even','white','black','odd','high']
      const x=typeof choice==='number'?(choice===0?42:86+(choice-1)%12*46):108+options.indexOf(choice)*92
      const z=typeof choice==='number'?(choice===0?178:117+Math.floor((choice-1)/12)*60):301
      group.position.set(.84+(x/640-.5)*1.92+(i%2-.5)*.056,1.055,-.11+(z/384-.5)*1.29+(Math.floor(i/2)-.5)*.056)
      const height=Math.min(5,Math.max(1,Math.floor(Math.log10(stake))+1))
      layers.forEach((layer,j)=>layer.visible=j<height)
    })
  }
}
export function spinWheel(wheel:ReturnType<typeof buildHallTables>[number],result:number,p:number){
  const step=tau/37,rot=(1-(1-p)**2.45)*(tau*5+.62)
  wheel.rotor.rotation.y=rot
  const stop=-(ROULETTE_ORDER.indexOf(result)+.5)*step+.62
  const angle=stop-8*tau*(1-p)**2.5
  const r=T.MathUtils.lerp(.637,.486,T.MathUtils.smoothstep(p,.62,.98))
  wheel.marker.position.set(WHEEL_X+Math.cos(angle)*r,1.207,WHEEL_Z-Math.sin(angle)*r)
  wheel.aura.material.opacity=.22+.31*p
}
