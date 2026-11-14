/** A procedural illustration: no downloaded images, and no animation loop while idle. */
export function initBackdrop(){
 if(!['lobby','collection'].includes(document.body.dataset.page??'')||document.querySelector('.multiverse-backdrop'))return
 const canvas=document.createElement('canvas');canvas.className='multiverse-backdrop';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas)
 const ctx=canvas.getContext('2d');if(!ctx)return
 let pending=0
 const draw=()=>{
  const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,2)
  canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)
  ctx.clearRect(0,0,w,h)
  const inventory=location.hash==='#inventory',shop=document.body.dataset.page==='collection'&&!inventory
  const colors=inventory?['#af9add','#608aca','#7acbb9']:shop?['#d6b777','#7db7ad','#aa8ac2']:['#79c7b3','#9a8ed5','#7daac9']
  let seed=0x5dc0ffee
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  const glow=(x:number,y:number,r:number,color:string)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color+'24');g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)}
  // Fixed anchor regions plus seeded variations keep the composition stable on resize.
  const anchors=[[.06,.2],[.86,.12],[.5,.48],[.09,.83],[.94,.76],[.48,1.08]]
  for(let n=0;n<anchors.length;n++){
   const [ax,ay]=anchors[n],x=w*ax,y=h*ay,size=Math.min(w,1400)*(.12+random()*.06)+55,c=colors[n%3]
   glow(x,y,size*1.5,c)
   ctx.save();ctx.translate(x,y);ctx.rotate((random()-.5)*.8)
   // Diamond silhouettes, tile relief, and a beveled floating frame.
   ctx.transform(1,.32,-.72,.52,0,0);ctx.translate(-size/2,-size/2)
   ctx.fillStyle='#02090e';ctx.fillRect(-9,0,size+18,size+24)
   ctx.strokeStyle=c+'77';ctx.lineWidth=2;ctx.strokeRect(-9,-9,size+18,size+18)
   ctx.fillStyle='#0f242e';ctx.fillRect(-5,-5,size+10,size+10)
   const tile=size/8
   for(let row=0;row<8;row++)for(let col=0;col<8;col++){
    ctx.fillStyle=(row+col)%2?c+'38':'#09141e';ctx.fillRect(col*tile,row*tile,tile-.8,tile-.8)
   }
   ctx.strokeStyle=c+'44';ctx.lineWidth=.7
   for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(i*tile,size+9);ctx.lineTo(i*tile,size+16);ctx.stroke()}
   // Individual sculpted silhouettes rise from a handful of squares.
   for(const [col,row,kind] of [[1,1,0],[5,2,1],[3,5,2],[6,6,0]]){
    ctx.save();ctx.translate((col+.5)*tile,(row+.5)*tile);ctx.transform(1,-.32/.52,.72,1,0,0);ctx.scale(tile/28,tile/28)
    ctx.fillStyle=c+'b0';ctx.strokeStyle=c+'cc';ctx.lineWidth=.8;ctx.shadowColor=c;ctx.shadowBlur=6
    const path=new Path2D(kind===1?'M-11 0L-9-5H8L10 0ZM-7-6L-5-14L-10-20L-3-28L0-34L5-29L10-22L7-12L7-6Z':kind===2?'M-11 0L-9-5H9L11 0ZM-7-6L-5-23H-9V-32H-5V-28H-2V-32H2V-28H5V-32H9V-23H5L7-6Z':'M-11 0L-9-5H9L11 0ZM-7-6L-4-22H4L7-6ZM-7-25H7L9-34L3-31L0-38L-3-31L-9-34ZM-1-39V-46H1V-39ZM-4-44H4V-42H-4Z')
    ctx.fill(path);ctx.stroke(path);ctx.restore()
   }
   ctx.restore()
   // A rift hangs above each alternate board, with broken orbital rings and sparks.
   if(n%2===0){
    const rx=x+size*.55,ry=y-size*.38,r=size*.46
    glow(rx,ry,r*2.4,colors[(n+1)%3]);ctx.save();ctx.translate(rx,ry);ctx.rotate(-.4+n*.2)
    ctx.shadowColor=colors[(n+1)%3];ctx.shadowBlur=13
    for(let ring=0;ring<4;ring++){
     ctx.strokeStyle=colors[(n+ring)%3]+['99','66','33','22'][ring];ctx.lineWidth=ring===0?2.5:1;ctx.setLineDash(ring%2?[5,12,30,8]:[])
     ctx.beginPath();ctx.ellipse(0,0,r+ring*8,(r+ring*8)*.38,0,ring*.5,Math.PI*2-.2);ctx.stroke()
    }
    ctx.setLineDash([]);ctx.shadowBlur=0
    for(let i=0;i<24;i++){const a=random()*Math.PI*2,d=r*(1+random()*.9);ctx.fillStyle=colors[i%3]+'aa';ctx.fillRect(Math.cos(a)*d,Math.sin(a)*d*.55,1+random()*2,1+random()*2)}
    ctx.restore()
   }
  }
  // Constellation paths connect distant boards into parallel timelines.
  ctx.strokeStyle=colors[0]+'25';ctx.lineWidth=1;ctx.setLineDash([3,9])
  for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(w*anchors[i][0],h*anchors[i][1]);ctx.bezierCurveTo(w*.3,h*(i/5),w*.7,h*((i+2)/5),w*anchors[i+2][0],h*anchors[i+2][1]);ctx.stroke()}
  ctx.setLineDash([])
  for(let i=0;i<90;i++){const x=random()*w,y=random()*h;ctx.fillStyle=colors[i%3]+(i%5===0?'88':'35');ctx.beginPath();ctx.arc(x,y,i%5===0?1.5:.7,0,Math.PI*2);ctx.fill()}
 }
 const schedule=()=>{cancelAnimationFrame(pending);pending=requestAnimationFrame(draw)}
 window.addEventListener('resize',schedule,{passive:true});window.addEventListener('hashchange',schedule);draw()
}
