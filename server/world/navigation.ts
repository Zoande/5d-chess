import {distance,parkedCars,point,type Point} from '../../src/world/city-plan.ts'
import {cityGridBounds,findPath,pedestrianCost,outdoorGrid} from '../../src/world/city-navigation.ts'
import {groundZone,outdoorWalkable} from '../../src/world/model.ts'
import {streetBuilding} from '../../src/world/residential.ts'
import {vehicleContains,type Vehicle} from '../../src/world/traffic.ts'

const navCells=new Map<number,boolean>(),navEdges=new Map<number,boolean>(),cachedPaths=new Map<string,Point[]>()
function outside(p:Point){
  if(!cityGridBounds(p))return false
  const k=(Math.round(p.x*1000)+100_000)*200_000+Math.round(p.z*1000)+100_000
  const old=navCells.get(k)
  if(old!==undefined)return old
  // Leave room to round corners between waypoints without grazing a residential wall.
  const okay=groundZone(p.x,p.z)==='city'&&!streetBuilding(p.x,p.z,.52)&&outdoorWalkable(p.x,p.z)&&!parkedCars.some(v=>vehicleContains(p,v,.35))
  navCells.set(k,okay)
  return okay
}
function outdoorCell(p:Point){
  return (Math.round(p.x/outdoorGrid)+128)*256+Math.round(p.z/outdoorGrid)+128
}
function outdoorEdge(a:Point,b:Point){
  const from=outdoorCell(a),to=outdoorCell(b)
  const key=Math.min(from,to)*65536+Math.max(from,to)
  const saved=navEdges.get(key)
  if(saved!==undefined)return saved
  const clear=[.23,.5,.77].every(t=>outside(point(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t)))
  navEdges.set(key,clear)
  return clear
}
export function cityRoute(a:Point,b:Point,vehicles:readonly Vehicle[]=[]){
  const nearby=vehicles.filter(v=>distance(v,a)<12)
  if(nearby.length){
    const clear=(p:Point)=>outside(p)&&!nearby.some(v=>vehicleContains(p,v,.59))
    const detour=findPath(a,b,outdoorGrid,clear,pedestrianCost,10000,outdoorEdge)
    if(detour.length)return detour
  }
  const key=[a.x,a.z,b.x,b.z].map(n=>n.toFixed(1)).join(',')
  const saved=cachedPaths.get(key)
  if(saved)return [...saved]
  const path=findPath(a,b,outdoorGrid,outside,pedestrianCost,21000,outdoorEdge)
  if(cachedPaths.size>360)cachedPaths.delete(cachedPaths.keys().next().value!)
  if(path.length)cachedPaths.set(key,path)
  return [...path]
}
