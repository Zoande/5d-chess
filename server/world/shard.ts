import type {Position} from '../../src/roulette-hall-model.ts'
import {localSite,type WorldPlayer,type WorldUse,type WorldChat} from '../../src/world/model.ts'
import type {ResidentialView} from '../../src/world/residential.ts'
import type {BarService} from '../../src/world/bar-menu.ts'
import type {Restaurant} from '../restaurant.ts'
import type {CityLife} from '../city-life.ts'
import type {WorldClock} from './clock.ts'

export type Member=WorldPlayer&{slot?:number;seen:number;moved:number;interaction?:WorldUse;liftArrived?:boolean;homeExit?:Position;cell?:number}
export type World={clock:WorldClock;id:string;shard:number;members:Map<string,Member>;restaurant:Restaurant;chat:WorldChat[];nextChat:number;lastChat:Map<string,number>;bar?:BarService;barReceipts:Map<string,string>;residential:ResidentialView;life:CityLife}

export const publicMember=({name,avatar,zone,x,z,yaw,chair,lounge,online,lift,dining,eatingUntil,carrying,workingUntil,workKind,kfcRole,kitchenHand,kitchenMotion,carriedItems,barSeat,boardSeat,homePose,shower,equipped}:Member,shared:boolean):WorldPlayer=>({name,avatar,zone,...(shared?{x,z}:localSite(zone,x,z)),yaw,chair,lounge,online,lift,dining,eatingUntil,carrying,workingUntil,workKind,kfcRole,kitchenHand,kitchenMotion,carriedItems,barSeat,boardSeat,homePose,shower,equipped})
