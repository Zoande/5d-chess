import test from 'node:test'
import assert from 'node:assert/strict'
import {initialState,index,frontier,present,boardTurn,activation,players} from '../src/model.ts'
import {legalMoves} from '../src/moves.ts'
import {resolveRound,sourceBudget} from '../src/resolve.ts'
import {requiredBoards} from '../src/rules.ts'
import {layoutOf,squarePoint} from '../src/geometry.ts'
const c=(x,y,t=0,u=0)=>({x,y,t,u})
const man=(player,kind)=>({player,kind,moved:true})
function setup(pieces,mode='live',count=2) {
 const s=initialState(count,mode),cells=Array(196).fill(null)
 for(const [x,y,p,k] of pieces)cells[index(c(x,y))]=man(p,k)
 return {...s,universes:[{...s.universes[0],boards:[{...s.universes[0].boards[0],cells}]}]}
}
const move=(s,from,to)=>{const m=legalMoves(s,from,to)[0];assert.ok(m,JSON.stringify({from,to}));return m}
const preview=(s,orders)=>resolveRound(s,orders,{partial:true})

test('Classic enforces its persisted player order, board owners, and Present obligations',()=>{
 let s=initialState(2,'classic',['yellow','red'])
 assert.equal(s.turn,'yellow');assert.equal(boardTurn(s,s.universes[0]),'yellow')
 assert.equal(requiredBoards(s,'red').length,0)
 assert.equal(resolveRound(s,[]).state,s)
 const wrong=move(s,c(4,10),c(5,8))
 assert.ok(resolveRound(s,[wrong]).rejected.length)
 const yellow=move(s,c(4,3),c(5,5))
 const result=resolveRound(s,[yellow]);assert.equal(result.rejected.length,0)
 s=result.state;assert.equal(s.turn,'red');assert.equal(boardTurn(s,s.universes[0]),'red');assert.equal(present(s),1)
})

test('Live catches a bishop with an instant knight block; both disappear',()=>{
 const s=setup([[3,3,'yellow','B'],[8,8,'red','K'],[4,7,'red','N'],[10,3,'yellow','K']])
 const attack=move(s,c(3,3),c(8,8)),block=move(s,c(4,7),c(5,5))
 const r=resolveRound(s,[attack,block])
 assert.equal(r.rejected.length,0)
 assert.equal(r.outcomes.filter(o=>o.status==='collided').length,2)
 assert.ok(!r.eliminated.includes('red'))
 assert.equal(frontier(r.state.universes[0]).cells[index(c(5,5))],null)
 assert.equal(frontier(r.state.universes[0]).cells[index(c(8,8))].kind,'K')
 assert.ok(r.travel.some(t=>t.piece.kind==='B'&&t.collision&&t.endTick>0))
})

test('faster pieces cross and collide between ticks, and traces use the displayed geometry',()=>{
 const s=setup([[3,5,'red','R'],[6,5,'yellow','R'],[10,10,'red','K'],[10,3,'yellow','K']])
 const r=resolveRound(s,[move(s,c(3,5),c(6,5)),move(s,c(6,5),c(3,5))])
 assert.ok(r.travel.every(t=>t.collision&&t.endTick>0&&t.endTick<1))
 const layout=layoutOf(r.state)
 for(const trace of r.travel) {
   const end=squarePoint(r.state,trace.to,layout)
   assert.deepEqual({x:trace.points.at(-1).x,y:trace.points.at(-1).y},end)
   assert.ok(Number.isFinite(trace.endTick))
 }
})

test('shared branches merge historical destinations, retain all owners, and pull Present backward',()=>{
 const base=setup([[7,7,'red','R'],[8,7,'yellow','R'],[10,10,'red','K'],[10,3,'yellow','K']])
 const now={...base.universes[0].boards[0],t:3,cells:[...base.universes[0].boards[0].cells]}
 const old={...now,t:0,cells:now.cells.map((p,i)=>i===index(c(7,7))||i===index(c(8,7))?null:p)}
 const s={...base,round:4,universes:[{...base.universes[0],boards:[old,{...old,t:1},{...old,t:2},now]}]}
 const r=resolveRound(s,[move(s,c(7,7,3),c(7,7,0)),move(s,c(8,7,3),c(8,7,0))])
 assert.equal(r.rejected.length,0)
 assert.equal(r.state.universes.length,2)
 assert.deepEqual(r.state.universes[1].owners,['red','yellow'])
 assert.equal(r.outcomes[0].branch,r.outcomes[1].branch)
 assert.equal(present(r.state),1)
 const owned=activation(r.state.universes,['red'],2)
 assert.equal(owned[1].active,true)
})

test('unplayed Classic boards retain their owner and pin the Present',()=>{
 const s=initialState(2,'classic',['red','yellow'])
 const extra={...s.universes[0],id:1,parent:0,creator:'yellow',boards:[{...s.universes[0].boards[0],t:0,turn:'yellow'}]}
 const multiverse={...s,universes:[s.universes[0],extra]}
 const r=resolveRound(multiverse,[move(multiverse,c(4,10),c(5,8))])
 assert.equal(frontier(r.state.universes[1]).t,0)
 assert.equal(boardTurn(r.state,r.state.universes[1]),'yellow')
 assert.equal(present(r.state),0)
 assert.equal(r.state.turn,'yellow')
})

test('three arrivals share one past branch: the first two collide, the later third survives',()=>{
 const base=setup([[3,0,'red','K'],[4,0,'blue','K'],[5,0,'yellow','K']],'live',3)
 const old=base.universes[0].boards[0]
 const root={...base.universes[0],boards:[old,{...old,t:1},{...old,t:2}]}
 const sources=players(base).map((player,i)=>{
   const cells=Array(196).fill(null);cells[index(c(7,7))]=man(player,'Q')
   return {...root,id:i+1,parent:0,creator:player,boards:[{t:1,cells,enPassant:[]}]}
 })
 const s={...base,universes:[root,...sources]}
 const orders=sources.map(u=>move(s,c(7,7,1,u.id),c(7,7,0)))
 const r=preview(s,orders)
 assert.equal(r.state.universes.length,5)
 const branch=r.state.universes.at(-1)
 assert.deepEqual(branch.owners,['red','blue','yellow'])
 assert.equal(r.outcomes.filter(o=>o.status==='collided').length,2)
 assert.equal(frontier(branch).cells[index(c(7,7))]?.player,'red')
})
