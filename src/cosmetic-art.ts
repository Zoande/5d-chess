import {itemById,RARITY_COLORS} from './collection.ts'
import {icon} from './icons.ts'
const motifs:Record<string,string>={
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
export const SKIN_MARKS:Record<string,string>={
 lines:'M0 6h24M0 10h24M0 14h24M0 18h24M0 22h24',
 flecks:'m6 6 2 1m7 1 2-1M8 13l2 1m5 3 2-1m-9 3 1 1m3-9 1 1',
 grain:'M4 0c12 6-10 10 2 24M9 0c12 6-10 10 2 24M14 0c12 6-10 10 2 24M19 0c12 6-10 10 2 24',
 bands:'M0 8h24M0 9h24M0 16h24M0 17h24',
 tiles:'M0 8h24M0 14h24M0 20h24M6 0v24M12 0v24M18 0v24',
 stripes:'M-12 24 12 0M-8 24 16 0M-4 24 20 0M0 24 24 0M4 24 28 0M8 24 32 0M12 24 36 0',
 rings:'M6 7a3 3 0 1 0 6 0 3 3 0 1 0-6 0m6 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0m-8 7a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
 leaves:'M7 24 17 0M10 16q-8-6-5-7 6 0 5 7m2-6q7 2 7-3-6-2-7 3m-5 14q-7-5-4-7 6 0 4 7m3-6q8 2 8-3-6-2-8 3',
 facets:'M0 0 12 8 24 0M0 12l12-4 12 4-12 8-12-8m12-4v12m0 0v4M0 24l12-4 12 4',
 circuit:'M6 0v8h6v8h6v8M18 0v5h-5m-13 9h5v10M24 10h-7v3M10 24v-4H7',
 waves:'M0 5q6-5 12 0t12 0M0 10q6-5 12 0t12 0M0 15q6-5 12 0t12 0M0 20q6-5 12 0t12 0',
 stars:'m8 7 1-3 1 3 3 1-3 1-1 3-1-3-3-1 3-1Zm6 11 1-3 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z',
 petals:'M12 12c-10-8 10-8 0 0-8-10-8 10 0 0 10 8-10 8 0 0 8 10 8-10 0 0Zm-6-8 1 1m12 16 1 1',
 cracks:'m6 0 6 8-5 4 8 6-5 6m2-16 8-2m-13 6-7 2m15 4 9-1',
 ribbons:'M0 0c24 5-12 16 24 24M0 4c24 5-12 16 24 24M0-4c24 5-12 16 24 24',
 filigree:'M12 0v24M12 12c-12-12-12 12 0 0 12-12 12 12 0 0m0-6c-8-8-8 8 0 0 8-8 8 8 0 0m0 12c-8-8-8 8 0 0 8-8 8 8 0 0',
 rays:'M12 12 0 0m12 12V0m0 12L24 0m-12 12h12m-12 0 12 12m-12-12v12m0-12L0 24m12-12H0m12 0L4 0m8 12 8 12m-8-12L0 6m12 6 12 6',
 constellation:'m4 19 5-7 7 2 4-8M4 19h.1M9 12h.1M16 14h.1M20 6h.1M6 5h.1M14 3h.1',
 diamonds:'m12 0 6 6-6 6-6-6 6-6Zm0 12 6 6-6 6-6-6 6-6ZM0 6l6 6-6 6m24-12-6 6 6 6',
 orbit:'M4 12a8 3 35 1 0 16 0 8 3 35 1 0-16 0m0 0a8 3-35 1 0 16 0 8 3-35 1 0-16 0M12 1v4m0 14v4'
}
