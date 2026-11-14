import {shapePath} from './shape-designs.ts'
import {itemById,type Loadout} from './collection.ts'
import {designFor,pigments,alternateShapes,type Inlay} from './skin-designs.ts'
import {type Kind, type Player} from './model.ts'

export const COLORS: Record<Player, string> = {red: '#df9187', blue: '#91bad5', yellow: '#f3d58d', green: '#a5c69a'}
export const NAMES: Record<Kind, string> = {K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn'}

const silhouette: Record<Kind, string> = {
  P: 'M12 4.4a3.35 3.35 0 0 1 1.65 6.26c.35 2.83 1.46 4.6 3.68 6.35l.75 2.4H5.92l.75-2.4c2.22-1.75 3.33-3.52 3.68-6.35A3.35 3.35 0 0 1 12 4.4Z',
  R: 'M5.1 5h3.2v3h2V5h3.4v3h2V5h3.2v5.25l-2.7 2.2.7 4.1 1.95 2.85H5.15l1.95-2.85.7-4.1-2.7-2.2Z',
  N: 'M6 19.4h13l-.45-2.5c.08-4.92-1.6-9.2-5.92-11.72l-.87-2.04-1.65 2.15L6 8.1l-1.85 3.55 2.32 1.05 3.16-1.65-.22 1.73-2.96 3.99Z',
  B: 'M12 4.4c1.2 1.7 4.65 3.45 4.65 6.3a4.65 4.65 0 0 1-3.02 4.35l2.83 2.05 1.5 2.3H6.04l1.5-2.3 2.83-2.05A4.65 4.65 0 0 1 7.35 10.7c0-2.85 3.45-4.6 4.65-6.3Z M11 3.6a1 1 0 1 0 2 0 1 1 0 1 0-2 0Z',
  Q: 'M4.4 7.5 8.7 11l.15-5.05L12 10l3.15-4.05.15 5.05 4.3-3.5-2.65 9.25 1.35 2.65H5.7l1.35-2.65Z M3.2 5.9a1.12 1.12 0 1 0 2.24 0 1.12 1.12 0 1 0-2.24 0Zm4.65-1.45a1.05 1.05 0 1 0 2.1 0 1.05 1.05 0 1 0-2.1 0Zm6.2 0a1.05 1.05 0 1 0 2.1 0 1.05 1.05 0 1 0-2.1 0Zm4.51 1.45a1.12 1.12 0 1 0 2.24 0 1.12 1.12 0 1 0-2.24 0Z',
  K: 'M12 9.6c-1.27-2.42-4.6-2.93-6.37-.91-1.7 1.95-.33 4.7 1.44 7.35l-.83 3.36h11.52l-.83-3.36c1.77-2.65 3.14-5.4 1.44-7.35C16.6 6.67 13.27 7.18 12 9.6Z M11.25 2.6h1.5v2.1h2.1v1.45h-2.1v2.3h-1.5v-2.3h-2.1V4.7h2.1Z'
}
const detail: Record<Kind, string> = {
  P: 'M8 16.9h8', R: 'M7.6 12.05h8.8m-9.6 4.8h10.4', N: 'M7.4 17h10.2m-7.3-8.7.35-.24',
  B: 'M13.8 8.2l-2.7 3.1m-2.4 5.4h6.6', Q: 'M7.2 16.6h9.6m-8.7-2.1h7.8', K: 'M7.4 16.2h9.2M12 10v3.7'
}
const pathCache=new Map<string,Path2D>()
const path=(d:string)=>{let p=pathCache.get(d);if(!p){p=new Path2D(d);pathCache.set(d,p)}return p}
let loadouts:Partial<Record<Player,Loadout>>={}
export function setCosmetics(next:Partial<Record<Player,Loadout>>){loadouts=next}
export const equippedEffect=(player:Player,type:'movement'|'capture')=>loadouts[player]?.[type]??'default'
interface PieceVector {shape:string;base:string;rim:string;detail:string;layers:{d:string;fill?:string;stroke?:string;width:number;opacity:number}[]}
const vectorCache=new Map<string,PieceVector>()
/** One vector recipe drives both the board canvas and every collection preview. */
export function pieceVectors(kind:Kind,player:Player,skinId?:string,shapeId?:string):PieceVector{
 const skin=itemById(skinId??loadouts[player]?.pieces[kind]??''),design=designFor(skin),shapeItem=itemById(shapeId??(skinId===undefined?loadouts[player]?.shapes?.[kind]??loadouts[player]?.shape:undefined)??''),customShape=shapeItem?.type==='shape'?shapePath(shapeItem.motif,kind):undefined,key=`${kind}:${player}:${skin?.id??'default'}:${shapeItem?.id??'default'}`
 const cached=vectorCache.get(key);if(cached)return cached
 if(!design)return {shape:customShape??silhouette[kind],base:COLORS[player],rim:'#33271e',detail:'#33271e',layers:[] as {d:string;fill?:string;stroke?:string;width:number;opacity:number}[]}
 const colors=pigments(COLORS[player],design)
 const facets:Inlay[]=[{d:'M0 0h7L9 24H0Z',fill:'light',opacity:.18},{d:'M19 0h5v24h-7Z',fill:'ink',opacity:.18}]
 const vector:PieceVector={shape:customShape??(design.family==='classic'?silhouette[kind]:alternateShapes[design.family][kind]),base:colors.body,rim:design.material==='dark'?colors.faction:['legendary','mythic'].includes(skin!.rarity)?colors.gold:colors.shade,detail:design.material==='dark'?colors.ivory:colors.ink,layers:[...facets,...design.inlays].map(l=>({d:l.d,fill:l.fill?colors[l.fill]:undefined,stroke:l.stroke?colors[l.stroke]:undefined,width:l.width??.4,opacity:l.opacity??1}))}
 vectorCache.set(key,vector);return vector
}
export function drawPiece(ctx: CanvasRenderingContext2D, kind: Kind, player: Player, x: number, y: number, size: number) {
 const vector=pieceVectors(kind,player),shape=path(vector.shape)
 ctx.save();ctx.translate(x-size/2,y-size/2);ctx.scale(size/24,size/24);ctx.lineJoin='round';ctx.lineCap='round'
 ctx.strokeStyle='#29251e';ctx.lineWidth=1.65;ctx.stroke(shape);ctx.fillStyle=vector.base;ctx.fill(shape)
 ctx.save();ctx.clip(shape)
 for(const layer of vector.layers){ctx.globalAlpha=layer.opacity;if(layer.fill){ctx.fillStyle=layer.fill;ctx.fill(path(layer.d))}if(layer.stroke){ctx.strokeStyle=layer.stroke;ctx.lineWidth=layer.width;ctx.stroke(path(layer.d))}}
 ctx.restore();ctx.lineWidth=.55;ctx.strokeStyle=vector.rim;ctx.stroke(shape)
 ctx.lineWidth=.7;ctx.strokeStyle=vector.detail;ctx.stroke(path(detail[kind]));ctx.restore()
}
let svgId=0
export function pieceIcon(kind: Kind, player: Player, size = 24, skinId?:string,shapeId?:string) {
 const v=pieceVectors(kind,player,skinId,shapeId),id=`piece-${++svgId}`
 const layers=v.layers.map(l=>`<path d="${l.d}" fill="${l.fill??'none'}" stroke="${l.stroke??'none'}" stroke-width="${l.width}" opacity="${l.opacity}"/>`).join('')
 return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><defs><clipPath id="${id}"><path d="${v.shape}"/></clipPath></defs><g stroke-linejoin="round" stroke-linecap="round"><path fill="${v.base}" stroke="#29251e" stroke-width=".75" d="${v.shape}"/><g clip-path="url(#${id})">${layers}</g><path d="${v.shape}" fill="none" stroke="${v.rim}" stroke-width=".4"/><path d="${detail[kind]}" fill="none" stroke="${v.detail}" stroke-width=".7"/></g></svg>`
}
export function skinSetIcon(skinId:string,player:Player='red',shapeId?:string){
 return `<span class="skin-set-art"><span>${pieceIcon('K',player,86,skinId,shapeId)}</span><span>${pieceIcon('N',player,104,skinId,shapeId)}</span><span>${pieceIcon('Q',player,86,skinId,shapeId)}</span></span>`
}
