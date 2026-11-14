import {EXPANSION_ITEMS} from './collection-expansion.ts'
import {KINDS,type Kind} from './model.ts'
export const RARITIES=['common','uncommon','rare','epic','legendary','mythic'] as const
export type Rarity=typeof RARITIES[number]
export type ItemType='icon'|'skin'|'frame'|'shape'
export const RARITY_COLORS:Record<Rarity,string>={common:'#aeb6bd',uncommon:'#8dbb7b',rare:'#6daaf0',epic:'#b587e8',legendary:'#e8b65a',mythic:'#ed88b7'}
export interface Collectible {id:string;type:ItemType;name:string;rarity:Rarity;motif:string;description:string;price:number;monthly?:'solar'|'lunar';exclusive?:boolean}
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
ITEMS.push(...EXPANSION_ITEMS,
 {id:'skin-etc',type:'skin',name:'Eternal Court',rarity:'mythic',motif:'eternal',description:'Black opal armor, interlocked gold infinity seams and a radiant faction core.',price:48000,exclusive:true},
 {id:'shape-etc',type:'shape',name:'Eternal Crown',rarity:'mythic',motif:'eternal',description:'Split architectural crowns, floating shoulders and double-cut ceremonial bases.',price:37000,exclusive:true})
export const GENERAL_ITEMS=ITEMS.filter(i=>!i.monthly&&!i.exclusive)
export const ITEM_LABELS:Record<ItemType,string>={icon:'Player icon',skin:'Piece skin',frame:'Icon frame',shape:'Piece outline'}
const itemIndex=new Map(ITEMS.map(item=>[item.id,item]))
export const itemById=(id:string)=>itemIndex.get(id)
export const DEFAULT_ICON='default'
export interface OwnedItem {kind?:Kind;uid:string;itemId:string;acquired:number;pending:boolean;listed?:string}
export interface Loadout {icon:string;frame?:string;shape?:string;shapes?:Partial<Record<Kind,string>>;pieces:Partial<Record<Kind,string>>}
export const STARTER_COINS=480
export const PAID_SPIN_PRICE=300
export interface Wallet {cases?:{uid:string;caseId:string;acquired:number}[];starterGranted?:boolean;coins:number;inventory:OwnedItem[];loadout:Loadout;lastSpin?:string;shopSeen?:boolean}
export const MARKET_DESCRIPTION_LIMIT=240
export interface Listing {kind?:Kind;setId?:string;uids?:string[];description?:string;id:string;seller:string;uid:string;itemId:string;price:number;created:number}
export interface Drop {caseId?:string;caseUid?:string;wheel?:SpinReward[];kind?:Kind;setId?:string;items?:{uid:string;itemId:string;kind?:Kind}[];id:string;source:'spin'|'crate';paid?:boolean;coins?:number;uid?:string;itemId?:string;duplicate?:boolean;refund?:number;segment?:number;created:number}
export interface Crate {weight?:number;permanent?:boolean;setChance?:number;id:string;type:ItemType|'mixed';tier:0|1|2;name:string;price:number;monthly?:'solar'|'lunar'|'exclusive';styles?:[string,string]}
export const CASES:Crate[]=[
 {id:'icon-bronze',type:'icon',tier:0,name:'Scout Case',price:120,permanent:true},
 {id:'skin-bronze',type:'skin',tier:0,name:'Artisan Case',price:160,permanent:true},
 {id:'outline-basic',type:'shape',tier:0,name:'Workshop Case',price:160,permanent:true},
 {id:'icon-silver',type:'icon',tier:1,name:'Herald Case',price:450,weight:100},
 {id:'icon-gold',type:'icon',tier:2,name:'Sovereign Case',price:1200,weight:25},
 {id:'skin-silver',type:'skin',tier:1,name:'Atelier Case',price:600,weight:100,setChance:5000},
 {id:'skin-gold',type:'skin',tier:2,name:'Heirloom Case',price:1600,weight:25,setChance:20000},
 {id:'frame-orbit',type:'frame',tier:1,name:'Orbit Case',price:350,weight:100},
 {id:'frame-aureole',type:'frame',tier:2,name:'Aureole Case',price:950,weight:30},
 {id:'shape-workshop',type:'shape',tier:1,name:'Sculptor Case',price:400,weight:100},
 {id:'shape-masterwork',type:'shape',tier:2,name:'Masterwork Case',price:1100,weight:25,setChance:10000},
 {id:'mixed-vault',type:'mixed',tier:1,name:'Multiverse Case',price:420,weight:100,setChance:5000},
 {id:'mixed-prismatic',type:'mixed',tier:2,name:'Prismatic Case',price:1800,weight:20,setChance:25000},
 {id:'skin-collector',type:'skin',tier:1,name:'Collector Case',price:900,weight:50,setChance:40000},
 {id:'mixed-relic',type:'mixed',tier:2,name:'Relic Case',price:2400,weight:10,setChance:50000},
 {id:'sets-regalia',type:'skin',tier:1,name:'Regalia Set Case',price:6000,weight:100,setChance:1000000},
 {id:'sets-grandmaster',type:'mixed',tier:2,name:'Grandmaster Set Case',price:16000,weight:10,setChance:1000000},
 {id:'sets-silhouette',type:'shape',tier:2,name:'Silhouette Set Case',price:9500,weight:40,setChance:1000000},
 {id:'monthly-solar',type:'mixed',tier:1,name:'Solar Observatory Case',price:500,monthly:'solar',setChance:10000,styles:['Sunstone','Obsidian']},
 {id:'monthly-lunar',type:'mixed',tier:1,name:'Lunar Sanctuary Case',price:500,monthly:'lunar',setChance:10000,styles:['Moonstone','Midnight']},
 {id:'monthly-eclipse',type:'mixed',tier:2,name:'Eclipse Reliquary Case',price:1800,monthly:'exclusive',setChance:35000,styles:['Totality','Afterglow']}
]
/** Legacy IDs and code aliases remain readable for old receipts and clients. */
export const CRATES=CASES
export type Case=Crate
export interface CosmeticSet {id:string;name:string;skinId?:string;outlineId?:string;itemId:string;price:number;exclusive?:boolean}
export const SETS:CosmeticSet[]=ITEMS.filter(i=>i.type==='skin').map(i=>({id:'set-'+i.id,name:i.name+' Set',skinId:i.id,itemId:i.id,outlineId:i.id==='skin-etc'?'shape-etc':i.monthly==='solar'?(RARITIES.indexOf(i.rarity)<=2?'shape-sun-temple':RARITIES.indexOf(i.rarity)<=3?'shape-phoenix-court':'shape-coronal'):i.monthly==='lunar'?(RARITIES.indexOf(i.rarity)<=2?'shape-crescent':'shape-observatory'):undefined,price:i.id==='skin-etc'?85000:i.price*6,exclusive:i.exclusive}))
SETS.push(...ITEMS.filter(i=>i.type==='shape'&&!i.exclusive).map(i=>({id:'set-'+i.id,name:i.name+' Outline Set',outlineId:i.id,itemId:i.id,price:i.price*6})))
for(const set of SETS)if(set.skinId&&set.outlineId&&!set.exclusive)set.price=(itemById(set.skinId)!.price+itemById(set.outlineId)!.price)*6
export const setById=(id:string)=>SETS.find(s=>s.id===id)
export const covers=(owned:OwnedItem,itemId:string,kind?:Kind)=>owned.itemId===itemId&&(!kind||!owned.kind||owned.kind===kind)
export function setRequirements(set:CosmeticSet){return [set.skinId,set.outlineId].filter((id):id is string=>!!id).flatMap(itemId=>KINDS.map(kind=>({itemId,kind})))}
export function planSet(inventory:OwnedItem[],set:CosmeticSet){
 const available=inventory.filter(o=>!o.pending&&!o.listed),members=setRequirements(set).map(r=>available.find(o=>o.kind===r.kind&&covers(o,r.itemId,r.kind))??available.find(o=>covers(o,r.itemId,r.kind)))
 return {complete:members.every(Boolean),collected:members.filter(Boolean).length,total:members.length,uids:[...new Set(members.filter((o):o is OwnedItem=>!!o).map(o=>o.uid))]}
}
function seeded(key:string){let seed=2166136261;for(const c of key)seed=Math.imul(seed^c.charCodeAt(0),16777619);return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
export function weeklyCases(now=Date.now()){
 const random=seeded('cases:'+weekKey(now)),selected:Crate[]=[]
 const slots=[(c:Crate)=>c.type==='icon',(c:Crate)=>c.type==='skin'&&c.setChance!==1000000,(c:Crate)=>c.type==='shape'&&c.setChance!==1000000,(c:Crate)=>c.type==='mixed'&&c.setChance!==1000000,(c:Crate)=>c.type==='frame',(c:Crate)=>c.setChance===1000000]
 for(const slot of slots){const pool=CASES.filter(c=>!c.monthly&&!c.permanent&&!selected.includes(c)&&slot(c));let n=random()*pool.reduce((sum,c)=>sum+(c.weight??100),0);selected.push(pool.find(c=>(n-=c.weight??100)<0)??pool.at(-1)!)}
 return selected
}
export function caseOffers(now=Date.now()){
 const weekly=weeklyCases(now),pool=CASES.filter(c=>!c.monthly&&!c.permanent&&!weekly.includes(c)),random=seeded('daily-case:'+dayKey(now));let n=random()*pool.reduce((sum,c)=>sum+(c.weight??100),0);const daily=pool.find(c=>(n-=c.weight??100)<0)??pool[0]
 return [...CASES.filter(c=>c.permanent).map(c=>({id:c.id,price:c.price,window:'permanent',key:'permanent'})),...weekly.map(c=>({id:c.id,price:c.price,window:'weekly',key:weekKey(now)})),{id:daily.id,price:Math.floor(daily.price*.85),window:'daily',key:dayKey(now)},...CASES.filter(c=>c.monthly).map(c=>({id:c.id,price:c.price,window:'seasonal',key:monthKey(now)}))]
}
export function seasonalItems(now=Date.now()){const random=seeded('season:'+monthKey(now)),types:ItemType[]=['skin','shape','icon'];return types.map(type=>{const pool=ITEMS.filter(i=>i.monthly&&i.type===type);return pool[Math.floor(random()*pool.length)]})}
// Integer weights total 1,000,000. Within a rarity every item is equally likely.
export const CRATE_ODDS:readonly (readonly number[])[]=[[699000,240000,55000,5900,99,1],[250000,400000,270000,74000,5900,100],[50000,180000,420000,300000,49000,1000]]
export interface SpinReward {label:string;weight:number;visualWeight:number;cadence:'fixed'|'daily'|'weekly'|'seasonal';coins?:number;rarity?:Rarity;itemId?:string;caseId?:string;setId?:string}
export function spinRewards(now=Date.now()):SpinReward[]{
 const fixed:Omit<SpinReward,'cadence'>[]=[
  {label:'25',coins:25,weight:230000,visualWeight:15},{label:'50',coins:50,weight:180000,visualWeight:14},{label:'75',coins:75,weight:110000,visualWeight:13},{label:'100',coins:100,weight:85000,visualWeight:12},{label:'150',coins:150,weight:50000,visualWeight:11},{label:'250',coins:250,weight:30000,visualWeight:10},{label:'400',coins:400,weight:15000,visualWeight:9},
  {label:'Artisan Case',caseId:'skin-bronze',weight:40000,visualWeight:10},{label:'Common piece',rarity:'common',weight:50000,visualWeight:11},{label:'Rare find',rarity:'rare',weight:10000,visualWeight:8}]
 const make=(cadence:SpinReward['cadence'],key:string,pool:Collectible[],budget:number):SpinReward[]=>{
  const random=seeded(key),shuffled=[...pool];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
  const chosen=(['uncommon','rare','epic','legendary','mythic'] as Rarity[]).map(r=>shuffled.find(i=>i.rarity===r)!),raw=[7000,2400,550,49,1],weights=raw.map(w=>Math.floor(w/10000*budget));weights[0]+=budget-weights.reduce((s,w)=>s+w,0)
  return chosen.map((item,i)=>({label:item.name,itemId:item.id,rarity:item.rarity,weight:weights[i],visualWeight:[10,9,7,5,4][i],cadence}))
 }
 const daily=make('daily','wheel-day:'+dayKey(now),GENERAL_ITEMS,100000),weekly=make('weekly','wheel-week:'+weekKey(now),GENERAL_ITEMS,60000),seasonal=make('seasonal','wheel-month:'+monthKey(now),ITEMS.filter(i=>i.monthly),40000)
 daily[0]={label:caseOffers(now).find(o=>o.window==='daily')!.id.replaceAll('-',' ')+' case',caseId:caseOffers(now).find(o=>o.window==='daily')!.id,weight:daily[0].weight,visualWeight:10,cadence:'daily'}
 weekly[0]={label:weeklyCases(now)[0].name,caseId:weeklyCases(now)[0].id,weight:weekly[0].weight,visualWeight:10,cadence:'weekly'}
 // Expensive rotating cases get proportionately smaller chances. Keep each
 // rotating group at its stated total by moving the remainder to its rare item.
 for(const [group,budget] of [[daily,25],[weekly,15]] as [SpinReward[],number][]){const slot=group[0],price=CASES.find(c=>c.id===slot.caseId)!.price,weight=Math.min(slot.weight,Math.max(1,Math.floor(budget/price*1000000)));group[1].weight+=slot.weight-weight;slot.weight=weight}
 // The final seasonal slot is a complete mythic collection, not a single piece.
 const mythics=ITEMS.filter(i=>i.monthly&&i.type==='skin'&&i.rarity==='mythic');seasonal[4].itemId=mythics[Math.floor(seeded('wheel-mythic:'+monthKey(now))()*mythics.length)].id;seasonal[4].setId='set-'+seasonal[4].itemId;seasonal[4].label='Seasonal mythic Set'
 if(!setById(seasonal[4].setId!)){seasonal[4].setId=undefined;seasonal[4].label=itemById(seasonal[4].itemId!)!.name}
 return [...fixed.map(r=>({...r,cadence:'fixed' as const})),...daily,...weekly,...seasonal]
}
export function wheelArcs(rewards:readonly SpinReward[]){let angle=0;const total=rewards.reduce((s,r)=>s+r.visualWeight,0);return rewards.map(r=>{const start=angle;angle+=r.visualWeight/total*360;return {start,end:angle,mid:(start+angle)/2}})}

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
 const shuffled=[...GENERAL_ITEMS.filter(i=>i.rarity!=='mythic')].sort((a,b)=>a.id.localeCompare(b.id))
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
 // A premium and an accessible find of every type, then interleave the edit.
 return (['skin','icon','frame','shape'] as const).map(type=>shuffled.find(i=>i.type===type&&['rare','epic','legendary'].includes(i.rarity))!)
}

