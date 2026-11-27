import {housingClerk} from './service-staff.ts'
import * as T from 'three'
import {travelPrint} from './hotel-finishes.ts'
import {parquet,wovenRug} from './domestic-finishes.ts'
import {Scenery} from './landscape.ts'
import {batchOpaque} from '../casino/scene/static-batch.ts'
import {RESIDENCES,UNITS,towerClerk} from './housing.ts'
import {BUILDINGS,STOREY,doorSwing,liftHeight,liftOpening,stairHeight,type Building,type Fixture,type Rect,type ResidentialView} from './residential.ts'
import {CityGuest} from './guest.ts'

export type Letter=(g:T.Object3D,title:string,size:[number,number],position:number[],color?:string,backdrop?:string)=>T.Object3D
const chalk=0xe1d7c4,oak=0x825d43,walnut=0x4f3830,brass=0xc5a66b,iron=0x334345,porcelain=0xe8e6da
const windowMaterial=new T.MeshStandardMaterial({forceSinglePass:true,color:0xb0d9e1,transparent:true,opacity:.14,depthWrite:false,side:T.DoubleSide,roughness:.2})
const architecture=new T.MeshStandardMaterial({roughness:.77,flatShading:true})
const luminaire=new T.MeshBasicMaterial({color:0xffe5b4})
const cube=new T.BoxGeometry(1,1,1),windowQuad=new T.PlaneGeometry(1,1)
const palette=[
  {wall:0x996450,trim:0xd6c5ab,roof:0x615250,floor:0x9a775a,fabric:0x6c7f63},
  {wall:0xb7c2bd,trim:0x4c676d,roof:0x40565c,floor:0xa49481,fabric:0x2c797c},
  {wall:0xe0c39d,trim:0xf4e4c8,roof:0x9b6147,floor:0x9b774e,fabric:0x907368},
  {wall:0xb0c1b7,trim:0x426562,roof:0x4b676e,floor:0xab9375,fabric:0x547d82},
  {wall:0xa86854,trim:0xddc8a9,roof:0x626472,floor:0x886b54,fabric:0x786977},
  {wall:0xd4c4ad,trim:0x72624f,roof:0x814d43,floor:0xa98a65,fabric:0x81835e},
]
function modelFurniture(f:Fixture,p:Scenery,y:number,tone:number){
  const c=Math.cos(f.yaw),s=Math.sin(f.yaw),{w,d}=f
  const add=(kind:'box'|'post'|'crown'|'cushion',x:number,h:number,z:number,a:number,b:number,e:number,color:number)=>p.add(kind,f.x+c*x+s*z,y+h,f.z+c*z-s*x,a,b,e,color,f.yaw)
  const box=(x:number,h:number,z:number,a:number,b:number,e:number,color:number)=>add('box',x,h,z,a,b,e,color)
  const legs=(h:number,shade=walnut)=>{for(const x of [-w*.39,w*.39])for(const z of [-d*.35,d*.35])box(x,h/2,z,.075,h,.075,shade)}
  const top=(height:number,color=oak)=>box(0,height,0,w,.075,d,color)
  if(f.kind==='sofa'||f.kind==='chair'){
    legs(.2)
    box(0,.31,0,w,.24,d,walnut)
    box(0,.70,d*.39,w,.55,d*.22,tone)
    const seats=f.kind==='sofa'?Math.round(w/.77):1
    for(let n=0;n<seats;n++){
      const x=((n+.5)/seats-.5)*w*.83
      add('cushion',x,.445,-d*.055,w*.81/seats,.12,d*.76,tone)
      add('cushion',x,.72,d*.245,w*.77/seats,.38,.105,tone)
    }
    for(const side of [-1,1])box(side*w*.452,.57,-.02,.11,.25,d*.89, f.kind==='chair'?oak:tone)
    if(f.kind==='sofa'){
      add('cushion',-w*.29,.574,d*.16,.30,.25,.15,0xd8bb91)
      add('cushion',w*.31,.57,d*.16,.29,.235,.15,0xa5a485)
    }
  }else if(f.kind==='bed'){
    legs(.18);box(0,.28,0,w,.22,d,walnut)
    add('cushion',0,.46,0,w*.96,.18,d*.965,chalk)
    add('cushion',0,.55,.24,w*.99,.13,d*.74,tone)
    box(0,.62,.3,w*.98,.026,.86,0xdabda5)
    box(0,.76,-d*.46,w,.72,.12,walnut)
    for(let i=-2;i<=2;i++)add('cushion',i*w*.185,.83,-d*.423,w*.175,.47,.07,tone)
    for(const dz of [-.28,-.21,.20,.28])box(0,.641,.3+dz,w*.97,.013,.024,tone)
    for(const x of [-w*.23,w*.23])add('cushion',x,.57,-d*.35,w*.43,.115,.4,porcelain)
    box(-w*.625,.38,-d*.37,.35,.56,.42,oak)
    add('post',-w*.625,.72,-d*.37,.078,.22,.078,brass)
    add('post',-w*.625,.88,-d*.37,.24,.19,.24,0xeed6ad)
  }else if(f.kind==='fridge'){
    for(const side of [-1,1])box(side*w*.455,.89,.043,w*.09,1.72,d-.086,0xb6c4c3)
    box(0,.88,d*.44,w,1.73,d*.12,0x95a8a5)
    for(const h of [.13,.54,.91,1.23,1.72])box(0,h,.065,w*.89,.057,d*.73,0xc0d2cf)
    box(0,.046,0,w*.9,.092,d*.92,iron)
  }else if(f.kind==='counter'){
    const sections=Math.round(w/.53)
    box(0,.05,0,w*.97,.1,d*.85,walnut)
    box(0,.455,0,w,.81,d,tone)
    top(.9,porcelain)
    box(0,1.08,d*.45,w,.28,.035,chalk)
    for(let i=0;i<sections;i++){
      const x=(i+.5)*w/sections-w/2
      box(x,.47,-d*.5,w/sections-.024,.715,.038,i===sections-1?iron:tone)
      box(x,.68,-d*.545,.17,.026,.043,brass)
      box(x,.56,-d*.535,w/sections-.036,.018,.022,walnut)
    }
    // Open shelves sit above the existing kitchen run, within its footprint.
    box(0,1.54,d*.30,w*.94,.065,d*.42,oak)
    for(const dx of [-.32,.32])box(w*dx,1.43,d*.39,.058,.17,.09,brass)
    for(let i=0;i<4;i++)add('post',w*(-.33+i*.14),1.66,d*.30,.105,.16,.105,i%2?porcelain:0x658981)
    add('post',w*.28,1.64,d*.31,.19,.12,.19,0xb98156)
    for(let i=0;i<4;i++)add('crown',w*.28+(i%2-.5)*.09,1.75+i*.025,d*.32,.14,.13,.11,i%2?0x708e62:0x55775c)
    const x=-w*.26
    box(x,.945,0,.42,.022,.43,0x758b8e)
    box(x,.953,0,.31,.016,.32,iron)
    add('post',x,1.05,.17,.041,.22,.041,brass)
    box(x,1.15,.097,.044,.044,.14,brass)
    for(const h of [-.103,.113])for(const k of [-.105,.103])add('post',w*.26+k,.954,h,.13,.028,.13,iron)
  }else if(f.kind==='table'||f.kind==='coffee'||f.kind==='desk'){
    const h=f.kind==='coffee'?.44:f.kind==='desk'?1.01:.77
    legs(h-.05);top(h)
    if(f.kind==='desk'){
      box(-w*.26,.58,0,.51,.65,d,oak)
      for(let i=0;i<3;i++)box(-w*.26,.39+i*.19,-d*.53,.2,.026,.03,brass)
      box(.53,h+.26,.04,.54,.35,.07,iron)
      box(.53,h+.26,-.003,.49,.29,.012,0x708f94)
      box(.49,h+.055,-.20,.4,.02,.13,iron)
      box(-.39,h+.054,.07,.3,.014,.24,chalk)
      box(-.49,h+.068,.09,.15,.01,.2,0xe1ad84)
    }else if(f.kind==='coffee'){
      for(let i=0;i<3;i++)box(-w*.20,h+.064+i*.035,.01,.30-i*.013,.032,.205,[tone,porcelain,0xb37051][i])
      add('post',w*.25,h+.111,-d*.10,.105,.13,.105,porcelain)
      add('post',w*.25,h+.179,-d*.10,.078,.008,.078,walnut)
    }else{
      add('post',0,h+.085,0,.28,.075,.28,porcelain)
      add('crown',.08,h+.156,.02,.16,.16,.17,0xbc7854)
    }
  }else if(f.kind==='shower'){
    box(0,.07,0,w,.14,d,porcelain)
    for(const x of [-w*.47,w*.47])for(const z of [-d*.47,d*.47])box(x,1.04,z,.037,1.95,.038,iron)
    box(0,1.14,d*.47,w*.94,1.99,.048,0xafc6bb)
    box(0,1.83,d*.35,.3,.038,.26,0x8a9e9b)
    box(-w*.49,1.14,0,.035,.42,.48,tone)
  }else if(f.kind==='toilet'){
    box(0,.28,d*.35,w,.56,.21,porcelain)
    add('post',0,.16,-d*.06,w*.57,.32,d*.57,porcelain)
    add('post',0,.395,-d*.13,w,.21,d*.66,porcelain)
    add('post',0,.507,-d*.13,w*.8,.029,d*.52,0xbdbfb3)
  }else if(f.kind==='vanity'){
    box(0,.39,0,w,.74,d,oak)
    box(0,.76,0,w*1.08,.11,d*1.05,porcelain)
    add('post',0,.824,0,w*.65,.055,d*.59,0x9bafab)
    add('post',0,.91,d*.36,.04,.18,.04,brass)
    box(0,1.36,d*.46,w*.9,.54,.051,iron)
    box(0,1.36,d*.41,w*.78,.45,.023,0xa3c6cc)
    box(0,.56,-d*.515,.19,.03,.041,brass)
  }else if(f.kind==='wardrobe'||f.kind==='mail'||f.kind==='media'){
    const h=f.kind==='wardrobe'?1.93:f.kind==='media'?.54:1.42
    box(0,h/2,0,w,h,d,walnut)
    const n=f.kind==='mail'?12:2
    for(let i=0;i<n;i++){
      const x=(i%2-.5)*w/2,sy=f.kind==='mail'?1.07-Math.floor(i/2)*.155:h/2
      box(x,sy,-d*.5,w/2-.028,f.kind==='mail'?.144:h*.89,.038,oak)
      box(x+.035,sy,-d*.55,.092,.024,.031,brass)
    }
    if(f.kind==='media'){
      box(0,1.04,.025,w*.87,.56,.077,iron)
      box(0,1.04,-.02,w*.8,.49,.014,0x556974)
    }
  }else{
    add('post',0,.19,0,.43,.38,.42,0x9d644d)
    for(let i=0;i<5;i++)add('crown',Math.sin(i*2)*.18,.48+i*.084,Math.cos(i*2)*.21,.28,.34,.28,i%2?0x6c906a:0x4a7457)
  }
}

