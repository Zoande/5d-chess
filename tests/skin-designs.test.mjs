import test from 'node:test'
import assert from 'node:assert/strict'
import {ITEMS} from '../src/collection.ts'
import {designFor} from '../src/skin-designs.ts'
import {pieceVectors,pieceIcon} from '../src/art.ts'
import {KINDS,PLAYERS} from '../src/model.ts'
test('all fifty skins have complete, distinct filled designs and four faction variants for every piece',()=>{
 const skins=ITEMS.filter(i=>i.type==='skin'),designs=new Set()
 for(const item of skins){const design=designFor(item);assert.ok(design,item.id);assert.ok(design.inlays.some(l=>l.fill),item.id);designs.add(JSON.stringify(design))
 for(const kind of KINDS){const colors=new Set();for(const player of PLAYERS){const vector=pieceVectors(kind,player,item.id);assert.ok(vector.layers.length>=4);assert.ok(vector.shape);colors.add(JSON.stringify(vector));const svg=pieceIcon(kind,player,64,item.id);assert.ok(!svg.includes('undefined'));assert.ok(!svg.includes('NaN'))}assert.equal(colors.size,4,item.id+' '+kind)}}
 assert.equal(designs.size,50)
 assert.ok(new Set(skins.map(i=>pieceVectors('N','red',i.id).shape)).size>=3)
})
