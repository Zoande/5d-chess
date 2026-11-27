import {civicRoom} from '../../src/world/civic-venues.ts'
import {site,worldMove,WORLD_SPEED,SPRINT_SPEED} from '../../src/world/model.ts'
import type {World,Member} from './shard.ts'

export function moveMember(world:World,me:Member,movement:Record<string,unknown>,shared:boolean,open:boolean,keys:string[],now:number){
  const motion=movement.kitchenMotion as {x?:unknown;y?:unknown}|undefined
  if(me.zone==='kfc'&&['kfc:kitchen:station','kfc:kitchen:soda','kfc:kitchen:fryer'].includes(me.interaction??'')&&motion&&
    typeof motion.x==='number'&&Number.isFinite(motion.x)&&typeof motion.y==='number'&&Number.isFinite(motion.y)){
    me.kitchenMotion={x:Math.max(-1,Math.min(1,motion.x)),y:Math.max(-1,Math.min(1,motion.y))}
  }else delete me.kitchenMotion
  const {x,z,yaw}=movement
  const currentFloor=movement.zone===undefined||movement.zone===me.zone||!(civicRoom(me.zone)||typeof movement.zone==='string'&&civicRoom(movement.zone))
  if(movement.world===world.id&&currentFloor&&(shared||movement.zone===me.zone)&&!me.chair&&!me.lounge&&me.barSeat===undefined&&me.boardSeat===undefined&&me.dining===undefined&&!me.lift&&!me.homePose&&me.zone!=='private'&&[x,z,yaw].every(n=>typeof n==='number'&&Number.isFinite(n))){
    const limit=(movement.sprint===true?SPRINT_SPEED:WORLD_SPEED)*Math.min(1.25,Math.max(0,(now-me.moved)/1000)),goal=shared?{x:x as number,z:z as number}:site(me.zone,x as number,z as number)
    const {zone,...pos}=worldMove(me.zone,me,goal.x,goal.z,limit,open||me.zone==='cave',keys,world.residential,now,world.life.traffic.vehicles)
    Object.assign(me,pos,{yaw:Math.atan2(Math.sin(yaw as number),Math.cos(yaw as number)),moved:now})
    if(me.kitchenMotion)me.yaw=me.interaction==='kfc:kitchen:station'?0:-Math.PI/2
    return zone
  }
}
