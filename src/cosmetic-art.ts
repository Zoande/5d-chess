import {itemById,RARITY_COLORS} from './collection.ts'
import {icon} from './icons.ts'
const motifs:Record<string,string>={
 'solar-moth':'<path d="M32 25C12 1 3 16 15 34L9 47l19-8m4-14C52 1 61 16 49 34l6 13-19-8M32 20v30m0-29-6-9m6 9 6-9"/><circle cx="20" cy="24" r="5"/><circle cx="44" cy="24" r="5"/>',
 astrolabe:'<circle cx="32" cy="32" r="22"/><ellipse cx="32" cy="32" rx="12" ry="22" transform="rotate(30 32 32)"/><path d="M12 40 52 24M20 12l24 40M27 9l5-5 5 5M28 32h8m-4-4v8"/>',
 firebird:'<path d="M32 49 11 36 6 16l17 13-8-20 17 15L48 9l-7 20 17-13-5 20-21 13Zm0 0V25m-13 18-5 10m31-10 5 10M27 16l5-10 5 10"/>',
 'sun-lion':'<path d="m32 5 8 7 11 3 2 12 5 8-10 8-5 11H21L16 43 6 35l5-8 2-12 11-3Zm-10 15-3 16 7 9h12l7-9-3-16-10 4-10-4Zm3 12h2m10 0h2m-12 6 5 4 5-4"/>',
 dyson:'<circle cx="32" cy="32" r="8"/><path d="M32 3v12m0 34v12M3 32h12m34 0h12M11 11l9 9m24 24 9 9M11 53l9-9m24-24 9-9"/><ellipse cx="32" cy="32" rx="25" ry="15" transform="rotate(-35 32 32)"/><ellipse cx="32" cy="32" rx="15" ry="25" transform="rotate(-35 32 32)"/>',
 'lunar-hare':'<path d="M47 8C23 5 8 26 17 45c6 11 18 13 30 7M23 43l6-15-3-18q7-5 9 15l6-17q9-1 2 19l5 9-7 6 4 9H24l-7-6 6-2Zm14-10h.1"/>',
 'moon-jelly':'<path d="M12 30a20 20 0 0 1 40 0c-8-6-12 5-20 0s-12 5-20 0Zm7 5q-9 9 0 18m9-18q9 9 0 23m8-23q-9 9 0 20m9-20q9 9 0 16M22 20q10-10 20 0"/>',
 nocturne:'<path d="M13 11l13 6h12l13-6-3 18c9 20-5 27-16 27S7 49 16 29l-3-18ZM22 24a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm20 0a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM29 38l3 6 3-6M22 30h.1m20 0h.1M19 45l7 6m19-6-7 6"/>',
 'moon-dragon':'<path d="M45 9C18-3 0 31 18 48c16 18 46-1 34-18L39 36l3-15-10-7 13-5ZM17 45l8-12 9-5 4-11 9 3-5 11-7 6-2 10-16-2Zm22-25h.1M20 20l9 7-1-11"/>',
 'eclipse-gate':'<circle cx="32" cy="28" r="20"/><path d="M21 47V27a11 11 0 0 1 22 0v20M17 54h30M25 48h14M32 5V1M8 11l-5-5m53 5 5-5M6 29H1m62 0h-5M30 22l7 7-7 7"/>',
 pawn:'<circle cx="32" cy="21" r="7"/><path d="M28 28 22 45h20l-6-17M20 49h24"/>',
 rook:'<path d="M19 15h7v7h5v-7h7v7h5v-7h4v15l-6 5v11H25V35l-6-5ZM21 50h24"/>',
 knight:'<path d="m23 48 3-10 12-15-12 6-8-5 7-12 8-4 14 12 1 20-8 8Zm10-31h.1"/>',
 bishop:'<path d="m33 10 12 16-5 10H25l-5-10L33 10Zm0 0-6 18m0 9-7 12h25l-7-12"/>',
 laurel:'<path d="M28 49C9 39 12 20 19 13M36 49c19-10 16-29 9-36M16 20l9 5m-11 5 11 3m-7 8 11-1m19-20-9 5m11 5-11 3m7 8-11-1m-9-9 6 6 11-14"/>',
 compass:'<circle cx="32" cy="32" r="22"/><path d="m42 19-6 18-14 8 6-18 14-8ZM32 6v7m0 38v7M6 32h7m38 0h7"/>',
 hourglass:'<path d="M20 11h24m-24 42h24M22 13v9l20 20v9m0-38v9L22 42v9m3-3 7-6 7 6M26 18h12"/>',
 shield:'<path d="m32 8 21 9-3 21-18 17-18-17-3-21 21-9Zm-9 23 7 7 13-16"/>',
 eclipse:'<circle cx="32" cy="32" r="21"/><path d="M37 11c-19 8-19 34 0 42M6 32h7m38 0h7M32 5v7m0 40v7"/>',
 eye:'<path d="M5 32s12-18 27-18 27 18 27 18-12 18-27 18S5 32 5 32Z"/><circle cx="32" cy="32" r="10"/><path d="m32 8 5-6m-5 54-5 6"/>',
 crystal:'<path d="m32 5 22 16-5 24-17 14L15 45 10 21 32 5Zm0 0-9 21 9 33 9-33-9-21ZM10 21l13 5h18l13-5M15 45l17-9 17 9"/>',
 comet:'<path d="M52 8 26 24M57 20 39 31M41 5 27 15M21 50A13 13 0 1 0 21 24a13 13 0 0 0 0 26Zm-4-16 4-4 5 6"/>',
 phoenix:'<path d="m32 51-7-11L8 21l16 5-9-15 16 9 6-10 8 7-9 5 6 8 14-9-10 19-14 11Zm0 0v-20M20 47l-5 8m29-8 5 8"/>',
 serpent:'<path d="M46 17C21-7 2 31 17 47c18 18 45-1 33-20l-10 7 4-17 13-2-7 12M20 19l7 8m-14 4 11 1m-6 12 8-6m5 13 1-11m13 4-8-7"/>',
 lotus:'<path d="M32 49C8 48 7 30 8 27l18 6M32 49c24-1 25-19 24-22l-18 6M32 49C10 33 19 16 22 13l10 17m0 19c22-16 13-33 10-36L32 30m0 19c-15-15-8-33 0-43 8 10 15 28 0 43Z"/>',
 sun:'<circle cx="32" cy="32" r="14"/><path d="M32 3v9m0 40v9M3 32h9m40 0h9M11 11l7 7m28 28 7 7M11 53l7-7m28-28 7-7m-29 9 3 17h10l3-17-8 6-8-6Z"/>',
 crown:'<path d="m10 18 9 27h26l9-27-14 13-8-20-8 20-14-13Zm9 33h26M32 3v7M5 10l4 6m50-6-4 6"/><circle cx="32" cy="11" r="3"/>',
 stag:'<path d="m26 30-6-9-4-15m4 15L8 17m15 9 3-17m12 21 6-9 4-15m-4 15 12-4m-15 9-3-17M26 30l-6 5 7 17h10l7-17-6-5H26Zm1 8h.1m10 0h.1M30 45h4"/>',
 dragon:'<path d="m13 49 6-18 13-8 2-14 8 10 12 5-10 8-9 1-7 8 17 2-7 10H20Zm6-18-9-11 17 3m5 0-8-10 10-4m8 15h.1M10 55h44"/>',
 orbit:'<ellipse cx="32" cy="32" rx="28" ry="10" transform="rotate(-35 32 32)"/><ellipse cx="32" cy="32" rx="28" ry="10" transform="rotate(35 32 32)"/><path d="M32 8v12m-5-7h10m-13 15 8 7 8-7-4 19h-8l-4-19Zm3 24h10"/>'
}
export function avatarArt(id:string){
 const item=itemById(id)
 if(!item||item.type!=='icon')return icon('person')
 const color=RARITY_COLORS[item.rarity]
 return `<svg class="collectible-avatar" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#202522" stroke="${color}" stroke-width="1"/><g fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${motifs[item.motif]}</g></svg>`
}