/** Four deterministic offers per Amsterdam day, including a guaranteed animated frame. */
export function dailyDeals(now=Date.now()){
 let seed=Number(dayKey(now).replaceAll('-',''))^0x5dce55
 const weekly=new Set(weeklyItems(now).map(i=>i.id))
 const pool=GENERAL_ITEMS.filter(i=>i.rarity!=='mythic'&&!weekly.has(i.id)).sort((a,b)=>a.id.localeCompare(b.id))
 for(let i=pool.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[pool[i],pool[j]]=[pool[j],pool[i]]}
 const skin=pool.find(i=>i.type==='skin')!,avatar=pool.find(i=>i.type==='icon')!,frame=pool.find(i=>i.type==='frame')!
 return [skin,avatar,pool.find(i=>i!==skin&&i!==avatar&&i!==frame)!,frame].map(i=>({itemId:i.id,price:Math.floor(i.price*.75),originalPrice:i.price}))
}

export const monthKey=(now=Date.now())=>dayKey(now).slice(0,7)
export function nextMonth(now=Date.now()){const d=new Date(monthKey(now)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);return midnight(d.toISOString().slice(0,10))}
/** Explicit per-item integer tickets shared by the server draw and the displayed odds. */
export interface CaseTicket {item:Collectible;weight:number;setId?:string}
function apportion(rows:{item:Collectible;raw:number;setId?:string}[],total:number):CaseTicket[]{
 if(!total||!rows.length)return []
 const sum=rows.reduce((n,r)=>n+r.raw,0),out=rows.map(r=>({item:r.item,setId:r.setId,weight:Math.floor(r.raw/sum*total)})),fractions=rows.map((r,i)=>({i,f:r.raw/sum*total-out[i].weight})).sort((a,b)=>b.f-a.f||a.i-b.i)
 for(let i=0,left=total-out.reduce((n,r)=>n+r.weight,0);i<left;i++)out[fractions[i].i].weight++
 return out.filter(r=>r.weight>0)
}
export function crateTickets(crate:Crate):CaseTicket[]{
 const monthly=crate.monthly,pool=monthly==='exclusive'?ITEMS.filter(i=>i.monthly):monthly?ITEMS.filter(i=>!i.exclusive&&(!i.monthly||i.monthly===monthly)):GENERAL_ITEMS.filter(i=>crate.type==='mixed'||i.type===crate.type),weights=CRATE_ODDS[crate.tier]
 const raw=(items:Collectible[])=>items.map(item=>{const rarity=items.filter(i=>i.rarity===item.rarity),same=rarity.filter(i=>!!i.monthly===!!item.monthly),group=monthly&&monthly!=='exclusive'&&rarity.some(i=>i.monthly)&&rarity.some(i=>!i.monthly)?item.monthly?.65:.35:1;return {item,raw:weights[RARITIES.indexOf(item.rarity)]*group/same.length}})
 const sets=SETS.filter(s=>!s.exclusive&&pool.some(i=>i.id===s.itemId)),setRows=raw(sets.map(s=>itemById(s.itemId)!)).map(r=>({...r,setId:sets.find(s=>s.itemId===r.item.id)!.id})),chance=setRows.length?crate.setChance??0:0
 return [...apportion(raw(pool),1000000-chance),...apportion(setRows,chance)]
}
export const caseTickets=crateTickets

export const SPIN_REWARDS=spinRewards()

export const LEGACY_SPIN_REWARDS:SpinReward[]=[{label:'40',coins:40,weight:410000},{label:'80',coins:80,weight:300000},{label:'150',coins:150,weight:160000},{label:'300',coins:300,weight:80000},{label:'1,000',coins:1000,weight:35000},{label:'Rare item',rarity:'rare' as Rarity,weight:12000},{label:'Legendary',rarity:'legendary' as Rarity,weight:2900},{label:'Mythic',rarity:'mythic' as Rarity,weight:100}].map(r=>({...r,cadence:'fixed',visualWeight:1}))
