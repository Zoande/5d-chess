import * as T from 'three'
import type {Materials} from './materials.ts'
import {box,mesh,limb,segment,v} from './geometry.ts'

class Hand {
 readonly root=new T.Group()
 readonly grip=new T.Group()
 private fingers:T.Group[][]=[]
 private thumb:T.Group
 constructor(parent:T.Object3D,material:T.Material,left=false){
  parent.add(this.root);if(left)this.root.scale.x=-1
  box(this.root,[.09,.032,.105],[0,0,0],material,.013)
  const jointGeo=new T.SphereGeometry(.012,10,8)
  for(let i=0;i<4;i++){
   let node=this.root;const bones:T.Group[]=[]
   const lengths=[.036+(i===1||i===2?.006:0),.025,.018]
   for(let j=0;j<3;j++){
    const bone=new T.Group();bone.position.set(j===0?-.034+i*.023:0,0,j===0?-.041:-lengths[j-1]);node.add(bone)
    mesh(new T.CapsuleGeometry(.010-j*.001,lengths[j]-.016,3,8),material,bone,[0,0,-lengths[j]/2]).rotation.x=Math.PI/2
    if(j===0)mesh(jointGeo,material,bone,[0,0,0])
    bones.push(bone);node=bone
   }this.fingers.push(bones)
  }
  this.thumb=new T.Group();this.thumb.position.set(.048,-.002,.012);this.thumb.rotation.y=-.75;this.root.add(this.thumb)
  mesh(new T.CapsuleGeometry(.014,.035,3,10),material,this.thumb,[.006,0,-.018]).rotation.x=Math.PI/2
  const tip=mesh(new T.CapsuleGeometry(.012,.018,3,10),material,this.thumb,[.016,.002,-.047]);tip.rotation.set(Math.PI/2,0,-.4)
  this.grip.position.set(0,.039,-.026);this.root.add(this.grip)
 }
 pose(curl:number){for(const finger of this.fingers)finger.forEach((b,j)=>b.rotation.x=curl*(j===0?.65:1.15));this.thumb.rotation.z=-.2-curl*.7}
}
class Arm {
 readonly hand:Hand
 private upper:T.Mesh;private lower:T.Mesh;private elbow:T.Mesh;private cuff:T.Mesh
 constructor(parent:T.Object3D,materials:Materials,left:boolean,dealer=false){
  const geometry=new T.CylinderGeometry(1,.91,1,12)
  this.upper=mesh(geometry,dealer?materials.robe:materials.sleeve,parent)
  this.lower=mesh(geometry,dealer?materials.robe:materials.skin,parent)
  this.elbow=mesh(new T.SphereGeometry(1,12,8),dealer?materials.robe:materials.sleeve,parent)
  this.cuff=mesh(new T.TorusGeometry(1,.13,6,16),dealer?materials.robe:materials.shirt,parent)
  this.hand=new Hand(parent,dealer?materials.glove:materials.skin,left)
 }
 pose(shoulder:T.Vector3,target:T.Vector3,pole:T.Vector3,curl=.2,dealer=false){
  const l1=dealer?.49:.43,l2=dealer?.47:.42,delta=target.clone().sub(shoulder),distance=T.MathUtils.clamp(delta.length(),.08,l1+l2-.006),direction=delta.normalize()
  const wrist=shoulder.clone().addScaledVector(direction,distance)
  const along=(l1*l1-l2*l2+distance*distance)/(2*distance)
  const bend=pole.clone().sub(shoulder);bend.addScaledVector(direction,-bend.dot(direction)).normalize()
  const elbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)))
  segment(this.upper,shoulder,elbow,dealer?.087:.069);segment(this.lower,elbow,wrist,dealer?.065:.041)
  this.elbow.position.copy(elbow);this.elbow.scale.setScalar(dealer?.084:.064)
  const forearm=wrist.clone().sub(elbow).normalize();this.cuff.position.copy(elbow).addScaledVector(forearm,.07);this.cuff.scale.setScalar(dealer?.068:.052);this.cuff.quaternion.setFromUnitVectors(v(0,0,1),forearm)
  this.hand.root.position.copy(wrist);this.hand.root.rotation.set(.02,Math.atan2(-direction.x,-direction.z),0);this.hand.pose(curl)
 }
}
function hood(material:T.Material){
 const group=new T.Group()
 const shell=mesh(new T.SphereGeometry(1,36,24,Math.PI,Math.PI),material,group);shell.scale.set(.245,.32,.265)
 const arc:T.Vector3[]=[]
 for(let i=0;i<=40;i++){const a=-.24+Math.PI*1.48*i/40;arc.push(v(Math.cos(a)*.217,Math.sin(a)*.29,.005+Math.sin(a)*.012))}
 mesh(new T.TubeGeometry(new T.CatmullRomCurve3(arc),48,.022,8,false),material,group)
 return group
}
function eye(material:T.Material){
 const s=new T.Shape();s.moveTo(-.043,0);s.quadraticCurveTo(0,.013,.043,.001);s.quadraticCurveTo(.004,-.008,-.043,0)
 return new T.Mesh(new T.ShapeGeometry(s,16),material)
}
export class People {
 readonly player=new T.Group();readonly dealer=new T.Group()
 readonly left:Arm;readonly right:Arm;readonly keeperLeft:Arm;readonly keeperRight:Arm
 private torso:T.Mesh;private head:T.Group
 constructor(scene:T.Scene,privateMaterials:Materials){
  const m=privateMaterials;scene.add(this.player,this.dealer)
  this.torso=box(this.player,[.5,.48,.28],[0,.92,1.46],m.sleeve,.08)
  box(this.player,[.17,.35,.292],[0,.98,1.45],m.shirt,.025)
  box(this.player,[.43,.16,.34],[0,.61,1.45],m.trousers,.065)
  for(const side of [-1,1]){
   limb(this.player,v(side*.13,.61,1.43),v(side*.24,.54,1.04),.105,m.trousers)
   limb(this.player,v(side*.24,.54,1.04),v(side*.25,.15,1.31),.079,m.trousers)
   box(this.player,[.18,.12,.35],[side*.25,.08,1.2],m.leather,.04)
   box(this.player,[.19,.027,.35],[side*.25,.025,1.2],m.ebony,.009)
  }
  this.left=new Arm(this.player,m,true);this.right=new Arm(this.player,m,false)
  const robePoints=[v(.31,.33),v(.39,.43),v(.31,.78),v(.29,1.07),v(.25,1.25),v(.12,1.32)].map(p=>new T.Vector2(p.x,p.y))
  const robe=mesh(new T.LatheGeometry(robePoints,32),m.robe,this.dealer,[0,0,-1.3]);robe.scale.z=.72
  this.head=hood(m.robe);this.head.position.set(0,1.59,-1.105);this.dealer.add(this.head)
  const face=mesh(new T.CircleGeometry(.99,48),m.void,this.head,[0,-.008,.003],false);face.scale.set(.213,.285,1)
  for(const side of [-1,1]){const e=eye(m.eyes);e.position.set(side*.082,.028,.025);e.rotation.z=side*.035;this.head.add(e)}
  this.keeperLeft=new Arm(this.dealer,m,true,true);this.keeperRight=new Arm(this.dealer,m,false,true)
 }
 pose(playerLean:number,dealerLean:number,left:T.Vector3,right:T.Vector3,keeperLeft:T.Vector3,keeperRight:T.Vector3,curlLeft=.2,curlRight=.2,keeperCurl=.2){
  this.torso.rotation.x=-playerLean*.35;this.torso.position.z=1.46-playerLean*.3
  this.head.position.set(0,1.59-dealerLean*.08,-1.105+dealerLean*.48)
  this.left.pose(v(-.25,1.15,1.36-playerLean*.43),left,v(-.85,.84,1.6),curlLeft)
  this.right.pose(v(.25,1.15,1.36-playerLean*.43),right,v(.85,.84,1.6),curlRight)
  this.keeperLeft.pose(v(-.26,1.21,-1.25+dealerLean*.51),keeperLeft,v(-.9,1.0,-1.4),keeperCurl,true)
  this.keeperRight.pose(v(.26,1.21,-1.25+dealerLean*.51),keeperRight,v(.9,1.0,-1.4),keeperCurl,true)
 }
}