const framePaths:Record<string,string>={
 'copper-orbit':'M32 3a29 29 0 1 1-20 8M32 8a24 24 0 1 0 17 7',
 verdant:'M32 3C0 6 0 58 32 61 64 58 64 6 32 3M8 21l8-3-4-7m-7 23 8-2-6-7m0 20 9-3-7-6m6 17 7-7-9-3m43-22-8-3 4-7m7 23-8-2 6-7m0 20-9-3 7-6m-6 17-7-7 9-3',
 tideline:'M5 32C-2 3 47-9 57 19S29 72 9 51M4 28C22 52 48 8 60 34M4 34c18 24 44-20 56 6',
 arcade:'M3 23V9h6V3h14m18 0h14v6h6v14m0 18v14h-6v6H41m-18 0H9v-6H3V41M8 17V8h9m30 0h9v9m0 30v9h-9m-30 0H8v-9',
 'clock-ring':'M32 3l4 4 5-3 2 6 6-1 1 6 6 2-2 6 5 4-4 5 4 5-5 4 2 6-6 2-1 6-6-1-2 6-5-3-4 4-4-4-5 3-2-6-6 1-1-6-6-2 2-6-5-4 4-5-4-5 5-4-2-6 6-2 1-6 6 1 2-6 5 3Z',
 'frost-crown':'M32 1l4 9 8-6 1 10 10-1-4 9 11 3-9 7 9 7-11 3 4 9-10-1-1 10-8-6-4 9-4-9-8 6-1-10-10 1 4-9-11-3 9-7-9-7 11-3-4-9 10 1 1-10 8 6Z',
 'royal-seal':'M5 32a27 27 0 1 0 54 0M12 17 8 4l9 5 4-8 5 9h12l5-9 4 8 9-5-4 13M9 43l-5 13 12-3m39-10 5 13-12-3',
 plasma:'M32 3C2 3 2 61 32 61S62 3 32 3Zm0 6C-5 9-5 55 32 55S69 9 32 9Z',
 seraph:'M12 12 1 7l4 17-3 7 9 5M52 12l11-5-4 17 3 7-9 5M9 29 0 25l4 18 10 3m41-17 9-4-4 18-10 3M15 43 5 42l9 16 12 3m23-18 10-1-9 16-12 3M21 8 32 2l11 6',
 'rift-halo':'M19 4a29 29 0 0 1 40 28m0 9A29 29 0 0 1 24 60M14 55A29 29 0 0 1 4 20M10 10l6 5m36 34 6 5M9 36l-7 2m39-29 2-7',
 'solar-corona':'M32 0l3 9 7-6 1 10 10-3-4 10 11 1-8 7 12 4-12 4 8 7-11 1 4 10-10-3-1 10-7-6-3 9-3-9-7 6-1-10-10 3 4-10-11-1 8-7L0 32l12-4-8-7 11-1-4-10 10 3 1-10 7 6Z',
 'ember-wings':'M13 8 1 1l5 21 7 7-11 6 12 16 12 9M51 8l12-7-5 21-7 7 11 6-12 16-12 9M7 9l9 10m-7 2 6 5m42-17-9 10m7 2-6 5',
 'eclipse-crown':'M7 31a25 25 0 1 0 50 0M8 24 5 8l10 6 6-12 5 12h12l5-12 6 12 10-6-3 16M13 22h38M22 57l10 7 10-7',
 'lunar-tide':'M8 12C42-9 75 30 53 53S-9 42 8 12ZM7 46C15 23 51 42 58 20M18 3a4 4 0 1 0 5 6M45 55a4 4 0 1 0 5 6',
 'night-garden':'M32 2C-4 5-4 59 32 62 68 59 68 5 32 2M5 28l7-7m-9 17 9-5m-4 16 9-7m42-14-7-7m9 17-9-5m4 16-9-7M13 10q10-12 10 0-12 0 0 4 0 10-4 0-10 0-6-4m28 44q10-12 10 0-12 0 0 4 0 10-4 0-10 0-6-4'
}
export function framedAvatar(avatarId:string,frameId?:string){
 const frame=itemById(frameId??'')
 if(!frame||frame.type!=='frame')return avatarArt(avatarId)
 const color=RARITY_COLORS[frame.rarity],index=Object.keys(framePaths).indexOf(frame.motif)
 return `<span class="framed-avatar frame-${frame.motif}" style="--frame-color:${color};--frame-speed:${12+index*2}s">${avatarArt(avatarId)}<svg class="avatar-frame" viewBox="-5 -5 74 74" aria-hidden="true"><g class="frame-structure" fill="none" stroke="${color}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">${framePaths[frame.motif]?`<path d="${framePaths[frame.motif]}"/>`:''}</g><g class="frame-orbit" fill="${color}"><circle cx="32" cy="3" r="2"/><path d="M32 58l3 3-3 3-3-3Z"/></g><circle class="frame-glimmer" cx="32" cy="32" r="29" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="3 80 12 88"/></svg></span>`
}
export const frameArt=(id:string)=>framedAvatar('icon-imperial-crown',id)
