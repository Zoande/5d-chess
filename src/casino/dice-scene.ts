/** Small purpose-built WebGL room. All motion is presentation; no draw uses gesture data. */
type V=[number,number,number]
type M=number[]
const I=():M=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
const mul=(a:M,b:M):M=>{const r=Array(16).fill(0);for(let c=0;c<4;c++)for(let y=0;y<4;y++)for(let k=0;k<4;k++)r[c*4+y]+=a[k*4+y]*b[c*4+k];return r}
const translate=(p:V)=>{const m=I();m[12]=p[0];m[13]=p[1];m[14]=p[2];return m}
const scale=(p:V)=>{const m=I();m[0]=p[0];m[5]=p[1];m[10]=p[2];return m}
const rx=(a:number):M=>[1,0,0,0,0,Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1]
const ry=(a:number):M=>[Math.cos(a),0,-Math.sin(a),0,0,1,0,0,Math.sin(a),0,Math.cos(a),0,0,0,0,1]
const rz=(a:number):M=>[Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1,0,0,0,0,1]
const norm=(v:V):V=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n) as V}
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const dot=(a:V,b:V)=>a.reduce((s,v,i)=>s+v*b[i],0)
const sub=(a:V,b:V):V=>a.map((v,i)=>v-b[i]) as V
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t
const ease=(t:number)=>1-(1-t)**3
const color=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
function camera(eye:V,target:V,aspect:number):M{
 const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x),view=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]
 const f=1/Math.tan(.62/2),n=.1,far=40,projection=[f/aspect,0,0,0,0,f,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0]
 return mul(projection,view)
}
function geometry(kind:'cube'|'sphere'|'cylinder'){
 const data:number[]=[]
 const tri=(p:V[],n:V[])=>p.forEach((v,i)=>data.push(...v,...n[i]))
 if(kind==='cube'){
  const faces:V[][]=[[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]]
  const normals:V[]=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
  faces.forEach((p,i)=>{tri([p[0],p[1],p[2]],[normals[i],normals[i],normals[i]]);tri([p[0],p[2],p[3]],[normals[i],normals[i],normals[i]])})
 }else if(kind==='sphere'){
  const point=(u:number,v:number):V=>[Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)]
  for(let y=0;y<10;y++)for(let x=0;x<16;x++){
   const a=point(x*Math.PI/8,y*Math.PI/10),b=point((x+1)*Math.PI/8,y*Math.PI/10),c=point((x+1)*Math.PI/8,(y+1)*Math.PI/10),d=point(x*Math.PI/8,(y+1)*Math.PI/10)
   tri([a,b,c],[a,b,c]);tri([a,c,d],[a,c,d])
  }
 }else{
  for(let i=0;i<24;i++){
   const a=i*Math.PI/12,b=(i+1)*Math.PI/12,p:V=[Math.cos(a),-1,Math.sin(a)],q:V=[Math.cos(b),-1,Math.sin(b)],r:V=[q[0],1,q[2]],s:V=[p[0],1,p[2]],na:V=[p[0],0,p[2]],nb:V=[q[0],0,q[2]]
   tri([p,q,r],[na,nb,nb]);tri([p,r,s],[na,nb,na]);tri([[0,1,0],s,r],[[0,1,0],[0,1,0],[0,1,0]]);tri([[0,-1,0],q,p],[[0,-1,0],[0,-1,0],[0,-1,0]])
  }
 }
 return new Float32Array(data)
}
const vertex=`#version 300 es
in vec3 aPosition;in vec3 aNormal;uniform mat4 uModel;uniform mat4 uVP;out vec3 vWorld;out vec3 vNormal;
void main(){vec4 w=uModel*vec4(aPosition,1.);vWorld=w.xyz;vNormal=transpose(inverse(mat3(uModel)))*aNormal;gl_Position=uVP*w;}`
const fragment=`#version 300 es
precision highp float;in vec3 vWorld;in vec3 vNormal;uniform vec3 uColor;uniform vec3 uEye;uniform vec3 uDie;uniform float uMaterial;uniform float uTime;out vec4 frag;
void main(){vec3 N=normalize(vNormal),lightPos=vec3(0.,4.45,-.6),L=normalize(lightPos-vWorld),V=normalize(uEye-vWorld);float dist=length(lightPos-vWorld);
vec3 base=uColor;if(uMaterial==1.&&N.y>.8){float check=mod(floor(vWorld.x*2.)+floor(vWorld.z*2.),2.);base*=mix(.75,1.15,check);vec2 d=vWorld.xz-uDie.xz;float shadow=exp(-dot(d,d)/(.06+max(0.,uDie.y-1.4)*.15));base*=1.-shadow*.55;}
float light=(.055+max(dot(N,L),0.)*1.35/(1.+dist*dist*.12))*(.98+.02*sin(uTime*3.));float spec=pow(max(dot(N,normalize(L+V)),0.),uMaterial==2.?100.:35.)*(uMaterial==2.?.45:.06);
vec3 c=base*light*vec3(1.05,.98,.83)+vec3(spec)*vec3(1.,.86,.65);if(uMaterial==4.)c=base*1.8;
float fog=1.-exp(-length(uEye-vWorld)*.035);c=mix(c,vec3(.015,.019,.026),fog);frag=vec4(c,1.);}`

