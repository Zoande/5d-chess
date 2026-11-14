import * as T from 'three'
import {mesh,box,cylinder,coinGeometry,v} from './geometry.ts'
import {casinoCoins} from '../../casino-model.ts'
import {label,type Materials} from './materials.ts'

export type TableAction={kind:'face'|'stake'|'minus'|'plus'|'offer'|'amount'|'yes'|'no'|'eloAdd';value?:number}
export interface TableControl {id:string;action:TableAction;object:T.Group;surface:T.Mesh;edge:T.Mesh;size:[number,number];disabled:boolean}
function writing(parent:T.Object3D,text:string,width:number,height:number,position:number[],color='#debf80'){
 const inscription=label(text,512,color),material=new T.MeshStandardMaterial({map:inscription.map,transparent:true,alphaTest:.05,roughness:.75,depthWrite:false,side:T.DoubleSide})
 const m=mesh(new T.PlaneGeometry(width,height),material,parent,position,false);m.rotation.x=-Math.PI/2
 return inscription
}
export class Table {
 readonly root=new T.Group();readonly controls:TableControl[]=[]
 readonly purse=new T.Group();readonly bank=new T.Group()
 readonly coin=coinGeometry()
 private piles:T.InstancedMesh
 private amount:ReturnType<typeof label>
 private offer:ReturnType<typeof label>;private offerUnit:ReturnType<typeof label>
 private payout:ReturnType<typeof label>;private payoutTitle:ReturnType<typeof label>;private payoutPlate=new T.Group();private lastStake=-1
 private mode:'normal'|'offer'|'elo'='normal';private soulStake=0;private reward=0;private morph=1;private felt:T.Mesh;private question=new T.Group();private questionLabel:ReturnType<typeof label>
 private coins=-1;private portrait=false
 constructor(scene:T.Scene,privateMaterials:Materials){
  const m=privateMaterials;scene.add(this.root)
  box(this.root,[2.74,.16,2.03],[0,.77,0],m.wood,.14)
  box(this.root,[2.64,.025,1.93],[0,.864,0],m.brass,.13)
  this.felt=box(this.root,[2.60,.029,1.89],[0,.883,0],m.felt,.12)
  box(this.root,[2.68,.055,1.98],[0,.695,0],m.ebony,.12)
  for(const x of [-1.02,1.02])for(const z of [-.67,.67]){
   box(this.root,[.12,.67,.12],[x,.34,z],m.wood,.02);box(this.root,[.125,.065,.125],[x,.08,z],m.brass,.012)
  }
  // Thin brass registration lines: the wagering keys belong to the furniture.
  const ring=mesh(new T.TorusGeometry(.38,.0014,4,96),m.darkGold,this.root,[0,.902,-.16],false);ring.rotation.x=-Math.PI/2
  writing(this.root,'THE SILENT TABLE',.57,.10,[0,.904,-.54],'#78907d')
  writing(this.root,'ONE FACE. ONE OFFER.',.43,.055,[0,.904,-.43],'#546d5e')
  this.purse.position.set(-.83,.906,.69);this.bank.position.set(-.63,.906,-.64);this.root.add(this.purse,this.bank)
  for(const tray of [this.purse,this.bank]){cylinder(tray,.17,.014,[0,.006,0],m.ebony);const lip=mesh(new T.TorusGeometry(.159,.004,6,48),m.brass,tray,[0,.016,0]);lip.rotation.x=-Math.PI/2}
  for(let i=0;i<18;i++){const c=mesh(this.coin,m.darkGold,this.bank,[Math.sin(i*2.4)*.08,.023+Math.floor(i/4)*.011,Math.cos(i*2.4)*.08]);c.rotation.y=i*.73}
  this.piles=new T.InstancedMesh(this.coin,m.gold,160);this.piles.castShadow=true;this.piles.receiveShadow=true;scene.add(this.piles)
  for(let i=1;i<=6;i++){
   const control=this.key('face-'+i,{kind:'face',value:i},[.18,.18],m)
   const patterns:Record<number,number[][]>={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]}
   for(const [x,z]of patterns[i])cylinder(control.object,.009,.002,[x*.038,.027,z*.038],m.ivory,16)
  }
  for(const amount of [25,100,500,1000]){
   const key=this.key('stake-'+amount,{kind:'stake',value:amount},[.19,.14],m)
   writing(key.object,amount===1000?'1,000':String(amount),.145,.075,[0,.033,0])
  }
  const minus=this.key('minus',{kind:'minus'},[.115,.12],m),plus=this.key('plus',{kind:'plus'},[.115,.12],m)
  writing(minus.object,'−',.075,.075,[0,.033,0]);writing(plus.object,'+',.075,.075,[0,.033,0])
  const amount=this.key('amount',{kind:'amount'},[.42,.13],m);this.amount=writing(amount.object,'100',.34,.09,[0,.033,0])
  const offer=this.key('offer',{kind:'offer'},[.33,.21],m);this.offer=writing(offer.object,'OFFER',.27,.09,[0,.033,0])
  this.offerUnit=writing(offer.object,'COINS',.18,.04,[0,.033,.055],'#9d946d')
  this.root.add(this.payoutPlate)
  box(this.payoutPlate,[.38,.025,.17],[0,0,0],m.darkGold,.012)
  box(this.payoutPlate,[.365,.026,.155],[0,.009,0],m.ebony,.01)
  this.payoutTitle=writing(this.payoutPlate,'WIN RETURN',.29,.045,[0,.025,-.045])
  this.payout=writing(this.payoutPlate,'583.12',.31,.075,[0,.026,.022])
  for(const [id,text] of [['yes','YES'],['no','NO']] as const){const key=this.key(id,{kind:id},[.32,.18],m);writing(key.object,text,.23,.09,[0,.033,0])}
  for(const n of [1,10,50]){const key=this.key('elo-plus-'+n,{kind:'eloAdd',value:n},[.19,.14],m);writing(key.object,'+'+n,.15,.075,[0,.033,0])}
  this.root.add(this.question);this.question.position.set(0,.912,.13)
  this.questionLabel=writing(this.question,'DEAL WITH YOUR SOUL?',1.1,.13,[0,.004,0],'#d5b2a1')
  writing(this.question,'RISK ELO FOR COINS · UP TO 10 ROUNDS',1.0,.075,[0,.004,.10],'#bfa59b')
  writing(this.question,'WIN: KEEP ELO + COINS / LOSE: STAKED ELO',1.12,.07,[0,.004,.19],'#bfa59b')
  this.question.visible=false
  this.layout(false);this.setMode('normal')
  // Seated player chair and the barely discernible chair opposite.
  for(const z of [1.49,-1.46]){
   box(scene,[.61,.12,.57],[0,.43,z],m.leather,.08)
   box(scene,[.58,.65,.10],[0,.86,z>0?z+.25:z-.25],m.wood,.07)
   for(const side of [-1,1]){box(scene,[.045,.7,.045],[side*.25,.35,z],m.wood,.015);box(scene,[.045,.05,.38],[side*.34,.73,z],m.brass,.015)}
  }
 }
 private key(id:string,action:TableAction,size:[number,number],m:Materials){
  const object=new T.Group();this.root.add(object)
  const edge=box(object,[size[0]+.014,.025,size[1]+.014],[0,.005,0],m.darkGold.clone(),.012)
  const surface=box(object,[size[0],.027,size[1]],[0,.014,0],m.ebony.clone(),.01)
  const c={id,action,object,surface,edge,size,disabled:false};object.userData.control=c;this.controls.push(c);return c
 }
 layout(portrait:boolean){
  this.portrait=portrait;this.payoutPlate.position.set(portrait?.50:.59,.917,.79);this.payoutPlate.scale.setScalar(portrait?.73:1)
  for(const c of this.controls){
   const n=c.action.value??0
   if(c.id==='yes'||c.id==='no')c.object.position.set(c.id==='yes'?-.23:.23,.91,.59)
   else if(c.action.kind==='eloAdd')c.object.position.set(portrait?-.46+(n===1?0:n===10?.22:.44):-.95+(n===1?0:n===10?.23:.46),.91,portrait?-.08:.22)
   else if(c.action.kind==='face')c.object.position.set(portrait?((n-1)%3-1)*.30:(n-3.5)*.205,.91,portrait?.37+Math.floor((n-1)/3)*.25:.57)
   else if(c.action.kind==='stake'){const i=[25,100,500,1000].indexOf(n);c.object.position.set((portrait?-.46:-1.04)+(i%2)*.22,.91,(portrait?-.15:.12)+Math.floor(i/2)*.20)}
   else if(c.id==='offer')c.object.position.set(portrait?.47:.76,.91,portrait?.04:.34)
   else c.object.position.set(c.id==='minus'?-.31:c.id==='plus'?.31:0,.91,.87)
  }
 }
 setMode(mode:'normal'|'offer'|'elo',stake=0,reward=0,reason?:string){
  if(mode!==this.mode){this.mode=mode;this.morph=0;this.lastStake=-1}
  this.offerUnit.update(mode==='elo'?'ELO':'COINS');this.payoutTitle.update(mode==='elo'?'COIN REWARD':'WIN RETURN');this.soulStake=stake;this.reward=reward;this.question.visible=mode==='offer';this.payoutPlate.visible=mode!=='offer'
  this.questionLabel.update(reason==='broke'?'DEAL WITH YOUR SOUL?':'TRY SOMETHING NEW?')
  for(const c of this.controls)c.object.visible=mode==='offer'?['yes','no'].includes(c.id):mode==='elo'?c.action.kind==='face'||c.action.kind==='eloAdd'||['amount','offer'].includes(c.id):!['yes','no'].includes(c.id)&&c.action.kind!=='eloAdd'
 }
 animate(dt:number){this.morph=Math.min(1,this.morph+dt*1.6);for(const c of this.controls)c.object.scale.y=.02+.98*this.morph;const felt=this.felt.material as T.MeshStandardMaterial;felt.color.lerp(new T.Color(this.mode==='normal'?0x123e35:this.mode==='offer'?0x24212a:0x39131e),Math.min(1,dt*3))}
 setState(coins:number,stake:number,face:number,phase:string,disabled:boolean){
  if(coins!==this.coins){this.coins=coins;this.makePiles(coins)}
  if(this.mode==='elo'){this.payout.update(casinoCoins(this.reward))}else if(stake!==this.lastStake){this.payout.update(casinoCoins(stake*(5.88-4.88*.01)));this.lastStake=stake}
  this.amount.update(this.mode==='elo'?this.soulStake+' ELO':stake.toLocaleString());this.offer.update(phase==='ready'?'THROW':phase==='rolling'?'…':this.mode==='elo'?'DEAL':'OFFER')
  for(const c of this.controls){
   c.disabled=(disabled&&!(c.id==='offer'&&phase==='ready'))||(this.mode==='elo'&&(c.id==='amount'||c.id==='offer'&&this.soulStake<1))
   const selected=c.action.kind==='face'&&c.action.value===face
   ;(c.edge.material as T.MeshStandardMaterial).color.set(selected?0xd8b464:0x6d5127)
   ;(c.surface.material as T.MeshStandardMaterial).color.set(c.id==='offer'&&this.mode==='elo'?(c.disabled?0x3b1117:0x811f28):selected?0x254b3d:c.disabled?0x080c0d:0x111c1a)
  }
 }
 private makePiles(coins:number){
  const count=coins<=0?0:Math.min(160,Math.ceil(14+Math.log10(coins+1)*20));this.piles.count=count
  const matrix=new T.Matrix4(),q=new T.Quaternion()
  for(let i=0;i<count;i++){
   const purse=i<Math.min(24,count),stack=Math.floor(i/6),angle=stack*2.399
   const x=purse?-.83+Math.sin(stack*2.4)*.083:(i%2?1:-1)*(1.25+Math.abs(Math.sin(stack*1.7))*.68)
   const z=purse?.69+Math.cos(stack*2.4)*.083:-.5+Math.cos(angle)*1.85
   const y=purse?.926+(i%6)*.01:.025+(i%6)*.01
   q.setFromEuler(new T.Euler(purse?0:Math.sin(i)*.03,i*.91,0));matrix.compose(v(x,y,z),q,v(1,1,1));this.piles.setMatrixAt(i,matrix)
  }this.piles.instanceMatrix.needsUpdate=true
 }
}
