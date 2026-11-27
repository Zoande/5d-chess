import {shared} from './map-data.ts'
import {distance,point,PREVIEW_BOUNDS,type Point} from './city-plan.ts'

type Cell=Point&{g:number;f:number;prior?:Cell}
class SearchQueue {
  nodes:Cell[]=[]
  push(v:Cell){
    let i=this.nodes.push(v)-1
    while(i){
      const parent=(i-1)>>1
      if(this.nodes[parent].f<=v.f)break
      this.nodes[i]=this.nodes[parent];i=parent
    }
    this.nodes[i]=v
  }
  pop(){
    const top=this.nodes[0],v=this.nodes.pop()
    if(this.nodes.length&&v){
      let i=0
      while(i*2+1<this.nodes.length){
        let child=i*2+1
        if(this.nodes[child+1]?.f<this.nodes[child].f)child++
        if(this.nodes[child].f>=v.f)break
        this.nodes[i]=this.nodes[child];i=child
      }
      this.nodes[i]=v
    }
    return top
  }
}
const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
function cellNear(p:Point,step:number,valid:(p:Point)=>boolean){
  const sx=Math.round(p.x/step),sz=Math.round(p.z/step)
  let result:Point|undefined,best=Infinity
  for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++){
    const v=point(sx+i,sz+j),world=point(v.x*step,v.z*step),d=distance(p,world)
    if(d<best&&valid(world)){result=v;best=d}
  }
  return result
}
export function findPath(from:Point,to:Point,step:number,valid:(p:Point)=>boolean,weight:(p:Point)=>number=()=>1,limit=3500,edge?:(a:Point,b:Point)=>boolean){
  const a=cellNear(from,step,valid),b=cellNear(to,step,valid)
  if(!a||!b)return []
  // A diagonal can visit the same candidate as eight neighboring cells. Doors,
  // furniture and parked vehicles are stable for the duration of one search.
  const cells=new Map<string,boolean>()
  const traversable=(x:number,z:number)=>{
    const key=x+','+z
    const cached=cells.get(key)
    if(cached!==undefined)return cached
    const clear=valid(point(x*step,z*step))
    cells.set(key,clear);return clear
  }
  const queue=new SearchQueue(),scores=new Map<string,number>()
  queue.push({...a,g:0,f:distance(a,b)})
  scores.set(a.x+','+a.z,0)
  for(let i=0;i<limit&&queue.nodes.length;i++){
    const v=queue.pop()!,hash=v.x+','+v.z
    if(v.g!==scores.get(hash))continue
    if(v.x===b.x&&v.z===b.z){
      const cells:Point[]=[]
      for(let node:Cell|undefined=v;node;node=node.prior)cells.push(node)
      cells.reverse()
      const simplified=cells.filter((p,i)=>i===0||i===cells.length-1||p.x-cells[i-1].x!==cells[i+1].x-p.x||
        p.z-cells[i-1].z!==cells[i+1].z-p.z).map(p=>point(p.x*step,p.z*step))
      if(distance(simplified.at(-1)!,to)>.05)simplified.push(to)
      return simplified
    }
    for(const [dx,dz] of directions){
      const x=v.x+dx,z=v.z+dz,p=point(x*step,z*step)
      if(!traversable(x,z)||dx&&dz&&(!traversable(x,v.z)||!traversable(v.x,z)))continue
      if(edge&&!edge(point(v.x*step,v.z*step),p))continue
      const g=v.g+Math.hypot(dx,dz)*weight(p),key=x+','+z
      if(g>=(scores.get(key)??Infinity))continue
      scores.set(key,g)
      queue.push({x,z,g,f:g+Math.hypot(x-b.x,z-b.z),prior:v})
    }
  }
  return []
}
const grid=shared.navigation
export const outdoorGrid=grid.step
export function pedestrianCost(p:Point){
  const value=grid.rows[Math.round(p.z/grid.step)-grid.top]?.[Math.round(p.x/grid.step)-grid.left]
  return value==='W'?1:value==='R'?9:value==='C'?1.15:2.2
}
export const cityGridBounds=(p:Point)=>p.x>=PREVIEW_BOUNDS.west-1&&p.x<=PREVIEW_BOUNDS.east+1&&p.z>=PREVIEW_BOUNDS.north&&p.z<=PREVIEW_BOUNDS.south+2
