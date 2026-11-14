import {type Kind} from './model.ts'
export const RARITIES=['common','uncommon','rare','epic','legendary','mythic'] as const
export type Rarity=typeof RARITIES[number]
export type ItemType='icon'|'skin'
export const RARITY_COLORS:Record<Rarity,string>={common:'#aeb6bd',uncommon:'#8dbb7b',rare:'#6daaf0',epic:'#b587e8',legendary:'#e8b65a',mythic:'#ed88b7'}
export interface Collectible {id:string;type:ItemType;name:string;rarity:Rarity;motif:string;description:string;price:number}
const levels:Rarity[]=['common','common','common','common','uncommon','uncommon','uncommon','uncommon','rare','rare','rare','rare','epic','epic','epic','legendary','legendary','legendary','legendary','mythic']
const prices=[160,320,700,1600,4000,12000]
const icons=[['pawn-scout','Pawn Scout','pawn','Every great game starts with one small step.'],['castle-guard','Castle Guard','rook','A watchful tower, a steady hand.'],['night-rider','Night Rider','knight','The unexpected route.'],['quiet-bishop','Quiet Bishop','bishop','Patience on the long diagonal.'],['laurel','Laurel','laurel','A well-earned victory.'],['compass','Wayfinder','compass','Find your way across the multiverse.'],['hourglass','Hourglass','hourglass','A moment worth keeping.'],['shield','Sentinel','shield','Hold the line.'],['eclipse','Eclipse','eclipse','Between light and shadow.'],['rift-eye','Rift Eye','eye','Watch every timeline.'],['crystal','Prism','crystal','A thousand possible futures.'],['comet','Comet','comet','Leave a trail.'],['phoenix','Phoenix','phoenix','Rise in another timeline.'],['serpent','Ouroboros','serpent','The end is another beginning.'],['lotus','Lotus','lotus','Calm at the center of the board.'],['sun-king','Sun King','sun','A crown forged in daylight.'],['imperial-crown','Imperial Crown','crown','The weight of a dynasty.'],['celestial-stag','Celestial Stag','stag','A guardian between worlds.'],['dragon','Golden Dragon','dragon','A legend across every age.'],['singularity','Singularity','orbit','One king. Infinite worlds.']]
const skins=[['linen','Linen','lines','Woven cloth panels, stitched hems and a lacquered base.'],['slate','Slate','flecks','Split slate plates reveal a glowing faction mineral.'],['maple','Maple','grain','The warmth of a wooden chess set.'],['ink','Ink','bands','Black lacquer with a bold painted faction crest.'],['mosaic','Mosaic','tiles','Hand-set tesserae, colored grout and a polished stone frame.'],['pinstripe','Pinstripe','stripes','An enamel waistcoat, contrasting lapels and a pinstripe collar.'],['copper','Copperwork','rings','Etched rings and bright edges.'],['fern','Fern','leaves','Small leaves, enduring roots.'],['frost','Frostglass','facets','Sharp facets, cool clarity.'],['circuit','Circuit','circuit','Precision along every route.'],['tidal','Tidal','waves','The steady rhythm of a winning plan.'],['starlit','Starlit','stars','A scattering of distant light.'],['porcelain','Porcelain','petals','Delicate floral marks on a crisp shell.'],['obsidian','Obsidian','cracks','Dark seams through colored stone.'],['aurora','Aurora','ribbons','Sinuous ribbons across all four colors.'],['royal-filigree','Royal Filigree','filigree','Golden scrollwork fit for a royal court.'],['solar','Solar Forge','rays','A sunburst cut into every piece.'],['astral','Astral Atlas','constellation','Map the stars. Command the board.'],['imperial','Imperial','diamonds','Diamond inlays and double-cut borders.'],['chronos','Chronos','orbit','The clockwork heart of the multiverse.']]
const extraSkins:[string,string,string,string,Rarity][]=[
 ['terracotta','Terracotta','terracotta','Hand-fired clay with glazed faction enamel.','common'],
 ['carbon','Carbon Weave','carbon','Woven graphite, satin facets and a colored core.','common'],
 ['ivory','Ivory Court','ivory','Warm ivory shells with a lacquered faction sash.','common'],
 ['honeycomb','Honeycomb','honeycomb','Amber cells in a sculpted geometric shell.','uncommon'],
 ['samurai','Shogun','samurai','Layered lacquer armor, knotted bands and a clan seal.','uncommon'],
 ['cobalt','Delftware','delft','Porcelain white with hand-painted faction florals.','uncommon'],
 ['rivet','Ironclad','rivet','Forged armor plates and proud riveted collars.','uncommon'],
 ['velvet','Velvet Court','velvet','A velvet mantle with embroidered golden clasps.','uncommon'],
 ['kintsugi','Kintsugi','kintsugi','Dark ceramic repaired with bright gold seams.','rare'],
 ['coral','Coral Kingdom','coral','Branching coral in a translucent sea-glass shell.','rare'],
 ['topaz','Gemcut','gemcut','A cut gemstone body held in a sculpted setting.','rare'],
 ['neon','Night District','neon','Obsidian armor edged in glowing faction light.','rare'],
 ['sakura','Sakura','sakura','A pale lacquer body with painted blossom clusters.','rare'],
 ['serpent','Serpentine','scales','Overlapping enamel scales and a jeweled collar.','rare'],
 ['cathedral','Cathedral','cathedral','Gothic stone arches filled with stained glass.','epic'],
 ['dragonbone','Dragonbone','dragonbone','Ivory spines and dark scales around a living core.','epic'],
 ['void','Voidkeeper','void','A dark shell with fractured windows into another sky.','epic'],
 ['clockwork','Clockwork','clockwork','Exposed brass gears beneath an enamel chassis.','epic'],
 ['peacock','Peacock','peacock','Jewel-toned feathers set into an ornate shell.','epic'],
 ['tapestry','Tapestry','tapestry','A royal coat of arms woven into faction cloth.','epic']
]
export const ITEMS:Collectible[]=[...icons.map((x,i)=>({id:'icon-'+x[0],type:'icon' as const,name:x[1],motif:x[2],description:x[3],rarity:levels[i],price:prices[RARITIES.indexOf(levels[i])]})),...skins.map((x,i)=>({id:'skin-'+x[0],type:'skin' as const,name:x[1],motif:x[2],description:x[3],rarity:levels[i],price:prices[RARITIES.indexOf(levels[i])]})),...extraSkins.map(([id,name,motif,description,rarity])=>({id:'skin-'+id,type:'skin' as const,name,motif,description,rarity,price:prices[RARITIES.indexOf(rarity)]}))]
const itemIndex=new Map(ITEMS.map(item=>[item.id,item]))
export const itemById=(id:string)=>itemIndex.get(id)
export const DEFAULT_ICON='default'
export interface OwnedItem {uid:string;itemId:string;acquired:number;pending:boolean;listed?:string}
export interface Loadout {icon:string;pieces:Partial<Record<Kind,string>>}
export const STARTER_COINS=480
export const PAID_SPIN_PRICE=200
export interface Wallet {starterGranted?:boolean;coins:number;inventory:OwnedItem[];loadout:Loadout;lastSpin?:string}
export interface Listing {id:string;seller:string;uid:string;itemId:string;price:number;created:number}
export interface Drop {id:string;source:'spin'|'crate';paid?:boolean;coins?:number;uid?:string;itemId?:string;duplicate?:boolean;refund?:number;segment?:number;created:number}
export const CRATES=[{id:'icon-bronze',type:'icon',tier:0,name:'Bronze icon crate',price:120},{id:'icon-silver',type:'icon',tier:1,name:'Silver icon crate',price:450},{id:'icon-gold',type:'icon',tier:2,name:'Gold icon crate',price:1200},{id:'skin-bronze',type:'skin',tier:0,name:'Bronze skin crate',price:160},{id:'skin-silver',type:'skin',tier:1,name:'Silver skin crate',price:600},{id:'skin-gold',type:'skin',tier:2,name:'Gold skin crate',price:1600}] as const
// Integer weights total 1,000,000. Within a rarity every item is equally likely.
export const CRATE_ODDS:readonly (readonly number[])[]=[[699000,240000,55000,5900,99,1],[250000,400000,270000,74000,5900,100],[50000,180000,420000,300000,49000,1000]]
export const SPIN_REWARDS=[{label:'40',coins:40,weight:410000},{label:'80',coins:80,weight:300000},{label:'150',coins:150,weight:160000},{label:'300',coins:300,weight:80000},{label:'1,000',coins:1000,weight:35000},{label:'Rare item',rarity:'rare' as Rarity,weight:12000},{label:'Legendary',rarity:'legendary' as Rarity,weight:2900},{label:'Mythic',rarity:'mythic' as Rarity,weight:100}]
export const duplicateRefund=(item:Collectible)=>Math.max(10,Math.floor(item.price*.12))
export const percent=(weight:number)=>`${weight/10000}%`
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'})
export function dayKey(now=Date.now()){const parts=formatter.formatToParts(now);return ['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-')}
export function midnight(date:string){let lo=Date.parse(date+'T00:00:00Z')-10800000,hi=lo+21600000;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(dayKey(mid)<date)lo=mid+1;else hi=mid}return lo}
export function nextReset(now=Date.now()){const date=new Date(dayKey(now)+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);return midnight(date.toISOString().slice(0,10))}
export function weekKey(now=Date.now()){const d=new Date(dayKey(now)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)}
export function nextWeek(now=Date.now()){const d=new Date(weekKey(now)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7);return midnight(d.toISOString().slice(0,10))}
export function weeklyItems(now=Date.now()){
 let seed=Number(weekKey(now).replaceAll('-',''))
 const shuffled=[...ITEMS.filter(i=>i.rarity!=='mythic')].sort((a,b)=>a.id.localeCompare(b.id))
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
 // Two premium features plus two accessible items of each type.
 return (['skin','icon'] as const).flatMap(type=>[...shuffled.filter(i=>i.type===type&&['epic','legendary'].includes(i.rarity)).slice(0,2),...shuffled.filter(i=>i.type===type&&!['epic','legendary'].includes(i.rarity)).slice(0,2)])
}