export class DiceScene{
 private gl:WebGL2RenderingContext|null
 private phase='idle'
 private start=performance.now()
 private duration=1
 private result=1
 private drag:V=[0,0,0]
 private look:[number,number]=[0,0]
 private coins=0
 private ticker=0
 private lastFrame=0
 private disposed=false
 private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
 private drawScene:((now:number)=>void)|undefined
 private resizeObserver:ResizeObserver|undefined
 constructor(private canvas:HTMLCanvasElement){
  this.gl=canvas.getContext('webgl2',{alpha:false,antialias:true,powerPreference:'low-power'})
  const gl=this.gl
  if(!gl){canvas.parentElement?.classList.add('webgl-unavailable');return}
  const compile=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)??'Shader error');return s}
  const program=gl.createProgram()!;gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program)
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)??'Room renderer could not start')
  gl.useProgram(program);gl.enable(gl.DEPTH_TEST)
  const uniforms=Object.fromEntries(['uModel','uVP','uColor','uEye','uDie','uMaterial','uTime'].map(k=>[k,gl.getUniformLocation(program,k)]))
  const meshes=Object.fromEntries((['cube','sphere','cylinder'] as const).map(kind=>{
   const data=geometry(kind),vao=gl.createVertexArray()!,buffer=gl.createBuffer()!;gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW)
   for(const [name,offset]of [['aPosition',0],['aNormal',12]] as const){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,24,offset)}
   return [kind,{vao,count:data.length/6}]
  })) as Record<'cube'|'sphere'|'cylinder',{vao:WebGLVertexArrayObject;count:number}>
  const draw=(kind:keyof typeof meshes,p:V,s:V,hex:string,material=0,rotation:M=I(),parent:M=I())=>{
   gl.uniformMatrix4fv(uniforms.uModel,false,new Float32Array(mul(parent,mul(translate(p),mul(rotation,scale(s))))));gl.uniform3fv(uniforms.uColor,color(hex));gl.uniform1f(uniforms.uMaterial,material);gl.bindVertexArray(meshes[kind].vao);gl.drawArrays(gl.TRIANGLES,0,meshes[kind].count)
  }
  const bone=(a:V,b:V,r:number,hex:string)=>{
   const y=norm(sub(b,a)),x=norm(cross(Math.abs(y[2])>.9?[1,0,0]:[0,0,1],y)),z=cross(x,y),rotation=[...x,0,...y,0,...z,0,0,0,0,1]
   draw('cylinder',a.map((v,i)=>(v+b[i])/2) as V,[r,Math.hypot(...sub(a,b))/2,r],hex,0,rotation)
  }
  const hand=(p:V,hex:string)=>{draw('sphere',p,[.13,.045,.17],hex);for(let i=0;i<4;i++)bone([p[0]-.08+i*.05,p[1],p[2]-.07],[p[0]-.08+i*.05,p[1]-.015,p[2]-.24],.021,hex)}
  this.drawScene=(now)=>{
   const dpr=Math.min(devicePixelRatio||1,1.7),width=Math.max(1,Math.round(canvas.clientWidth*dpr)),height=Math.max(1,Math.round(canvas.clientHeight*dpr))
   if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}gl.viewport(0,0,width,height);gl.clearColor(.012,.016,.023,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program)
   const t=Math.min(1,(now-this.start)/this.duration),e=ease(t)
   const eye:V=[Math.sin(this.look[0])*.08,2.78+this.look[1]*.08,3.72+Math.cos(this.look[0])*.08]
   const target:V=[Math.sin(this.look[0])*5.8,1.62-this.look[1]*2.4,-.4-Math.cos(this.look[0])*5.8]
   gl.uniformMatrix4fv(uniforms.uVP,false,new Float32Array(camera(eye,target,width/height)));gl.uniform3fv(uniforms.uEye,eye);gl.uniform1f(uniforms.uTime,now/1000)
   let die:V=[.62,1.78,1.5],rotation=mul(rx(-.2),ry(.3))
   if(this.phase==='exchange')die=[lerp(-.25,.62,e),lerp(1.65,1.78,e),lerp(-1.3,1.5,e)]
   if(this.phase==='rolling'||this.phase==='result'){
    const q=this.phase==='result'?1:e,angles:Record<number,[number,number]>={1:[0,0],2:[-Math.PI/2,0],3:[0,Math.PI/2],4:[0,-Math.PI/2],5:[Math.PI/2,0],6:[Math.PI,0]}
    die=[lerp(.62,.1,q),lerp(1.78,1.43,q)+Math.sin(Math.PI*q)*1.15+Math.abs(Math.sin(q*Math.PI*5))*.12*(1-q),lerp(1.5,.25,q)]
    rotation=mul(rx(angles[this.result][0]+(1-q)*Math.PI*8),rz(angles[this.result][1]+(1-q)*Math.PI*6))
   }else if(this.phase==='ready'){die=[die[0]+this.drag[0],die[1]+this.drag[1],die[2]+this.drag[2]];rotation=mul(rotation,rz(this.drag[0]))}
   gl.uniform3fv(uniforms.uDie,die)
   // Room, chair rails, first-person armrests, table apron and its inlaid chessboard.
   draw('cube',[0,-.1,-1],[6,.1,7],'#090d14');draw('cube',[0,5.25,-.6],[6,.1,6.4],'#080b12')
   draw('cube',[0,2.3,-4],[6,2.5,.1],'#090c13')
   const amount=Math.max(0,this.coins)
   const floorFill=Math.min(1,amount/100_000)
   const coinHeight=.035+.915*floorFill
   const diamondShare=Math.min(1,Math.max(0,(amount-100_000)/(100_000_000-100_000)))
   const multiversalShare=Math.min(1,Math.max(0,(amount-100_000_000)/(1_000_000_000-100_000_000)))
   const coinCount=Math.min(900,Math.max(8,Math.ceil(24+floorFill*876)))
   const random=(n:number)=>{const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x)}
   const coinPosition=(i:number,elapsed:number):V=>{
    const phase=random(i*11+6)*Math.PI*2,speed=.35+random(i*13+7)*1.8
    return [-5.15+random(i*3+1)*10.3+Math.sin(elapsed*speed+phase)*.12,.08+random(i*3+3)*coinHeight+Math.sin(elapsed*speed+phase)*(.08+.06*random(i*17+8)),-3.65+random(i*3+2)*7.2+Math.cos(elapsed*speed*.73+phase)*.12]
   }
   for(let i=0;i<coinCount;i++){
    const phase=random(i*11+6)*Math.PI*2,speed=.35+random(i*13+7)*1.8,elapsed=now/1000
    const [x,y,z]=coinPosition(i,elapsed)
    const diamond=random(i*5+4)<diamondShare
    const multiversal=diamond&&random(i*5+5)<multiversalShare
    const material=multiversal?4:diamond?2:3
    const color=multiversal?'#9df4ff':diamond?'#b8e9ff':'#c6a15f'
    const rotation=mul(ry(elapsed*speed+phase),mul(rx(Math.sin(elapsed*speed*.61+phase)*.35),rz(random(i*7)*.4+elapsed*speed*.8)))
    draw('cylinder',[x,y,z],[.075,.018,.075],color,material,rotation)
    if(multiversal)draw('sphere',[x,y+.035,z],[.022,.022,.022],color,4)
   }
   draw('cube',[-4,2.2,-.6],[.1,2.5,4],'#090d14');draw('cube',[4,2.2,-.6],[.1,2.5,4],'#090d14')
   for(let i=-5;i<=5;i++){
    const x=i*.75
    draw('cube',[x,2.2,-3.85],[.018,2.2,.04],'#3a342e');draw('cube',[x+.1,2.2,-3.88],[.13,2.2,.025],'#141720')
    draw('cube',[-3.85,2.2,x],[.04,2.2,.018],'#3a342e');draw('cube',[-3.88,2.2,x+.1],[.025,2.2,.13],'#141720')
    draw('cube',[3.85,2.2,x],[.04,2.2,.018],'#3a342e');draw('cube',[3.88,2.2,x+.1],[.025,2.2,.13],'#141720')
   }
   draw('cube',[0,4.92,-.6],[3.85,.035,3.85],'#15131a',3)
   draw('cylinder',[0,4.78,-.6],[.18,.08,.18],'#92794b',3);draw('cylinder',[0,4.62,-.6],[.055,.16,.055],'#b3a989',3);draw('sphere',[0,4.43,-.6],[.08,.12,.08],'#ffb85c',4)
   draw('cube',[0,1.15,0],[2.65,.12,1.85],'#201a17',3);draw('cube',[0,1.286,0],[2.5,.018,1.7],'#183332',1)
   for(const x of [-2.55,2.55])draw('cube',[x,1.3,0],[.022,.025,1.76],'#92794b',3)
   for(const z of [-1.76,1.76])draw('cube',[0,1.3,z],[2.57,.025,.022],'#92794b',3)
   // The player is seated at the near side: torso, knees, shoes and articulated hands.
   draw('cube',[0,1.05,3.25],[.72,.72,.38],'#17232d',3)
   draw('cube',[-.48,.76,2.72],[.25,.25,.3],'#23313b',3);draw('cube',[.48,.76,2.72],[.25,.25,.3],'#23313b',3)
   bone([-.48,.68,2.72],[-.62,.35,3.85],.18,'#1d2b35');bone([.48,.68,2.72],[.62,.35,3.85],.18,'#1d2b35')
   draw('cube',[-.62,.24,4.05],[.3,.12,.58],'#101820',3);draw('cube',[.62,.24,4.05],[.3,.12,.58],'#101820',3)
   for(const side of [-1,1]){
    const handPosition:V=[side*.72,1.15,2.05]
    bone([side*.58,1.62,2.85],handPosition,.12,'#23313b')
    hand(handPosition,'#a7aaa2')
   }
   for(const x of [-1.65,1.65]){draw('cube',[x,.55,.8],[.12,.6,.12],'#1d1b1a');draw('cube',[x,1,2.7],[.09,.08,.6],'#252321',3)}
   // Opponent: dark hood, recessed face, almost nothing but ivory eyes.
   draw('cube',[0,2,-2.45],[.52,.85,.1],'#211e1d',3)
   draw('sphere',[0,1.88,-2.13],[.58,.74,.36],'#0a0d14');draw('sphere',[0,2.66,-2.05],[.41,.49,.36],'#0c1019')
   draw('sphere',[0,2.62,-1.755],[.285,.32,.035],'#020509');draw('sphere',[-.108,2.65,-1.711],[.064,.018,.018],'#e8f3ed',4);draw('sphere',[.108,2.65,-1.711],[.064,.018,.018],'#e8f3ed',4)
   draw('sphere',[0,2.89,-1.82],[.35,.14,.14],'#0c1119')
   const reach=this.phase==='exchange'?Math.sin(Math.PI*t):0
   bone([-.43,2.02,-2.1],[-.55,1.43,-.96],.15,'#0d1118');hand([-.55,1.37,-.92],'#1b252a')
   bone([.43,2.02,-2.1],[.35,1.43,lerp(-1.05,.5,reach)],.15,'#0d1118');hand([.35,1.38,lerp(-1.02,.55,reach)],'#202b30')
   // Warm pools of candlelight beside the cold figure.
   for(const x of [-1.9,1.9]){draw('cylinder',[x,1.34,-1.25],[.14,.035,.14],'#7b633c',3);draw('cylinder',[x,1.57,-1.25],[.043,.22,.043],'#b3a989');draw('sphere',[x,1.83,-1.25],[.028,.07,.028],'#ffbf68',4)}
   if(this.phase==='exchange'){
    const exchangeT=Math.min(1,t*3),h:V=[lerp(.85,.2,exchangeT),1.45,lerp(2,.58,exchangeT)]
    bone([1.05,1.15,2.9],h,.1,'#354344');hand(h,'#a6aaa2')
    for(let i=0;i<9;i++){
     const collect=Math.min(1,t*1.7),targetCoin:V=[.18+(i%3)*.07,1.38+Math.floor(i/3)*.025,.18]
     const actual=coinPosition(i*37,now/1000),pickup:V=[actual[0],actual[1]+.05,actual[2]]
     const coin:V=[lerp(pickup[0],targetCoin[0],collect),lerp(pickup[1],targetCoin[1],collect)+Math.sin(collect*Math.PI)*.8,lerp(pickup[2],targetCoin[2],collect)]
     if(t<.7||collect<1)draw('cylinder',coin,[.10,.012,.10],'#c6a15f',3,ry(collect*Math.PI*4))
    }
   }
   if(this.phase!=='idle'){
    const parent=mul(translate(die),rotation),half=.135
    draw('cube',[0,0,0],[half,half,half],'#e4dbc4',2,I(),parent)
    const faces:{n:number;p:V;r:M}[]=[{n:1,p:[0,half+.001,0],r:rx(-Math.PI/2)},{n:6,p:[0,-half-.001,0],r:rx(Math.PI/2)},{n:2,p:[0,0,half+.001],r:I()},{n:5,p:[0,0,-half-.001],r:ry(Math.PI)},{n:3,p:[half+.001,0,0],r:ry(Math.PI/2)},{n:4,p:[-half-.001,0,0],r:ry(-Math.PI/2)}]
    const positions:Record<number,number[][]>={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]}
    for(const face of faces){const faceMatrix=mul(parent,mul(translate(face.p),face.r));for(const [x,y]of positions[face.n])draw('sphere',[x*.067,y*.067,0],[.021,.021,.006],'#182128',0,I(),faceMatrix)}
   }
  }
  const tick=(now:number)=>{if(this.disposed)return;if(document.visibilityState==='visible'&&now-this.lastFrame>(this.phase==='rolling'?15:32)){this.lastFrame=now;this.drawScene?.(now)}this.ticker=requestAnimationFrame(tick)}
  this.ticker=requestAnimationFrame(tick);this.resizeObserver=new ResizeObserver(()=>this.drawScene?.(performance.now()));this.resizeObserver.observe(canvas)
 }
 setDrag(x:number,y:number){this.drag=[Math.max(-.5,Math.min(.5,x/300)),Math.max(-.1,Math.min(.4,-y/500)),0]}
 setLookDrag(x:number,y:number){this.look=[Math.max(-1.15,Math.min(1.15,x/420)),Math.max(-.9,Math.min(.9,-y/420))]}
 setLookPointer(x:number,y:number){this.look=[Math.max(-1.15,Math.min(1.15,x*.78)),Math.max(-.9,Math.min(.9,-y*.65))]}
 setCoins(coins:number){this.coins=Math.max(0,Number.isFinite(coins)?coins:0)}
 async exchange(){this.phase='exchange';this.start=performance.now();this.duration=this.reduced?1:2100;await new Promise(r=>setTimeout(r,this.duration));this.ready()}
 ready(){this.phase='ready';this.drag=[0,0,0]}
 async roll(result:number){this.result=result;this.phase='rolling';this.start=performance.now();this.duration=this.reduced?1:1900;await new Promise(r=>setTimeout(r,this.duration));this.phase='result';this.drawScene?.(performance.now())}
 dispose(){this.disposed=true;cancelAnimationFrame(this.ticker);this.resizeObserver?.disconnect();this.gl?.getExtension('WEBGL_lose_context')?.loseContext()}
}
