import type {Collectible} from './collection.ts'
export type EffectType='movement'|'capture'
const names=[
 ['movement','gold','Gilded Wake','common','A fine gold ribbon with drifting metallic flecks.'],
 ['movement','chalk','Chalkline','common','A hand-drawn dotted route that fades behind the piece.'],
 ['movement','ember','Emberstep','uncommon','Hot embers tumble from a molten orange wake.'],
 ['movement','frost','Frostwake','uncommon','Crystalline shards and an icy double trail.'],
 ['movement','petal','Petal Drift','rare','Rose petals spiral gently along the route.'],
 ['movement','neon','Neon Rail','rare','Two electric rails frame the travelling piece.'],
 ['movement','star','Starfall','epic','A comet tail scatters sharp, luminous stars.'],
 ['movement','echo','Phase Echo','epic','Fading silhouettes mark the path through space.'],
 ['movement','thunder','Thunderpath','legendary','A braided lightning filament follows each move.'],
 ['movement','time','Chronostream','mythic','Violet clock rings ripple through the timeline.'],
 ['capture','dust','Dustbound','common','The captured piece dissolves into drifting grains.'],
 ['capture','flight','Dismissal','common','The captured piece spins up and away from the board.'],
 ['capture','glass','Glassbreak','uncommon','The piece fractures into tumbling glass tiles.'],
 ['capture','ash','Ashfall','uncommon','A brief ember corona consumes the captured piece.'],
 ['capture','ice','Frostbite','rare','Ice locks the piece, then splinters into frozen shards.'],
 ['capture','bloom','Last Blossom','rare','The captured piece bursts into a shower of petals.'],
 ['capture','beam','Judgement','epic','A narrow golden pillar lifts the piece into light.'],
 ['capture','void','Singularity','epic','A dark gravitational lens draws the piece into nothing.'],
 ['capture','bolt','Royal Thunder','legendary','A branching lightning strike shatters the silhouette.'],
 ['capture','rewind','Time Unmade','mythic','Temporal echoes unwind the captured piece out of existence.']
] as const
const prices={common:160,uncommon:320,rare:700,epic:1600,legendary:4000,mythic:12000}
export const EFFECT_ITEMS:Collectible[]=names.map(([type,motif,name,rarity,description])=>({id:`${type}-${motif}`,type,motif,name,rarity,description,price:prices[rarity]}))
const ink:Record<string,string>={gold:'#e8c774',chalk:'#e2ddca',ember:'#ff994c',frost:'#98e1ed',petal:'#f4a8c1',neon:'#69f2d3',star:'#b4ccff',echo:'#a9d7cf',thunder:'#b2b1ff',time:'#da9cff',dust:'#dec6a0',flight:'#ecc777',glass:'#99d7df',ash:'#ff9961',ice:'#aeebff',bloom:'#ed9dc8',beam:'#ffe5a3',void:'#ba8be8',bolt:'#b7baff',rewind:'#a6e8dd'}
const motif=(id:string)=>id.slice(id.indexOf('-')+1)
const rand=(n:number)=>{const a=Math.sin(n*127.1+311.7)*43758.5453;return a-Math.floor(a)}
export function effectSVG(id:string){const m=motif(id),capture=id.startsWith('capture-'),color=ink[m]??'#b9c89a',n=Object.keys(ink).indexOf(m),dots=Array.from({length:12},(_,i)=>{const x=capture?58+Math.cos(i*2.399)*(12+i*1.7):12+i*6,y=capture?40+Math.sin(i*2.399)*(12+i*1.7):45+Math.sin(i*.85+n)*10;return `<path d="M${x} ${y}l${2+i%3} -2 2 4-3 1Z" fill="${color}" opacity="${.25+i/20}"/>`}).join('');return `<svg class="effect-art" data-effect="${id}" viewBox="0 0 120 80" role="img" aria-label="${capture?'Capture':'Movement'} effect"><path d="M8 63h104" stroke="#789477" opacity=".25"/><g class="${capture?'fx-burst':'fx-flow'}">${dots}${['time','void','rewind'].includes(m)?'<ellipse cx="60" cy="40" rx="30" ry="18" fill="none" stroke="'+color+'"/>':''}${['thunder','bolt','neon'].includes(m)?'<path d="M15 55 37 24 45 45 64 16 72 38 104 20" fill="none" stroke="'+color+'" stroke-width="2"/>':''}</g><path d="M70 25a6 6 0 1 0 0 12l-5 16h16l-5-16a6 6 0 0 0-6-12Z" fill="#e5ddbf" stroke="${color}" stroke-width="1.5"/><circle cx="100" cy="65" r="6" fill="none" stroke="${color}"/><path d="M98 62l4 3-4 3Z" fill="${color}"/></svg>`}
interface Point{x:number;y:number}
/** Bounded deterministic particles; all coordinates are board-world units. */
export function drawMovement(ctx:CanvasRenderingContext2D,id:string,points:readonly Point[],at:Point,p:number,ghost:(x:number,y:number,alpha:number)=>void,reduced=false){
 if(!id||id==='default'||reduced||points.length<2)return
 const m=motif(id),color=ink[m];if(!color)return
 const a=points[0],b=at,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<2)return
 const nx=-dy/len,ny=dx/len,tail=Math.min(len,95),start={x:b.x-dx/len*tail,y:b.y-dy/len*tail}
 ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineCap='round';ctx.globalAlpha=.7
 if(m==='echo'){for(let i=1;i<=4;i++)ghost(b.x-dx/len*i*9,b.y-dy/len*i*9,.30-i*.055)}
 else if(m==='time'){for(let i=0;i<5;i++){const q=i/5;ctx.globalAlpha=(1-q)*.65;ctx.beginPath();ctx.ellipse(b.x-dx/len*tail*q,b.y-dy/len*tail*q,7+q*4,13+q*5,Math.atan2(dy,dx),0,Math.PI*2);ctx.stroke()}}
 else{
  for(const offset of m==='neon'||m==='frost'?[-4,4]:[0]){ctx.beginPath();for(let i=0;i<=16;i++){const t=i/16,zig=m==='thunder'?(rand(i+Math.floor(p*20))-.5)*12:m==='gold'?Math.sin(t*8+p*6)*2:0,x=start.x+(b.x-start.x)*t+nx*(offset+zig),y=start.y+(b.y-start.y)*t+ny*(offset+zig);if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.lineWidth=m==='chalk'?1.6:m==='neon'?2.5:2;ctx.setLineDash(m==='chalk'?[2,6]:[]);ctx.stroke();ctx.setLineDash([])}
 }
 for(let i=0;i<16;i++){const q=rand(i+1),spread=(rand(i+17)-.5)*(m==='ember'?22:16),x=b.x-dx/len*tail*q+nx*spread,y=b.y-dy/len*tail*q+ny*spread;ctx.globalAlpha=(1-q)*.8;ctx.save();ctx.translate(x,y);ctx.rotate(i+p*4);ctx.beginPath();if(m==='petal'){ctx.ellipse(0,0,2,4,0,0,Math.PI*2);ctx.fill()}else if(m==='star'){ctx.moveTo(-3,0);ctx.lineTo(0,-4);ctx.lineTo(3,0);ctx.lineTo(0,4);ctx.closePath();ctx.fill()}else if(m==='frost'){ctx.moveTo(0,-3);ctx.lineTo(2,2);ctx.lineTo(-2,2);ctx.closePath();ctx.fill()}else{ctx.arc(0,0,m==='ember'?1.7:1.1,0,Math.PI*2);ctx.fill()}ctx.restore()}
 ctx.restore()
}
export function drawCapture(ctx:CanvasRenderingContext2D,id:string,at:Point,progress:number,victim:()=>void,reduced=false){
 if(!id||id==='default')return false
 const m=motif(id),color=ink[m];if(!color)return false
 const p=Math.max(0,Math.min(1,progress));if(p>=1)return true
 ctx.save();ctx.translate(at.x,at.y);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.5
 if(reduced){ctx.globalAlpha=1-p;ctx.beginPath();ctx.arc(0,0,17+p*8,0,Math.PI*2);ctx.stroke();ctx.restore();return true}
 if(m==='flight'){ctx.save();ctx.translate(p*40,-Math.sin(p*Math.PI/2)*70);ctx.rotate(p*5);ctx.scale(1-p*.8,1-p*.8);ctx.globalAlpha=1-p;victim();ctx.restore()}
 else if(m==='glass'||m==='ice'){
  for(let i=0;i<16;i++){const x=(i%4-1.5)*9,y=(Math.floor(i/4)-1.5)*10,burst=m==='ice'?Math.max(0,(p-.25)/.75):p;ctx.save();ctx.translate((x)*burst*2,(y)*burst*2+burst*burst*30);ctx.rotate((rand(i)-.5)*burst*2);ctx.globalAlpha=1-p;ctx.beginPath();ctx.rect(x-4.5,y-5,9,10);ctx.clip();victim();ctx.restore()}
  if(m==='ice'){ctx.globalAlpha=(1-p)*.7;ctx.fillRect(-14,-19,28,38)}
 }else if(m==='void'||m==='rewind'){
  ctx.save();ctx.rotate(p*9*(m==='void'?1:-1));ctx.scale(Math.max(.01,1-p),Math.max(.01,1-p));ctx.globalAlpha=1-p;victim();ctx.restore();for(let i=0;i<3;i++){ctx.globalAlpha=(1-p)*.7;ctx.beginPath();ctx.ellipse(0,0,5+(1-p)*22+i*3,3+(1-p)*12+i*2,p*4+i,0,Math.PI*2);ctx.stroke()}
 }else{
  ctx.save();ctx.globalAlpha=Math.max(0,1-p*2);if(m==='beam')ctx.translate(0,-p*45);victim();ctx.restore()
 }
 if(m==='beam'){const g=ctx.createLinearGradient(0,-90,0,20);g.addColorStop(0,'#ffe5a300');g.addColorStop(.8,'#ffe5a3aa');g.addColorStop(1,'#ffe5a300');ctx.fillStyle=g;ctx.globalAlpha=Math.sin(p*Math.PI);ctx.fillRect(-7,-90,14,110);ctx.fillStyle=color}
 if(m==='bolt'){ctx.globalAlpha=1-p;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(9,-75);ctx.lineTo(-5,-36);ctx.lineTo(9,-38);ctx.lineTo(-3,-5);ctx.stroke()}
 for(let i=0;i<26;i++){const angle=i*2.399,dist=(8+rand(i+8)*35)*p,x=Math.cos(angle)*dist,y=Math.sin(angle)*dist-(m==='dust'?p*30:0)+(m==='ash'?p*18:0);ctx.globalAlpha=(1-p)*(.3+rand(i));ctx.save();ctx.translate(x,y);ctx.rotate(angle+p*3);if(m==='bloom'){ctx.beginPath();ctx.ellipse(0,0,2,4,0,0,Math.PI*2);ctx.fill()}else if(m==='dust'||m==='ash'){ctx.fillRect(0,0,1.8,1.8)}else{ctx.beginPath();ctx.moveTo(0,-3);ctx.lineTo(2.5,2);ctx.lineTo(-2.5,2);ctx.closePath();ctx.fill()}ctx.restore()}
 ctx.restore();return true
}
