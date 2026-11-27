import type {ResidentView} from '../../src/world/city-residents.ts'
import type {Point} from '../../src/world/city-plan.ts'

// All observers of a simulation step share the same immutable resident poses.
export class ResidentIndex {
  private cells=new Map<string,ResidentView[]>()
  private size=32
  constructor(residents:ResidentView[]){
    for(const resident of residents){
      const key=this.key(resident.x,resident.z)
      const cell=this.cells.get(key)
      if(cell)cell.push(resident)
      else this.cells.set(key,[resident])
    }
  }
  private key(x:number,z:number){return Math.floor(x/this.size)+','+Math.floor(z/this.size)}
  nearby(p:Point,radius:number){
    const visible:ResidentView[]=[]
    for(let x=Math.floor((p.x-radius)/this.size);x<=Math.floor((p.x+radius)/this.size);x++){
      for(let z=Math.floor((p.z-radius)/this.size);z<=Math.floor((p.z+radius)/this.size);z++){
        for(const resident of this.cells.get(x+','+z)??[]){
          if((resident.x-p.x)**2+(resident.z-p.z)**2<radius**2)visible.push(resident)
        }
      }
    }
    return visible
  }
}