function smallBox(parent:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,mat:T.Material){
  const mesh=new T.Mesh(cube,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh
}
const glassDoor=new T.MeshStandardMaterial({color:0x4c6667,roughness:.52})
const leaf=new T.MeshStandardMaterial({color:0x675548,roughness:.66})
const fridgeLeaf=new T.MeshStandardMaterial({color:0xd1dedb,roughness:.46,metalness:.25})
const metal=new T.MeshStandardMaterial({color:0xb99b64,metalness:.65,roughness:.38})
const liftWall=new T.MeshStandardMaterial({color:0x626f72,roughness:.58,metalness:.18})

function furnitureShadow(){
  const canvas=document.createElement('canvas')
  canvas.width=canvas.height=64
  const c=canvas.getContext('2d')!,gradient=c.createRadialGradient(32,32,5,32,32,31)
  gradient.addColorStop(0,'#32282158')
  gradient.addColorStop(.62,'#32282128')
  gradient.addColorStop(1,'#32282100')
  c.fillStyle=gradient;c.fillRect(0,0,64,64)
  return new T.MeshBasicMaterial({map:new T.CanvasTexture(canvas),transparent:true,depthWrite:false})
}
function slabs(rect:Rect,hole?:Rect){
  return hole?[
    {...rect,r:hole.l},{...rect,l:hole.r},{l:hole.l,r:hole.r,b:rect.b,f:hole.b},{l:hole.l,r:hole.r,b:hole.f,f:rect.f},
  ]:[rect]
}
export function residentialArt(parent:T.Object3D,letter:Letter){
  const shadows=furnitureShadow(),stamp=new T.Object3D()
  const doors=new Map<string,{hinge:T.Group;angle:number}>(),fridges=new Map<string,T.Group>()
  const signs=new Map<string,T.Object3D>(),clerks:CityGuest[]=[]
  const lifts:{id:string;x:number;group:T.Group;leaves:T.Mesh[];landings:T.Mesh[][];indicator:HTMLCanvasElement;texture:T.CanvasTexture;shown:number}[]=[]
  const floors:{group:T.Group;x:number;z:number}[]=[]
  for(const b of BUILDINGS){
    const root=new T.Group();root.position.set(b.x,b.baseY??0,b.z);root.rotation.y=b.facing<0?Math.PI:0;parent.add(root)
    const tone=palette[b.style],r=b.rect
    const label=(text:string,x:number,y:number,z:number,width:number)=>letter(root,text,[width,.26],[x,y,z],'#f7ebd3','#34474b')
    const width=r.r-r.l,length=r.f-r.b,cz=(r.b+r.f)/2
    const car=b.lift?new T.Group():undefined
    if(car&&b.lift){
      const {x,z}=b.lift
      root.add(car)
      smallBox(car,x,-.08,3.19,2.13,.16,2.25,liftWall)
      smallBox(car,x,2.66,3.19,2.14,.12,2.25,liftWall)
      for(const side of [-1,1])smallBox(car,x+side*1.065,1.31,3.2,.10,2.62,2.3,liftWall)
      smallBox(car,x,1.31,4.29,2.16,2.62,.17,liftWall)
      smallBox(car,x,2.57,3.2,1.39,.048,.63,luminaire)
      smallBox(car,x+.96,1.47,2.49,.09,.64,.32,metal)
      for(let q=0;q<5;q++)smallBox(car,x+.896,1.22+q*.107,2.5,.037,.058,.088,luminaire)
      const leaves=[-1,1].map(side=>smallBox(car,x+side*.385,1.22,2.14,.77,2.43,.08,liftWall))
      const indicator=document.createElement('canvas');indicator.width=96;indicator.height=64
      const texture=new T.CanvasTexture(indicator);texture.colorSpace=T.SRGBColorSpace
      const display=new T.Mesh(windowQuad,new T.MeshBasicMaterial({map:texture}))
      display.position.set(x,2.21,z+1.17);display.rotation.y=Math.PI;display.scale.set(.52,.35,1);car.add(display)
      lifts.push({id:b.id,x,group:car,leaves,landings:[],indicator,texture,shown:-1})
    }
    for(const [level,f] of b.levels.entries()){
      const g=new T.Group(),p=new Scenery(),inside=new T.Group(),furniture=new Scenery();root.add(g,inside);g.position.y=inside.position.y=level*STOREY
      const moving=new Set<T.Object3D>()
      floors.push({group:inside,x:b.x,z:b.z})
      const box=(x:number,y:number,z:number,w:number,h:number,d:number,c:number)=>p.add('box',x,y,z,w,h,d,c)
      const tile=(a:Rect,y:number,h:number,c:number)=>box((a.l+a.r)/2,y,(a.b+a.f)/2,a.r-a.l,h,a.f-a.b,c)
      const s=b.stairs,shaft=b.lift?{l:b.lift.x-1.12,r:b.lift.x+1.12,b:2.03,f:4.42}:undefined
      const hole=s&&level>0?{l:s.x-s.width,r:s.x+s.width,b:Math.min(s.back,s.front),f:Math.max(s.back,s.front)}:undefined
      for(const a of slabs(r,hole).flatMap(part=>shaft&&part.l<shaft.l&&part.r>shaft.r?slabs(part,shaft).filter(q=>q.f>q.b):[part])){
        tile(a,-.097,.194,level?tone.floor:0xb9a98d)
        if((level||b.block===undefined)&&a.r>a.l&&a.f>a.b)parquet(inside,a,tone.floor)
        if(level)tile(a,-.205,.016,0xf0e3cb)
      }
      if(b.block!==undefined&&!b.tower){
        box(0,.013,.315,width-.13,.012,2.62,level?0x9b8165:0xcbbcad)
        for(const z of [-.81,1.42])box(0,.022,z,width-.28,.007,.054,tone.trim)
        for(const x of [-5.2,-1.8,1.8,5.2]){
          box(x,.022,.35,3.37,.009,1.14,level?0x635e50:0xa98668)
          for(const d of [-.49,.49])box(x,.028,.35+d,3.16,.007,.023,tone.trim)
        }
        if(!level){
          box(4.87,.015,-6.11,4.4,.015,3.21,0x8b7564)
          box(-4.29,.012,-5.71,4.62,.014,3.46,0x97765f)
          for(const z of [-7.14,-4.28])box(-4.29,.021,z,4.11,.007,.067,0xc1a57d)
          for(const x of [-6.28,-2.30])box(x,.022,-5.71,.062,.007,2.91,0xc1a57d)
        }
      }
      if(b.block!==undefined&&!b.tower){
        box(0,-.014,0.315,width-.13,.018,2.62,level?0x9b8165:0xcbbcad)
        if(level===0)box(0,.017,6.17,2.44,.03,1.51,0x4e625e)
      }
      for(const a of f.tiles){
        if(a.kind==='balcony'){
          const {l,r,b,f}=a.rect
          tile(a.rect,-.10,.20,tone.trim)
          for(const x of [l,r])box(x,.51,(b+f)/2,.06,.09,f-b,iron)
          box((l+r)/2,.51,b,r-l,.09,.07,iron)
          for(let x=l;x<r+.02;x+=.32)box(x,.27,b,.056,.54,.058,iron)
          for(const x of [l,r])for(const z of [b+.35,b+.75,b+1.12])box(x,.27,z,.052,.54,.058,iron)
          continue
        }
        tile(a.rect,.013,.022,a.kind==='bath'?0x96afa7:0xd1baa2)
        if(a.kind==='bath')for(let x=a.rect.l+.25;x<a.rect.r;x+=.26)box(x,.027,(a.rect.b+a.rect.f)/2,.009,.003,a.rect.f-a.rect.b,0xbfd0c3)
      }
      for(const w of f.walls){
        const glazing:T.Matrix4[]=[]
        const center=w.axis==='x'?w.x:w.z,ends=[...w.openings].sort((a,b)=>a.at-b.at)
        let start=center-w.length/2
        const segment=(l:number,r:number,low:number,upper:number,color:number,thickness=w.outer?.23:.16)=>{
          if(r-l<.003)return
          const a=(l+r)/2,h=(upper+low)/2
          if(w.axis==='x')box(a,h,w.z,r-l,upper-low,thickness,color)
          else box(w.x,h,a,thickness,upper-low,r-l,color)
        }
        const finish=w.outer?tone.wall:0xe3d8c6
        for(const cut of ends){
          const l=cut.at-cut.width/2,r=cut.at+cut.width/2,window=cut.kind==='window',sill=window?.86:0,top=window?2.37:cut.kind==='door'?2.19:2.46
          segment(start,l,0,STOREY,finish);segment(l,r,top,STOREY,finish)
          if(window)segment(l,r,0,sill,finish)
          if(cut.kind!=='lift'){
            for(const edge of [l,r])segment(edge-.037,edge+.037,sill,top,tone.trim,.27)
            segment(l-.037,r+.037,top-.038,top+.038,tone.trim,.27)
          }
          if(window){
            segment(l-.055,r+.055,sill-.03,sill+.065,tone.trim,.37)
            segment(cut.at-.022,cut.at+.022,sill,top,tone.trim,.095)
            segment(l,r,1.43,1.47,tone.trim,.096)
            stamp.rotation.set(0,w.axis==='x'?0:Math.PI/2,0)
            stamp.position.set(w.axis==='x'?cut.at:w.x,(sill+top)/2,w.axis==='x'?w.z:cut.at)
            stamp.scale.set(cut.width,top-sill,1);stamp.updateMatrix()
            glazing.push(stamp.matrix.clone())
            if(w.axis==='x'&&w.z<0&&level>0||b.block===undefined&&w.axis==='x'&&w.z<0){
              box(cut.at,2.44,w.z+.137,cut.width+.19,.033,.048,brass)
              for(const side of [-1,1])for(let i=0;i<4;i++)box(cut.at+side*(cut.width*.48-i*.046),1.64,w.z+.165+Math.sin(i*2)*.027,.057,1.5,.047,tone.fabric)
            }
            if(b.block===undefined)for(const side of [-1,1])segment(cut.at+side*(cut.width*.51+.18)-.16,cut.at+side*(cut.width*.51+.18)+.16,sill,top,tone.trim,.278)
          }
          segment(start,l,.026,.133,w.outer?tone.trim:oak,w.outer?.26:.20)
          start=r
        }
        // Every pane here is flat, coplanar and disjoint. Depth-sort each wall as a unit.
        if(glazing.length){
          const facade=new T.InstancedMesh(windowQuad,windowMaterial,glazing.length)
          glazing.forEach((matrix,i)=>facade.setMatrixAt(i,matrix))
          facade.computeBoundingSphere();g.add(facade)
        }
        segment(start,center+w.length/2,0,STOREY,finish)
        segment(start,center+w.length/2,.026,.133,w.outer?tone.trim:oak,w.outer?.26:.20)
      }
      for(const d of f.doors){
        const a=new T.Group();a.position.set(d.x,0,d.z);a.rotation.y=d.axis==='x'?0:-Math.PI/2
        const outer=f.walls.some(w=>w.outer&&w.openings.some(o=>o.id===d.id))
        ;(outer?g:inside).add(a)
        const hinge=new T.Group();hinge.position.x=-d.width/2;a.add(hinge)
        moving.add(hinge)
        smallBox(hinge,d.width/2,1.095,0,d.width-.03,2.177,.069,d.id.endsWith('street')?glassDoor:leaf)
        smallBox(hinge,d.width*.57,1.41,.043,d.width*.71,.76,.027,d.id.endsWith('street')?liftWall:metal)
        for(const side of [-1,1])smallBox(hinge,d.width-.14,.99,side*.066,.135,.034,.102,metal)
        batchOpaque(hinge)
        const direction=(d.reverse?-1:1)*(d.axis==='x'?1:-1)
        doors.set(d.id,{hinge,angle:direction})
      }
      const contacts=new T.InstancedMesh(windowQuad,shadows,f.fixtures.length)
      inside.add(contacts)
      for(const [i,item] of f.fixtures.entries()){
        stamp.position.set(item.x,.036,item.z)
        stamp.rotation.set(-Math.PI/2,item.yaw,0,'YXZ')
        stamp.scale.set(item.w+.72,item.d+.67,1)
        stamp.updateMatrix()
        contacts.setMatrixAt(i,stamp.matrix)
        const variant=(b.style+level+(item.unit?.charCodeAt(item.unit.length-1)??0))%5
        modelFurniture(item,furniture,0,item.unit?palette[variant].fabric:tone.fabric)
        if(item.kind==='fridge'){
          const fridge=new T.Group();fridge.position.set(item.x,0,item.z);fridge.rotation.y=item.yaw;inside.add(fridge)
          moving.add(fridge)
          const door=new T.Group();door.position.set(-item.w/2,0,-item.d/2+.035);fridge.add(door)
          smallBox(door,item.w/2,.906,0,item.w*.98,1.61,.074,fridgeLeaf)
          smallBox(door,item.w*.82,1.08,-.063,.039,.31,.078,metal)
          smallBox(door,item.w/2,1.37,-.04,item.w*.98,.046,.029,liftWall)
          fridges.set('fridge:'+item.id,door)
        }
        if(item.kind==='sofa'){
          const reach=item.unit?.86:1.12
          const x=item.x-Math.sin(item.yaw)*reach,z=item.z-Math.cos(item.yaw)*reach
          wovenRug(inside,variant,x,z,item.w+.26,item.unit?1.12:1.52,item.yaw)
          if(item.unit&&Math.abs(item.yaw+Math.PI/2)<.01){
            const frame=new T.Group();inside.add(frame)
            frame.position.set(item.x-.37,1.83,item.z);frame.rotation.y=Math.PI/2
            smallBox(frame,0,0,0,.98,.66,.044,leaf)
            travelPrint(frame,variant,0,0,.029,.90,.58)
          }
        }
      }
      if(s){
        const side=Math.sign(s.back-s.front)
        box(s.x,2.34,s.back-.135*side,.54,.18,.047,iron)
        smallBox(g,s.x,2.34,s.back-.166*side,.35,.102,.029,luminaire)
        const plaque=label(level?'STAIR · '+level:'STAIRS',s.x,level*STOREY+1.86,s.back-.122*side,.84)
        if(side>0)plaque.rotation.y=Math.PI
      }
      if(s&&level<b.levels.length-1){
        const {x,front,back,width}=s,dz=back-front,d=Math.abs(dz)
        for(const side of [-1,1]){
          const xx=x+side*width/2
          for(let i=0;i<10;i++){
            const t=.045+.74*i/10,q=.045+.74*(i+1)/10,h=stairHeight(b,front+dz*(side<0?q:t),side)
            box(xx,h-.071,front+dz*(t+q)/2,width-.12,.142,d*(q-t)+.009,tone.trim)
            box(xx,h+.004,front+dz*(side<0?t:q),width-.15,.013,.037,oak)
          }
          for(const [t,q] of [[0,.045],[.785,1]]){
            const y=stairHeight(b,front+dz*(t+q)/2,side)
            box(xx,y-.092,front+dz*(t+q)/2,width+.013,.184,d*(q-t),tone.floor)
          }
          for(let i=0;i<=8;i++){
            const t=.79*i/8,h=stairHeight(b,front+dz*t,side)
            box(x+side*.075,h+.46,front+dz*t,.061,.92,.059,iron)
          }
          for(let i=0;i<8;i++){
            const t=.79*i/8,q=.79*(i+1)/8,a=stairHeight(b,front+dz*t,side),v=stairHeight(b,front+dz*q,side)
            const beam=smallBox(g,x+side*.075,(a+v)/2+.93,front+dz*(t+q)/2,.065,.058,Math.hypot(v-a,dz*(q-t))+.014,metal)
            beam.rotation.x=-Math.atan2(v-a,dz*(q-t))
          }
        }
      }
      if(b.lift){
        const lift=lifts.at(-1)!
        const leaves=[-1,1].map(side=>smallBox(g,b.lift!.x+side*.384,1.223,2.025,.767,2.444,.082,liftWall))
        lift.landings.push(leaves)
        for(const leaf of leaves)moving.add(leaf)
        smallBox(g,b.lift.x-1.02,1.22,1.93,.15,.21,.05,metal)
        label(level?'FLOOR '+level:'GROUND FLOOR',b.lift.x-2.17,level*STOREY+1.85,1.53,1.43).rotation.y=Math.PI
      }
      if(b.block!==undefined){
        if(level===0){
          const clerk=b.tower?towerClerk:housingClerk
          label('RECEPTION',clerk.x,1.21,clerk.z+1.17,1.62)
          if(b.tower){
            if(!b.baseY)label(RESIDENCES[b.block].name.toUpperCase(),0,2.53,r.b+.15,3.82)
            if(b.baseY){
              box(0,1.16,r.b+.13,1.64,2.32,.13,iron)
              for(const x of [-.40,.40])box(x,1.15,r.b+.21,.75,2.22,.06,0x927b57)
              label('EXPRESS  •  RECEPTION',0,2.68,r.b+.24,1.74)
            }
          }else for(let i=1;i<5;i++)label('FLOOR '+i+'   '+i+'01 – '+i+'03',-.38,2.68-i*.31,r.b+.14,2.56)
          clerks.push(new CityGuest(root,clerk.x,clerk.z,0xb58366,b.style===0?0x42625c:0x3a4b65,true))
        }else for(const [,u] of f.units.entries()){
          const d=f.doors.find(d=>d.id===u.id)!
          const info=UNITS.find(entry=>entry.id===u.id)!
          const number=info.name.split(' · ')[1]
          if(b.tower)label(number,d.x+.14,level*STOREY+1.64,d.z-.75,.48).rotation.y=Math.PI/2
          else label(number,d.x+.81,level*STOREY+1.67,d.z+.14,.50)
        }
      }
      const lamps=b.tower?[[0,0],[b.lift!.x,.43],[-1.4,r.b+1.6]]:b.block!==undefined?(level===0?[[-4.3,-4],[3.6,-3.2],[0,3.9]]:[[-7.3,.27],[-2.95,.27],[2.15,.27],[6.89,.27],...f.units.map(u=>[(u.rect.l+u.rect.r)/2,-4.38])]):[[0,1.99],[-1.12,-2.61]]
      for(const [x,z] of lamps){
        box(x,STOREY-.11,z,.78,.098,.5,iron)
        smallBox(inside,x,STOREY-.166,z,.65,.039,.40,luminaire)
      }
      if(b.block!==undefined&&!b.tower&&level===0){
        for(const x of [-6.84,-1.55,2.44]){
          box(x,2.18,-8.32,.54,.38,.034,walnut)
          box(x,2.18,-8.294,.46,.30,.019,tone.fabric)
          box(x-.07,2.14,-8.280,.21,.13,.012,0xc6ae80)
        }
        for(const x of [-4.25,3.85]){
          p.add('post',x,2.7,-4.04,.045,.66,.045,brass)
          p.add('post',x,2.33,-4.04,.44,.15,.44,iron)
          smallBox(inside,x,2.252,-4.04,.32,.032,.32,luminaire)
        }
      }
      for(const unit of f.units){
        const wall=f.walls.find(w=>!w.outer&&w.axis==='x'&&w.x>unit.rect.l&&w.x<unit.rect.r&&w.z<unit.rect.f-2.5&&w.z>unit.rect.b+1)
        if(!wall||b.block===undefined&&b.stairs)continue
        const x=unit.rect.l+.72,z=wall.z+.091
        box(x,1.53,z,.96,.55,.037,iron)
        box(x,1.53,z+.024,.885,.477,.014,0x50636c)
        box(x,1.05,z+.088,.99,.069,.196,oak)
        box(x+.31,1.104,z+.109,.17,.039,.081,walnut)
      }
      if(level===b.levels.length-1)tile(r,STOREY-.064,.128,chalk)
      p.finish(g,architecture)
      furniture.finish(inside,architecture)
      batchOpaque(g,moving)
      batchOpaque(inside,moving)
    }
    const top=b.levels.length*STOREY,p=new Scenery()
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,c:number)=>p.add('box',x,y,z,w,h,d,c)
    if(b.tower&&b.block!==undefined){
      const facade=r.f+.14
      if(!b.baseY){
        box(0,2.62,facade+.42,3.60,.16,1.15,iron)
        label(RESIDENCES[b.block].name.toUpperCase(),0,2.86,facade+.12,3.55)
      }
      // Warm stone spandrels and recessed vertical fins keep the city silhouette.
      for(let i=0;i<b.levels.length;i++){
        const y=i*STOREY
        box(0,y+.17,facade,width+.14,.23,.17,tone.trim)
        box(0,y+2.83,facade,width+.15,.24,.16,tone.trim)
        for(const side of [-1,1]){
          box(side*(width*.5-.12),y+1.54,facade,.21,3.0,.27,brass)
          box(side*width*.5,y+.17,cz,.20,.24,length+.21,tone.trim)
        }
      }
      box(0,top+.11,cz,width+.5,.24,length+.56,tone.trim)
      box(0,top+.37,cz,width-.42,.38,length-.4,tone.roof)
      box(width*.22,top+.91,cz-.82,width*.38,.83,length*.39,iron)
      for(const side of [-1,1])box(side*(width*.5-.21),top+.72,facade,.28,1.35,.30,brass)
    }else if(b.block!==undefined){
      label(RESIDENCES[b.block].name,0,2.64,r.f+.20,4.85)
      for(const x of [-10.27,-7.04,-5.65,-1.57,1.57,7.06,10.27]){
        if(b.style===0){
          for(let level=0;level<5;level++)for(let row=0;row<9;row++){
            const y=level*STOREY+.18+row*.312
            box(x,y,r.f+.119,.69,.028,.014,0xb28269)
          }
        }else box(x,top/2,r.f+.112,.072,top,.024,tone.trim)
      }
      for(let i=1;i<b.levels.length;i++){
        const h=STOREY*i
        box(0,h-.08,r.f+.09,width+.26,.21,.33,tone.trim)
        for(const side of [-1,1])box(side*width/2,h-.08,cz,.33,.21,length+.33,tone.trim)
      }
      box(0,top+.11,cz,width+.66,.23,length+.67,tone.trim)
      for(const sign of [-1,1]){
        box(0,top+.29,cz+sign*length/2,width+.43,.31,.21,tone.wall)
        box(sign*width/2,top+.29,cz,.23,.31,length,tone.wall)
      }
      box(7.3,top+.70,2.94,4.5,1.21,4.22,tone.wall)
      box(7.3,top+1.34,2.94,4.75,.16,4.47,tone.trim)
      for(const x of [-7,-3.9,2.8])box(x,top+.52,-4.1,1.25,.65,1.22,iron)
    }else{
      const extent=width/2+.28
      if(b.style===3){
        box(0,top+.16,cz,width+.5,.26,length+.45,tone.roof)
        box(.63,top+.41,cz-1.8,width*.53,.33,3.36,tone.trim)
      }else{
        const rise=b.style===4?1.45:1.22,angle=Math.atan2(rise,extent)
        for(const side of [-1,1]){
          p.add('box',side*extent/2,top+rise/2,cz,Math.hypot(rise,extent)+.10,.14,length+.56,tone.roof,0,-side*angle)
          box(side*extent,top+.035,cz,.11,.17,length+.57,tone.trim)
        }
        for(const z of [r.b,r.f])p.add('gable',0,top+rise/2,z,width,rise,.18,tone.wall)
        box(0,top+rise,cz,.20,.17,length+.58,tone.roof)
        box(1.77,top+rise*.66,r.b+1,.44,1.19,.57,tone.wall)
        box(1.77,top+rise*.66+.62,r.b+1,.57,.12,.69,tone.trim)
      }
      const u=UNITS.find(unit=>unit.id===b.id)!
      label(u.name.split(' ')[0],.78,1.76,r.f+.143,.36)
      for(let i=0;i<3;i++)box(0,-.032,r.f+.30+i*.3,1.52,.09,.264,tone.trim)
      if(b.style===3){
        box(-1.23,2.55,r.f+.44,3.31,.15,1.35,tone.trim)
        box(-2.72,1.26,r.f+.86,.13,2.52,.16,tone.trim)
        box(2.53,.19,r.f+.3,.69,.38,.46,walnut)
      }else if(b.style===4){
        for(const x of [-2.75,2.75])for(let i=0;i<16;i++)box(x,.17+i*.37,r.f+.13,.31,.073,.054,tone.trim)
        box(0,2.37,r.f+.20,1.62,.16,.44,tone.trim)
      }else{
        box(-1.85,2.52,r.f+.36,1.9,.11,1.16,tone.trim)
        for(const x of [-2.72,-.98])box(x,1.23,r.f+.81,.091,2.46,.091,oak)
        if(b.style===5){
          box(-2.02,.46,r.f+.38,1.04,.12,.37,walnut)
          box(-2.02,.70,r.f+.56,1.04,.32,.083,oak)
          for(const x of [-2.45,-1.61])box(x,.216,r.f+.38,.075,.432,.28,walnut)
        }
      }
      // Porch lights and louvred shutters give each house a readable street entrance.
      box(-.76,1.70,r.f+.15,.16,.31,.11,iron)
      smallBox(root,-.76,1.70,r.f+.221,.098,.21,.047,luminaire)
      for(const wx of [-1.89,1.89])for(const side of [-1,1])for(let j=0;j<9;j++)
        box(wx+side*.726,1.00+j*.145,r.f+.155,.28,.043,.044,tone.roof)
      const x=b.style===3?2.53:1.98
      box(x,.19,r.f+.13,.85,.34,.46,b.style===3?iron:0x9c744f)
      for(let i=0;i<4;i++){
        p.add('crown',x-.29+i*.19,.43,r.f+.13,.27,.28,.24,0x608164)
        p.add('crown',x-.29+i*.19,.55+.035*Math.sin(i),r.f+.17,.12,.102,.116,b.style===2?0xce9694:0xe9c191)
      }
    }
    p.finish(root,architecture)
  }
  for(const u of UNITS.filter(u=>u.block===undefined&&u.tenure!=='resident')){
    const x=u.x+1.15,z=u.z+u.facing*3.65
    smallBox(parent,x,.58,z,.081,1.16,.082,leaf)
    const sign=letter(parent,u.tenure==='rent'?'FOR RENT':'FOR SALE',[1.08,.37],[x,1.14,z+u.facing*.058],'#fff4dc',u.tenure==='rent'?'#375769':'#875c3f')
    sign.rotation.y=u.facing<0?Math.PI:0;signs.set(u.id,sign)
  }
  return {
    clerks,
    update(state:ResidentialView|undefined,occupied:readonly string[]|undefined,now:number,dt:number,x:number,z:number){
      for(const [id,d] of doors)d.hinge.rotation.y=d.angle*doorSwing(state?.doors[id],now)
      for(const [id,d] of fridges)d.rotation.y=T.MathUtils.damp(d.rotation.y,state?.fridges?.includes(id)?-1.18:0,11,dt)
      for(const [id,sign] of signs)sign.visible=!occupied?.includes(id)
      for(const f of floors)f.group.visible=(x-f.x)**2+(z-f.z)**2<24**2
      for(const lift of lifts){
        const stateLift=state?.lifts[lift.id]??{level:0,opened:0},x=lift.x
        lift.group.position.y=liftHeight(stateLift,now)
        const current=Math.round(lift.group.position.y/STOREY)
        if(lift.shown!==current){
          const c=lift.indicator.getContext('2d')!
          c.fillStyle='#17282a';c.fillRect(0,0,96,64);c.fillStyle='#fce2a4'
          c.font='bold 43px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(current?String(current):'G',48,31)
          lift.texture.needsUpdate=true;lift.shown=current
        }
        const slide=(leaves:T.Mesh[],t:number)=>leaves.forEach((m,i)=>m.position.x=x+(i?1:-1)*(.384+t*.674))
        slide(lift.leaves,liftOpening(stateLift,current,now))
        lift.landings.forEach((leaves,level)=>slide(leaves,liftOpening(stateLift,level,now)))
      }
      for(const clerk of clerks)clerk.pose(now)
    },
  }
}
