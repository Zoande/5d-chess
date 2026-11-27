// Deadlines are wall-clock timestamps. Motion catches up by at most four steps after a stall.
export const STEP_MS=50
export class WorldClock {
  private last:number
  constructor(start:number){this.last=start}
  advance(now:number,simulate:(at:number)=>void,skip?:(ms:number)=>void){
    const steps=Math.floor((now-this.last)/STEP_MS)
    if(steps<=0)return false
    const dropped=Math.max(0,steps-4)*STEP_MS
    if(dropped){this.last+=dropped;skip?.(dropped)}
    for(let i=0;i<Math.min(steps,4);i++){this.last+=STEP_MS;simulate(this.last)}
    return true
  }
}
