import test from 'node:test'
import assert from 'node:assert/strict'
import {initialState,index} from '../src/model.ts'
import {checks,awareness} from '../src/awareness.ts'
import {legalMoves} from '../src/moves.ts'
const c=(x,y,t=0,u=0)=>({x,y,t,u})
const piece=(player,kind)=>({player,kind,moved:true})
function position(pieces) {
 const s=initialState(2), cells=Array(196).fill(null)
 for (const [x,y,p,k] of pieces) cells[index(c(x,y))]=piece(p,k)
 return {...s,universes:[{...s.universes[0],boards:[{t:0,cells,enPassant:[]}]}]}
}

test('check detects a direct threat, a block and an escaping king',()=>{
 const s=position([[7,10,'red','K'],[7,3,'yellow','R'],[10,3,'yellow','K'],[6,8,'red','R']])
 assert.equal(checks(s,'red').length,1)
 const block=legalMoves(s,c(6,8),c(7,8))[0]
 assert.ok(block)
 assert.equal(awareness(s,'red',[block]).remaining.length,0)
 const escape=legalMoves(s,c(7,10),c(8,10))[0]
 assert.equal(awareness(s,'red',[escape]).remaining.length,0)
 assert.ok(awareness(s,'red',[]).remaining.length)
})

test('time-travel threats include historical kings, without inventing checkmate rules',()=>{
 const s=position([[7,7,'red','K'],[10,3,'yellow','K']])
 const cells=[...s.universes[0].boards[0].cells]
 cells[index(c(7,7))]=piece('yellow','R')
 const future={...s,universes:[{...s.universes[0],boards:[...s.universes[0].boards,{t:1,cells,enPassant:[]}]}]}
 assert.ok(checks(future,'red').some(t=>t.king.t===0 && t.attacker.t===1))
})
