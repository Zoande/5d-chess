import * as T from 'three'
import {Scenery} from './landscape.ts'
import type {Letter} from './residential-art.ts'
import {weaponIds,WEAPONS,type WeaponId,type Contact} from './arcade.ts'
import {HeldModel} from './overrun-models.ts'
import {origins,footprint,front,doorLeaves,cells,stair,rise,deskFurniture,shopCounter,shopCases,type Venue} from './civic-venues.ts'

const ivory=0xe4d8bb,brass=0xbb8c49,steel=0x617c85,ink=0x192c39,navy=0x294a5e,stone=0xa9afa7,walnut=0x624438,oak=0x94674d,glass=0x60939c,burgundy=0x69394b
// Batch opaque, burnished, illuminated and transparent surfaces separately.
function builder(parent:T.Object3D,label:Letter){
  const body=new Scenery(),metal=new Scenery(),glow=new Scenery(),glazing=new Scenery()
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,c:number)=>body.add('box',x,y,z,w,h,d,c)
  const trim=(x:number,y:number,z:number,w:number,h:number,d:number,c=brass)=>metal.add('box',x,y,z,w,h,d,c)
  const lit=(x:number,y:number,z:number,w:number,h:number,d:number,c=0xffe0aa)=>glow.add('box',x,y,z,w,h,d,c)
  const pane=(x:number,y:number,z:number,w:number,h:number,d:number)=>glazing.add('box',x,y,z,w,h,d,0x90d6d8)
  function sign(text:string,x:number,y:number,z:number,w:number,h:number,angle=0,fg='#ffebbd',bg='#243c48'){
    const mesh=label(parent,text,[w,h],[x,y,z],fg,bg);mesh.rotation.y=angle
  }
  function column(x:number,z:number,h:number){
    body.add('post',x,h/2,z,.29,h,.29,ivory)
    for(const y of [.12,.29,h-.22,h-.08])metal.add('post',x,y,z,.4,.10,.4,brass)
  }
  function pendant(x:number,z:number,y:number){
    trim(x,y+.17,z,.055,.4,.055);metal.add('post',x,y-.06,z,.55,.12,.55,brass)
    glow.add('post',x,y-.18,z,.43,.15,.43,0xffdda1)
  }
  function panes(x:number,z:number,y:number,w:number,h:number,f:number,open=false){
    if(open)pane(x,y,z,w,h,.035)
    else{box(x,y,z,w,h,.13,ink);trim(x,y,z+.073*f,w-.12,h-.13,.035,glass)}
    for(const k of [-1,1]){
      trim(x+k*w/2,y,z+.10*f,.065,h+.08,.065)
      trim(x,y+k*h/2,z+.10*f,w+.12,.065,.065)
    }
    trim(x,y,z+.102*f,.047,h,.055);trim(x,y+.19*h,z+.11*f,w,.045,.06)
    box(x,y-h/2-.055,z+.13*f,w+.23,.11,.27,ivory)
  }
  function tileFloor(w:number,d:number,scheme:number[],skip:(x:number,z:number)=>boolean=()=>false){
    const nx=Math.ceil(w/.95),nz=Math.ceil(d/.9),tw=w/nx,td=d/nz
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
      const x=(i+.5)*tw-w/2,z=(j+.5)*td-d/2
      if(!skip(x,z))box(x,.027,z,tw-.018,.048,td-.018,scheme[(i+j)%scheme.length])
    }
  }
  function counter(x:number,z:number,w:number,forward:number,c:number){
    box(x,.5,z,w,.97,1,c);trim(x,.10,z,w+.03,.09,1.03)
    box(x,1.045,z,w+.18,.14,1.14,ivory);trim(x,.957,z,w+.12,.045,1.08)
    for(let i=0;i<3;i++){
      const px=x+(i-1)*w*.31,pz=z+forward*.515
      box(px,.51,pz,w*.28,.62,.03,ink)
      for(const k of [-1,1])trim(px+k*w*.14,.51,pz+forward*.016,.024,.64,.025)
    }
    box(x-.36,1.18,z,.48,.22,.08,ink);trim(x-.36,1.18,z+forward*.045,.38,.13,.012,glass)
    trim(x+w*.33,1.24,z,.037,.27,.037);metal.add('crown',x+w*.33,1.4,z,.39,.22,.26,0x778c78)
  }
  function finish(){
    body.finish(parent)
    metal.finish(parent,new T.MeshStandardMaterial({roughness:.32,metalness:.38}))
    glow.finish(parent,new T.MeshBasicMaterial())
    glazing.finish(parent,new T.MeshStandardMaterial({transparent:true,opacity:.27,roughness:.17,metalness:.12,depthWrite:false}))
  }
  return {box,trim,lit,pane,sign,column,pendant,panes,tileFloor,counter,finish,body,metal,glow}
}
type Kit=ReturnType<typeof builder>
function shell(k:Kit,id:Venue,h:number){
  const {w,d}=footprint[id],f=front[id],side=f.sign,z=f.z
  k.box(0,.01,0,w,.055,d,ink)
  k.box(0,h/2,-z,w,h,.17,id==='station'?navy:burgundy)
  for(const dir of [-1,1]){
    k.box(dir*w/2,h/2,0,.16,h,d, id==='station'?navy:ink)
    k.trim(dir*(w/2-.10),.25,0,.06,.13,d,brass)
    const edge=dir*w/2,doorEdge=f.x+dir*.98
    const mid=(edge+doorEdge)/2,span=Math.abs(edge-doorEdge)
    if(id==='station')k.box(mid,h/2,z,span,h,.17,stone)
    else{
      const center=dir*2.93,low=.61,high=2.47
      k.box(mid,low/2,z,span,low,.17,burgundy)
      k.box(mid,(h+high)/2,z,span,h-high,.17,burgundy)
      for(const [a,b] of [[edge,center+dir*1.62],[doorEdge,center-dir*1.62]])k.box((a+b)/2,1.54,z,Math.abs(a-b),1.86,.17,burgundy)
    }
    k.trim(doorEdge,1.25,z,.11,2.5,.28);k.lit(doorEdge,1.27,z-side*.16,.035,2.3,.04)
  }
  for(const leaf of doorLeaves(id)){
    k.pane(leaf.x,1.16,leaf.z,leaf.w,2.25,leaf.d)
    for(const dir of [-1,1])k.trim(leaf.x,1.16,leaf.z+dir*leaf.d/2,.077,2.3,.05)
    for(const y of [.10,1.03,2.28])k.trim(leaf.x,y,leaf.z,.08,.056,leaf.d)
  }
  k.box(f.x,(h+2.42)/2,z,2,h-2.42,.19,ink)
  k.trim(f.x,2.43,z,2.12,.11,.25)
  k.box(f.x,.03,z+side*.46,2.24,.08,.95,stone)
  k.trim(0,h-.12,z+side*.09,w+.2,.13,.23)
}
function precinctExterior(k:Kit){
  const {w,d}=footprint.station,z=-d/2
  // Retain the landmark's blue bay, civic flag, limestone pilasters and dark blue cornice.
  for(const x of [-7.5,-4.25,3.6,7])k.panes(x,z-.1,1.46,2.3,1.68,-1)
  k.box(0,2.84,z-.37,8.45,.70,.58,navy)
  k.sign('MERIDIAN POLICE',0,2.85,z-.673,7.48,.55,Math.PI)
  k.trim(0,3.22,z-.37,8.65,.09,.66)
  for(const x of [-8.8,-2.35,1.55,8.8])k.column(x,z-.24,3.27)
  k.metal.add('post',-6.16,2.65,z-.66,.062,5.3,.062,brass)
  k.box(-5.69,4.98,z-.66,.91,.55,.038,navy);k.trim(-5.66,4.98,z-.686,.16,.28,.016)
  k.sign('CUSTODY WINGS  A · B',5.5,2.61,z-.21,3.7,.34,Math.PI)
  for(let n=1;n<=5;n++){
    const y=n*rise
    for(const side of [-1,1])k.box(side*(w/2+.02),y+rise/2,0,.12,rise,d,stone)
    for(const side of [-1,1]){
      const wall=side*(d/2+.05)
      k.box(0,y+1.63,wall,w-.4,1.73,.12,navy)
      for(const x of [-7.72,-5.17,-2.62,2.62,5.17,7.72]){
        k.panes(x,wall+side*.09,y+1.68,1.73,1.12,side)
        for(const dx of [-.48,.48])k.trim(x+dx,y+1.68,wall+side*.22,.055,1.15,.065,steel)
      }
    }
    for(const side of [-1,1]){
      k.box(0,y+.10,side*d/2,w+.2,.20,.19,ivory);k.trim(0,y+.23,side*d/2,w+.19,.055,.22)
    }
    for(const x of [-9.09,-1.42,1.42,9.09])k.box(x,y+1.8,z-.17,.27,rise-.1,.27,ivory)
  }
  k.box(0,6*rise,0,w+.35,.28,d+.41,navy)
  k.box(0,6*rise+.21,0,w+.48,.12,d+.51,ivory)
}
function lobby(k:Kit){
  const {w,d}=footprint.station
  k.tileFloor(w-.15,d-.14,[0xc5c6b5,0x839b9b])
  for(const sign of [-1,1])k.trim(-.35+sign*.90,.06,-1.63,.036,.013,3.2)
  for(const item of deskFurniture){
    k.counter(item.x,item.z,item.w,-1,walnut)
    k.box(item.x,2.32,d/2-.15,item.w+.50,1.85,.14,ink)
    k.sign(item.id==='desk'?'PUBLIC ENQUIRIES':'BOOKING & BAIL',item.x,2.55,d/2-.235,item.w,.46,Math.PI)
    for(let i=0;i<4;i++){k.box(item.x+(i-1.5)*.64,1.70,d/2-.23,.59,.52,.13,oak);k.trim(item.x+(i-1.5)*.64,1.74,d/2-.31,.18,.047,.05)}
    k.pendant(item.x,-.1,3.01)
  }
  // A framed civic street map over the waiting bench and a clock beside enquiries.
  const wall=-w/2+.12
  k.box(wall,1.76,-.04,.12,1.70,3.28,brass)
  k.box(wall+.08,1.76,-.04,.10,1.55,3.12,0x698783)
  for(const z of [-1.14,-.52,.23,.88])k.box(wall+.14,1.65,z,.024,1.09,.06,ivory)
  for(const y of [1.32,1.63,1.94])k.box(wall+.16,y,-.06,.025,.067,2.85,ivory)
  k.sign('CIVIC AVENUE',wall+.19,2.35,-.04,2.56,.28,Math.PI/2)
  const clockX=-7.44,clockZ=d/2-.20
  k.metal.add('post',clockX,2.28,clockZ,.80,.11,.80,brass,Math.PI/2,Math.PI/2)
  k.body.add('post',clockX,2.28,clockZ-.07,.69,.06,.69,ivory,Math.PI/2,Math.PI/2)
  k.box(clockX,2.39,clockZ-.12,.033,.23,.03,ink)
  k.box(clockX+.078,2.28,clockZ-.12,.18,.033,.03,ink)
  for(const side of [-1,1])k.column(side*1.49,.73,3.26)
  k.sign('VISITORS  ·  CELL WINGS',0,2.65,.68,2.68,.37,Math.PI)
  for(const x of [-8.2,-7.25]){k.box(x,.46,-2.45,.85,.15,.72,walnut);k.box(x,.85,-2.78,.85,.65,.13,navy)}
  // The decorative ceiling returns around the open stairwell.
  for(const side of [-1,1]){
    k.box(side*(w/4+.62),3.17,0,w/2-1.24,.14,d-.16,0x53625f)
    for(const z of [-2.25,-.35,1.66])k.trim(side*(w/4+.62),3.07,z,w/2-1.24,.09,.09)
  }
  for(const x of [-8.32,-6.18,-2.44,2.44,6.18,8.32])k.trim(x,3.07,0,.09,.10,d-.16)
  for(const x of [-8.21,8.21]){
    k.box(x,1.78,d/2-.13,1.13,1.34,.12,brass)
    k.box(x,1.78,d/2-.22,1.02,1.23,.08,navy)
    for(const dz of [-.26,0,.26])k.trim(x,1.73+dz,d/2-.27,.70,.035,.03,ivory)
    k.sign('MERIDIAN',x,2.16,d/2-.28,.95,.18,Math.PI)
  }
  k.box(0,3.17,-1.30,2.48,.14,4.14,0x53625f)
}
function stairs(k:Kit){
  const n=11,run=stair.end-stair.start,step=run/n
  for(let i=0;i<n;i++)for(const leg of [-1,1]){
    const y=rise*(leg<0?(i+.5)/n:2-(i+.5)/n)/2
    const z=stair.start+(i+.5)*step
    k.box(leg*.6,y-.08,z,1.12,.15,step+.014,stone)
    k.trim(leg*.6,y+.004,z-step*.46,1.1,.021,.028)
    // Brass handrails follow both stair flights, with continuous timber stringers.
    const theta=leg*Math.atan2(rise/2,run)
    if(i===Math.floor(n/2)){
      const length=Math.hypot(run,rise/2)
      for(const edge of [leg*.085,leg*1.14]){
        k.metal.add('box',edge,y+.78,z,length,.07,.065,brass,Math.PI/2,theta)
        k.body.add('box',edge,y-.13,z,length,.22,.08,walnut,Math.PI/2,theta)
      }
    }
    if(i%3===0)for(const x of [leg*.085,leg*1.14])k.trim(x,y+.37,z,.037,.77,.037,steel)
  }
  k.box(0,rise/2-.08,2.91,2.4,.17,.59,stone)
}
function galleryFloor(k:Kit,n:number){
  const {w,d}=footprint.station
  // A continuous floor surrounds the stair opening.
  k.box(0,-.10,-1.31,w,.19,4.22,ink)
  for(const side of [-1,1])k.box(side*(w/4+.61),-.10,2.07,w/2-1.21,.19,2.63,ink)
  k.tileFloor(w-.15,d-.1,[0xb4b7ac,0x809899],(x,z)=>Math.abs(x)<1.45&&z>.55)
  if(n===5)k.box(0,3.30,0,w,.14,d,0x4b5b5c)
  for(const x of [-7.75,-5.18,-2.63,2.63,5.18,7.75])k.trim(x,3.15,0,.10,.12,d)
  k.box(0,1.62,-d/2,w,3.24,.14,navy);k.box(0,1.62,d/2,w,3.24,.14,navy)
  for(const side of [-1,1]){
    k.box(side*w/2,1.62,0,.14,3.24,d,ink)
    k.trim(side*4.93,.069,0,7.71,.018,.065)
    k.sign(side<0?'A  ·  WEST WING':'B  ·  EAST WING',side*8.98,2.14,0,1.54,.47,-side*Math.PI/2)
    const first=(side<0?0:25)+(n-1)*5+1
    k.sign('CELLS '+String(first).padStart(2,'0')+'–'+String(first+4).padStart(2,'0'),side*8.96,1.71,0,1.51,.30,-side*Math.PI/2)
    for(const x of [3.1,7.8])k.pendant(side*x,0,3.03)
  }
  k.sign('LEVEL '+n+'  ·  VISITOR GALLERY',0,2.58,-3.30,3.75,.48)
  for(const c of cells.filter(c=>c.level===n)){
    const bars=c.z-c.row*c.d/2,inside=c.z+c.row*.45
    k.box(c.x+c.w/2,1.47,c.z,.12,2.94,c.d,stone);k.box(c.x-c.w/2,1.47,c.z,.11,2.94,c.d,stone)
    for(let j=-4;j<=4;j++)k.trim(c.x+j*.27,1.27,bars,.046,2.46,.067,steel)
    for(const h of [.13,1.03,2.46])k.trim(c.x,h,bars,c.w,.063,.08,steel)
    k.box(c.x+.78,1.12,bars,.17,.22,.12,brass)
    k.box(c.x+.6,2.50,bars,.96,.39,.12,navy)
    k.sign(String(c.number).padStart(2,'0'),c.x+.6,2.50,bars-c.row*.075,.85,.35,c.row<0?0:Math.PI)
    k.box(c.x-.67,.30,c.z,.78,.30,1.82,walnut);k.box(c.x-.67,.51,c.z,.82,.17,1.85,0x759198)
    k.box(c.x-.67,.65,inside+c.row*.16,.67,.12,.44,ivory)
    k.body.add('post',c.x+.69,.25,c.z-c.row*.51,.46,.48,.61,ivory)
    k.box(c.x+.69,.56,c.z-c.row*.76,.44,.47,.17,ivory)
    k.box(c.x+.65,.77,c.z+c.row*.56,.72,.1,.53,oak);k.trim(c.x+.65,.38,c.z+c.row*.56,.1,.76,.13)
    k.box(c.x+.65,.84,c.z+c.row*.56,.53,.025,.36,0x588987)
    k.lit(c.x,2.35,c.z+c.row*1.10,.76,.07,.07)
  }
  if(n<5)stairs(k)
}
function shop(k:Kit,room:T.Group){
  const displays:{model:HeldModel;id:WeaponId}[]=[]
  function display(id:WeaponId,x:number,y:number,z:number,rotation:number){
    const model=new HeldModel()
    model.position.set(x,y,z);model.rotation.y=rotation
    room.add(model);displays.push({model,id})
  }
  const {w,d}=footprint.gunshop,z=front.gunshop.z
  shell(k,'gunshop',3.95)
  k.box(0,3.31,z+.20,w-.28,.92,.40,ink)
  k.sign('PULSE & PIXEL',0,3.40,z+.415,6.85,.65,0,'#9dfff0','#223444')
  k.sign('ARCADE GUN SHOP',0,2.95,z+.417,3.98,.28,0,'#ffd890','#223444')
  k.lit(0,3.84,z+.23,w-.19,.055,.4,0x6ee8cc)
  for(const x of [-2.93,2.93]){
    k.panes(x,z+.10,1.54,3.24,1.86,1,true)
    k.trim(x,2.58,z+.23,3.59,.15,.49);k.lit(x,2.5,z+.30,2.9,.045,.27)
    k.box(x,.37,z+.11,3.62,.36,.18,ink)
  }
  k.box(0,3.98,0,w+.35,.19,d+.36,ink);k.trim(0,4.09,0,w+.29,.06,d+.29)
  k.tileFloor(w-.18,d-.18,[0xb1aaa1,0x687e83])
  k.box(0,.06,.75,2.53,.04,5.35,burgundy)
  for(const x of [-1.18,1.18])k.trim(x,.084,.75,.036,.012,5.31)
  k.counter(shopCounter.x,shopCounter.z,shopCounter.w,1,walnut)
  k.sign('MARA   /   SALES',shopCounter.x+.42,.73,shopCounter.z+.55,1.04,.20,0,'#b4ffed','#233c40')
  k.box(0,2.04,-d/2+.14,7.69,3.28,.20,ink)
  k.sign('OVERRUN  /  ARMORY',0,3.05,-d/2+.26,5.56,.61,0,'#b4ffed','#1e343d')
  weaponIds.forEach((id,i)=>{
    const x=(i-2)*1.49
    k.box(x,1.98,-d/2+.26,1.44,1.34,.09,0x627775)
    k.trim(x,1.27,-d/2+.29,1.44,.06,.20)
    display(id,x-.21,2.10,-d/2+.46,-Math.PI/2)
    k.sign(WEAPONS[id].name+'  ·  '+WEAPONS[id].price,x,1.46,-d/2+.34,1.39,.21,0,'#ffead4','#273a42')
  })
  for(const [i,r] of shopCases.entries()){
    k.box(r.x,.38,r.z,r.w,.69,r.d,walnut);k.trim(r.x,.77,r.z,r.w+.07,.1,r.d+.07)
    for(const dx of [-.36,.36])for(const dz of [-1.5,1.5])k.trim(r.x+dx,1.06,r.z+dz,.037,.57,.037)
    display(weaponIds[i*2],r.x,1.06,r.z+.79,.12)
    display(weaponIds[i*2+1],r.x,1.06,r.z-.66,-.16)
    k.pane(r.x,1.36,r.z,r.w+.08,.04,r.d+.04);k.lit(r.x+r.w*.45,1.31,r.z,.045,.026,r.d-.12,0x8cebd8)
  }
  for(const x of [-3.15,0,3.15]){k.trim(x,3.82,0,.065,.11,d);k.pendant(x,.42,3.38)}
  for(const z of [-2.8,2.7])k.trim(0,3.82,z,w,.11,.08)
  return ()=>displays.forEach(({model,id})=>model.setWeapon(id))
}
export function arcadeBuildings(scene:T.Scene,label:Letter){
  function group(id:Venue,y=0){const g=new T.Group();g.position.set(origins[id].x,y,origins[id].z);scene.add(g);return g}
  function light(g:T.Group,x:number,y:number,z:number,c:number,p:number,r:number){
    const bulb=new T.PointLight(c,p,r);bulb.position.set(x,y,z);g.add(bulb)
  }
  const exterior=group('station'),outside=builder(exterior,label);precinctExterior(outside);outside.finish()
  const base=group('station'),reception=builder(base,label);shell(reception,'station',rise);lobby(reception);stairs(reception);reception.finish()
  const retail=group('gunshop'),rk=builder(retail,label)
  const showModels=shop(rk,retail)
  rk.finish()
  // CityLighting retains each source's original parent for its visibility checks.
  const lobbyLights=new T.Group(),shopLights=new T.Group()
  base.add(lobbyLights);retail.add(shopLights)
  light(lobbyLights,-4.45,2.86,.15,0xffdbab,19,6.3);light(lobbyLights,4.65,2.86,.15,0xb9e1df,16,6)
  light(shopLights,0,3.32,-1.9,0xffc087,24,7);light(shopLights,-3.25,2.4,1.5,0x88e7d6,14,5.2)
  for(let n=1;n<=5;n++){
    const g=group('station',n*rise),k=builder(g,label)
    galleryFloor(k,n);k.finish();light(g,-4.4,2.85,0,0xffdfa7,14,5);light(g,4.4,2.85,0,0xcdeae7,14,5)
  }
  return (zone:string,x:number,z:number)=>{
    const street=zone==='city'
    if(retail.visible&&Math.hypot(x-origins.gunshop.x,z-origins.gunshop.z)<16)showModels()
    lobbyLights.visible=zone==='station'||street&&Math.hypot(x-origins.station.x,z-origins.station.z)<13
    shopLights.visible=zone==='gunshop'||street&&Math.hypot(x-origins.gunshop.x,z-origins.gunshop.z)<13
  }
}
export function supportModel(kind:Contact['kind']|'drop'){
  const g=new T.Group(),p=new Scenery(),c=kind==='dog'?0xb38457:0x365971
  if(kind==='drop'){
    p.add('box',0,.22,0,.57,.43,.43,0xb88152)
    for(const x of [-.17,.17])p.add('box',x,.23,0,.072,.45,.45,0xe0b576)
  }else if(kind==='helicopter'){
    p.add('crown',0,0,0,1.6,1.15,2.9,c)
    p.add('box',0,.22,1.86,.25,.28,2,c)
    p.add('box',0,.93,0,4.65,.07,.19,0x30383a)
    p.add('box',0,.93,0,.19,.07,4.65,0x30383a)
  }else{
    p.add('crown',0,.48,0,.43,.54,.95,c);p.add('crown',0,.77,-.47,.37,.43,.4,c)
    for(const x of [-.14,.14])for(const z of [-.28,.28])p.add('box',x,.22,z,.11,.42,.12,c)
  }
  p.finish(g);return g
}
