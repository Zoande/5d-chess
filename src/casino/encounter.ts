import {MIN_DICE_STAKE,type CasinoRound,type EncounterReason} from '../casino-model.ts'
export function encounterTrigger(round:CasinoRound,coins:number,rolls:number,random:number):EncounterReason|undefined {
 if(round.game!=='dice'||round.currency)return
 if(!round.won&&coins<MIN_DICE_STAKE)return 'broke'
 if(rolls>=100)return 'marathon'
 if(random<.00001)return 'chance' // 0.001%, sampled once per completed coin throw.
}
export const encounterQuestion=(reason?:EncounterReason)=>reason==='broke'?'“Would you like to deal with your soul?”':'“Would you like to try something new?”'
