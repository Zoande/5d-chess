import * as T from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type {Materials} from './materials.ts'

export const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
export function mesh(geometry:T.BufferGeometry,material:T.Material,parent:T.Object3D,position:T.Vector3|number[]=[0,0,0],shadow=true){
 const m=new T.Mesh(geometry,material);Array.isArray(position)?m.position.set(...position as [number,number,number]):m.position.copy(position);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m
}
export function box(parent:T.Object3D,size:number[],position:number[],material:T.Material,radius=.025){return mesh(new RoundedBoxGeometry(size[0],size[1],size[2],2,radius),material,parent,position)}
export function cylinder(parent:T.Object3D,radius:number,height:number,position:number[],material:T.Material,segments=32){return mesh(new T.CylinderGeometry(radius,radius,height,segments),material,parent,position)}
export function limb(parent:T.Object3D,a:T.Vector3,b:T.Vector3,radius:number,material:T.Material){
 const m=mesh(new T.CapsuleGeometry(radius,Math.max(.001,a.distanceTo(b)-radius*2),4,12),material,parent,a.clone().add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize());return m
}
export function segment(m:T.Mesh,a:T.Vector3,b:T.Vector3,radius:number){
 m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize());m.scale.set(radius,a.distanceTo(b),radius)
}
export function coinGeometry(){
 const pieces:T.BufferGeometry[]=[]
 const add=(g:T.BufferGeometry,position:T.Vector3,rotation?:T.Euler)=>{if(g.index)g=g.toNonIndexed();g.applyMatrix4(new T.Matrix4().compose(position,new T.Quaternion().setFromEuler(rotation??new T.Euler()),v(1,1,1)));pieces.push(g)}
 add(new T.CylinderGeometry(.054,.054,.009,40),v())
 for(const y of [-.0052,.0052]){
  add(new T.TorusGeometry(.048,.0025,5,40),v(0,y,0),new T.Euler(Math.PI/2,0,0))
  add(new T.TorusGeometry(.038,.0009,4,32),v(0,y,0),new T.Euler(Math.PI/2,0,0))
 }
 for(let i=0;i<36;i++){const a=i*Math.PI*2/36;add(new T.BoxGeometry(.002,.008,.002),v(Math.cos(a)*.054,0,Math.sin(a)*.054),new T.Euler(0,-a,0))}
 // Raised minted chess king, cut in brass rather than a printed yellow disc.
 const king=new T.Shape();king.moveTo(-.021,-.025);king.lineTo(.021,-.025);king.lineTo(.017,-.014);king.lineTo(.014,.007);king.lineTo(.005,.011);king.lineTo(.005,.023);king.lineTo(.014,.023);king.lineTo(.014,.03);king.lineTo(.005,.03);king.lineTo(.005,.038);king.lineTo(-.005,.038);king.lineTo(-.005,.03);king.lineTo(-.014,.03);king.lineTo(-.014,.023);king.lineTo(-.005,.023);king.lineTo(-.005,.011);king.lineTo(-.014,.007);king.lineTo(-.017,-.014);king.closePath()
 const emblem=new T.ExtrudeGeometry(king,{depth:.0018,bevelEnabled:true,bevelSize:.0006,bevelThickness:.0006,bevelSegments:1,steps:1});emblem.scale(.68,.68,1)
 add(emblem,v(0,.005,0),new T.Euler(-Math.PI/2,0,0))
 const merged=mergeGeometries(pieces,false)!;for(const p of pieces)p.dispose();return merged
}
export function dice(materials:Materials){
 const group=new T.Group();box(group,[.18,.18,.18],[0,0,0],materials.ivory,.023)
 const spots:Record<number,number[][]>={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]}
 const normals=[v(0,1,0),v(0,0,1),v(1,0,0),v(-1,0,0),v(0,0,-1),v(0,-1,0)]
 const dot=new T.CylinderGeometry(.0105,.0105,.0015,16)
 normals.forEach((normal,index)=>{
  const face=new T.Group();face.position.copy(normal).multiplyScalar(.0901);face.quaternion.setFromUnitVectors(v(0,1,0),normal);group.add(face)
  for(const [x,z]of spots[index+1])mesh(dot,materials.ink,face,[x*.041,.0005,z*.041],false)
 })
 return group
}
export function resultRotation(result:number){
 const normal=[v(0,1,0),v(0,0,1),v(1,0,0),v(-1,0,0),v(0,0,-1),v(0,-1,0)][result-1]
 return new T.Quaternion().setFromAxisAngle(v(0,1,0),.35).multiply(new T.Quaternion().setFromUnitVectors(normal,v(0,1,0)))
}
