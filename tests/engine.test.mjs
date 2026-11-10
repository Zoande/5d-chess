import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PLAYERS, FORWARD, SQUARES, activation, frontier, getBoard, home, index, initialState, inside,
  moveBudget, offset, pieceAt, present, survivors
} from '../src/model.ts'
import {legalMoves, shortestRoutes} from '../src/moves.ts'
import {resolveRound, sourceBudget} from '../src/resolve.ts'
import {commit, decode, encode, liveState, newSession, planner} from '../src/session.ts'

const c = (x, y, t = 0, u = 0) => ({x, y, t, u})
const man = (player, kind, x, y, moved = false) => ({player, kind, x, y, moved})
function board(t, pieces = [], enPassant = []) {
  const cells = Array(196).fill(null)
  for (const {player, kind, x, y, moved} of pieces) cells[index({x,y})] = {player, kind, moved}
  return {t, cells, enPassant}
}
const timeline = (id, boards, opts = {}) => ({id, parent: id ? 0 : null, divergence: 0,
  creator: id ? 'red' : null, created: id ? 1 : 0, active: true, boards, ...opts})
const state = (universes, opts = {}) => ({round: 4, universes, rifts: [], eliminated: [], ...opts})
const on = (...pieces) => state([timeline(0, [board(0, pieces)])])
const can = (s, from, to) => legalMoves(s, from, to).length > 0
function order(s, from, to, route) {
  const m = legalMoves(s, from, to).find(m => !route || String(m.route) === String(route))
  assert.ok(m, `expected move ${JSON.stringify({from,to,route})}`)
  return m
}
const at = (s, x, y, t, u = 0) => pieceAt(s, c(x, y, t, u))

test('cross geometry and the 64-piece rotated opening', () => {
  assert.equal(SQUARES.length, 160)
  assert.equal(new Set(SQUARES.map(index)).size, 160)
  for (const point of [c(0,0), c(13,0), c(0,13), c(13,13), c(2,2), c(11,11), c(-1,3), c(7.5,7)]) assert.equal(inside(point), false)
  for (const point of [c(3,0), c(0,3), c(10,13), c(13,10)]) assert.equal(inside(point), true)
  const s = initialState()
  assert.equal(frontier(s.universes[0]).cells.filter(Boolean).length, 64)
  for (const p of PLAYERS) {
    const kind = square => pieceAt(s, {...c(0,0), ...square})?.kind
    assert.deepEqual(Array.from({length: 8}, (_, f) => kind(home(p, f))), ['R','N','B','Q','K','B','N','R'])
    for (let f = 0; f < 8; f++) assert.equal(kind(offset(home(p, f), FORWARD[p])), 'P')
  }
})

test('spatial piece patterns and frozen blockers', () => {
  const cases = {
    R: [[c(6,10), c(10,6)], [c(7,7), c(8,7)]],
    B: [[c(9,9), c(4,4)], [c(6,10), c(9,8)]],
    Q: [[c(9,9), c(6,10)], [c(9,8), c(7,9)]],
    N: [[c(7,8), c(8,5)], [c(7,7), c(9,9)]],
    K: [[c(7,7), c(5,6)], [c(8,8), c(6,8)]]
  }
  for (const [kind, [valid, invalid]] of Object.entries(cases)) {
    const s = on(man('red', kind, 6,6))
    for (const to of valid) assert.ok(can(s, c(6,6), to), kind)
    for (const to of invalid) assert.ok(!can(s, c(6,6), to), kind)
  }
  const s = on(man('red','Q',6,6), man('blue','P',7,7), man('red','P',6,7), man('yellow','P',8,8))
  assert.ok(can(s,c(6,6),c(7,7)))
  assert.ok(!can(s,c(6,6),c(8,8)))
  assert.ok(!can(s,c(6,6),c(6,8)))
  assert.ok(!can(s,c(6,6),c(6,7)))
  assert.ok(can(on(man('red','N',6,6),man('red','P',7,7),man('blue','P',6,7)),c(6,6),c(7,8)))
})

test('time and four-axis movement check intermediate boards and exact steps', () => {
  const end = board(2, [man('red','R',6,6), man('red','B',7,6), man('red','N',8,6), man('red','K',9,6), man('red','Q',5,5)])
  const s = state([
    timeline(0,[board(0), board(1, [man('blue','P',6,6)]), end]),
    timeline(1,[board(1),board(2)]),
    timeline(2,[board(1),board(2)], {parent: 1})
  ])
  assert.ok(can(s,c(6,6,2),c(6,6,1)))
  assert.ok(!can(s,c(6,6,2),c(6,6,0)))
  assert.ok(can(s,c(7,6,2),c(6,6,1)))
  assert.ok(can(s,c(8,6,2),c(7,6,0)))
  assert.ok(can(s,c(9,6,2),c(10,7,1,1)))
  assert.ok(can(s,c(5,5,2),c(6,6,1,1)))
  assert.ok(!can(s,c(5,5,2),c(7,7,0,2)), 'destination board is absent')
  assert.ok(can(s,c(6,6,2),c(6,6,2,2)))
})

test('Rifts are delayed, bidirectional, piece-restricted and never chained', () => {
  const timelineWith = (id, parent) => timeline(id, [board(id ? 1 : 0), ...(!id ? [board(1)] : []), board(2, id === 1 ?
    ['Q','B','N','R','K','P'].map((kind, i) => man('red',kind,i + 4,6)) : [])], {parent})
  const s = state([timelineWith(0,null), timelineWith(1,0), timelineWith(2,0), timelineWith(3,0), timelineWith(4,3)], {
    rifts: [{a:1,b:2,usableFrom:4},{a:2,b:4,usableFrom:4}]
  })
  assert.deepEqual(shortestRoutes(s,1,true).get(2).map(r => r.nodes), [[1,2]])
  assert.deepEqual(shortestRoutes(s,2,true).get(1).map(r => r.nodes), [[2,1]])
  assert.equal(shortestRoutes(s,1,true).get(4)[0].nodes.length, 4)
  assert.ok(shortestRoutes(s,1,true).get(4).every(r => r.nodes.join('/') !== '1/2/4'))
  assert.deepEqual(shortestRoutes({...s,round:3},1,true).get(2)[0].nodes,[1,0,2])
  assert.ok(order(s,c(4,6,2,1),c(4,6,2,2)).rift)
  assert.ok(order(s,c(5,6,2,1),c(6,6,2,2)).rift)
  assert.ok(order(s,c(6,6,2,1),c(8,6,2,2)).rift)
  assert.deepEqual(order(s,c(7,6,2,1),c(7,6,2,2)).route,[1,0,2])
  assert.ok(!can(s,c(8,6,2,1),c(8,6,2,2)))
  assert.ok(!can(s,c(9,6,2,1),c(9,6,2,2)))
})

test('equally short routes are selectable, but blocked routes fail independently', () => {
  const build = blocker => state([
    timeline(0,[board(0),board(1),board(2,blocker ? [man('green','P',7,6)] : [])]),
    timeline(1,[board(1),board(2,[man('red','Q',6,6)])]),
    timeline(2,[board(1),board(2)]), timeline(3,[board(1),board(2)])
  ], {rifts: [{a:1,b:3,usableFrom:2},{a:3,b:2,usableFrom:2}]})
  // A route through 3 would consume two Rifts, so add the second leg as a tree edge.
  const alternate = blocker => {
    const s = build(blocker)
    s.universes[2] = {...s.universes[2],parent:3}
    s.rifts = [{a:1,b:3,usableFrom:2},{a:0,b:2,usableFrom:2}]
    return s
  }
  assert.deepEqual(legalMoves(alternate(false),c(6,6,2,1),c(8,6,2,2)).map(m => m.route),[[1,0,2],[1,3,2]])
  assert.deepEqual(legalMoves(alternate(true),c(6,6,2,1),c(8,6,2,2)).map(m => m.route),[[1,3,2]])
})

test('pawns by faction push, double, capture, and promote on their eighth rank', () => {
  for (const p of PLAYERS) {
    const f = FORWARD[p]
    const side = {x: -f.y, y:f.x}
    const enemy = PLAYERS.find(other => other !== p)
    const start = offset(home(p, 2),f)
    const from = {...c(0,0), ...start}
    const double = {...from,...offset(start,f,2)}
    const diagonal = {...from,...offset(offset(start,f),side)}
    const s = on(man(p,'P',from.x,from.y),man(enemy,'N',diagonal.x,diagonal.y))
    assert.ok(can(s,from,double),p)
    assert.ok(can(s,from,diagonal),p)
    assert.ok(!can(s,from,{...from,...offset(start,f,-1)}),p)
    assert.ok(!can(on(man(p,'P',from.x,from.y,true)),from,double),p)
    const penultimate = {...from,...offset(home(p,3),f,6)}
    const promotion = {...from,...offset(penultimate,f)}
    const promotable = on(man(p,'P',penultimate.x,penultimate.y,true))
    const result = resolveRound(promotable,[order(promotable,penultimate,promotion)])
    assert.equal(at(result.state,promotion.x,promotion.y,1).kind,'Q',p)
  }
})

test('pawns move down the tree, can double through clear boards, and capture using a time step', () => {
  const s = state([
    timeline(0,[board(0),board(1),board(2,[man('red','P',6,6)])]),
    timeline(1,[board(1,[man('blue','R',6,6)]),board(2)]),
    timeline(2,[board(2)], {parent:1})
  ])
  assert.ok(can(s,c(6,6,2),c(6,6,2,1)))
  assert.ok(can(s,c(6,6,2),c(6,6,2,2)))
  assert.ok(order(s,c(6,6,2),c(6,6,1,1)).capture)
  const up = {...s,universes:[s.universes[0],timeline(1,[board(1),board(2,[man('red','P',7,6)])]),s.universes[2]]}
  assert.ok(!can(up,c(7,6,2,1),c(7,6,2)))
})

test('historical arrivals split into independent branches without altering history', () => {
  const old = board(0,[man('green','N',6,6)])
  const end = board(1,[man('red','R',6,6),man('blue','B',7,6)])
  const s = state([timeline(0,[old,end])])
  const a = order(s,c(6,6,1),c(6,6,0))
  const b = order(s,c(7,6,1),c(6,6,0))
  const result = resolveRound(s,[a,b])
  assert.equal(result.outcomes.every(o => o.status === 'applied' && o.captures.length === 1),true)
  assert.deepEqual(result.state.universes.map(u => [u.parent,u.divergence,frontier(u).t]),[[null,0,2],[0,0,1],[0,0,1]])
  assert.equal(getBoard(result.state,{u:0,t:0}),old)
  assert.equal(getBoard(result.state,{u:0,t:1}),end)
  assert.equal(at(result.state,6,6,0).player,'green')
  assert.equal(at(result.state,6,6,2),null)
  assert.equal(present(result.state),1)
  assert.deepEqual(resolveRound(s,[b,a]),result)
})

test('cross-universe historical branch creates a Rift and advances only source plus Present', () => {
  const s = state([
    timeline(0,[board(0),board(1),board(2)]),
    timeline(1,[board(1),board(2,[man('red','N',7,7)])]),
    timeline(2,[board(1),board(2),board(3)], {creator:'blue'})
  ])
  const m = order(s,c(7,7,2,1),c(7,7,0))
  const r = resolveRound(s,[m])
  assert.deepEqual(r.state.rifts,[{a:1,b:3,usableFrom:5}])
  assert.deepEqual(r.state.universes.map(u=>frontier(u).t),[3,3,3,1])
  assert.equal(r.state.universes[3].parent,0)
  assert.ok(!r.state.universes[3].active)
  assert.equal(present(r.state),3)
  assert.ok(can(r.state,c(7,7,1,3),c(7,7,3,1)), 'new Rift permits a knight jump next round')
})

test('activation capacity follows oldest branches and retains eliminated branch counts', () => {
  const us = [timeline(0,[board(0)])]
  for (const creator of ['red','red','red','green','green','blue','yellow']) {
    us.push(timeline(us.length,[board(1)],{creator,active:false}))
  }
  us[1] = {...us[1],created:3}
  assert.deepEqual(activation(us.slice(0,4),[]).filter(u=>u.active).map(u=>u.id),[0,2])
  assert.deepEqual(activation(us,[]).filter(u=>u.active).map(u=>u.id),[0,2,3,4,5,6,7])
  assert.deepEqual(activation(us,['green']).filter(u=>u.active).map(u=>u.id),[0,2,3,6,7])
})

test('Present budgets allow up to four main and one distinct future/inactive source', () => {
  const us = [timeline(0,[board(0),board(1)]), ...Array.from({length:5},(_,i)=>timeline(i+1,[board(1)])),
    timeline(6,[board(1),board(2)]),timeline(7,[board(1)],{active:false})]
  const s = state(us)
  assert.deepEqual(moveBudget(s),{main:4,optional:1})
  const used = [0,1,2,3].map(u => ({from:c(6,6,1,u)}))
  assert.equal(sourceBudget(s,c(5,5,1,0),used),null)
  assert.equal(sourceBudget(s,c(5,5,1,4),used),null)
  assert.equal(sourceBudget(s,c(5,5,1,6),[]),null)
  assert.equal(sourceBudget(s,c(5,5,2,6),used),'optional')
  assert.equal(sourceBudget(s,c(5,5,1,7),[...used,{from:c(5,5,2,6)}]),null)
  const r = resolveRound(s,[])
  assert.deepEqual(r.state.universes.map(u=>frontier(u).t),[2,2,2,2,2,2,2,1])
})

test('enemy successfully moving away survives, including a swap and a three-way cycle', () => {
  const s = on(man('red','R',6,6),man('blue','K',7,6),man('green','B',7,7))
  const attack = order(s,c(6,6),c(7,6))
  const escape = order(s,c(7,6),c(8,6))
  assert.deepEqual(resolveRound(s,[attack,escape]).eliminated,[])
  const swap = resolveRound(s,[attack,order(s,c(7,6),c(6,6))])
  assert.ok(swap.outcomes.every(o=>o.status==='applied' && !o.captures.length))
  assert.equal(at(swap.state,6,6,1).player,'blue')
  const cycle = resolveRound(s,[attack,order(s,c(7,6),c(7,7)),order(s,c(7,7),c(6,6))])
  assert.ok(cycle.outcomes.every(o=>o.status==='applied' && !o.captures.length))
  assert.equal(at(cycle.state,6,6,1).player,'green')
})

test('contested destinations fail together and failed departures propagate through friendly chains', () => {
  const s = state([
    timeline(0,[board(0),board(1,[man('red','R',6,6)])]),
    timeline(1,[board(1,[man('red','R',6,6)])]),
    timeline(2,[board(1,[man('red','R',6,6),man('blue','R',7,7)])],{parent:1})
  ])
  const a = order(s,c(6,6,1,0),c(6,6,1,1))
  const b = order(s,c(6,6,1,1),c(6,6,1,2))
  const d = order(s,c(6,6,1,2),c(7,6,1,2))
  const e = order(s,c(7,7,1,2),c(7,6,1,2))
  assert.ok(a.needsVacancy && b.needsVacancy)
  assert.ok(resolveRound(s,[a,b,d]).outcomes.every(o=>o.status==='applied'))
  const result = resolveRound(s,[a,b,d,e])
  assert.deepEqual(result.outcomes.map(o=>o.status).sort(),['blocked','blocked','contested','contested'])
  assert.deepEqual(result,resolveRound(s,[e,d,a,b]))
  assert.equal(at(result.state,7,6,2,2),null)
  const friendlySwap = resolveRound(s,[a,order(s,c(6,6,1,1),c(6,6,1,0))])
  assert.ok(friendlySwap.outcomes.every(o=>o.status==='applied'))
})

test('simultaneous king deaths draw; historical king captures remove all future combatants', () => {
  const s = {...on(man('red','R',6,6),man('blue','K',8,6),man('blue','R',7,7),man('red','K',7,9)),
    eliminated:['yellow','green']}
  const draw = resolveRound(s,[order(s,c(6,6),c(8,6)),order(s,c(7,7),c(7,9))])
  assert.deepEqual(draw.eliminated,['red','blue'])
  assert.deepEqual(survivors(draw.state),[])
  assert.equal(resolveRound(draw.state,[]).state,draw.state)
  const history = state([timeline(0,[board(0,[man('blue','K',6,6),man('blue','B',7,7)]),
    board(1,[man('red','R',6,6),man('blue','R',7,7)])]),timeline(1,[board(1,[man('blue','N',9,9)])],{creator:'blue'})])
  const result = resolveRound(history,[order(history,c(6,6,1),c(6,6,0)),order(history,c(7,7,1),c(7,8,1))])
  assert.deepEqual(result.eliminated,['blue'])
  assert.ok(result.outcomes.every(o=>o.status==='applied'))
  assert.ok(!result.state.universes[1].active)
  assert.equal(at(result.state,7,7,1,2),null)
  assert.equal(getBoard(result.state,{u:0,t:0}).cells[index(c(6,6))].kind,'K')
})

test('castling ignores check, uses two atomic legs and fails when either arrival is contested', () => {
  const s = on(man('red','K',7,13),man('red','R',10,13),man('blue','R',8,10))
  const move = order(s,c(7,13),c(9,13))
  assert.equal(move.castle.to.x,8)
  const success = resolveRound(s,[move])
  assert.equal(at(success.state,8,13,1).kind,'R')
  assert.equal(at(success.state,9,13,1).kind,'K')
  const r = resolveRound(s,[move,order(s,c(8,10),c(8,13))])
  assert.ok(r.outcomes.every(o=>o.status==='contested'))
  assert.equal(at(r.state,7,13,1).kind,'K')
  assert.equal(at(r.state,10,13,1).kind,'R')
})

test('en passant is spatial, expires by round, and misses a victim that successfully leaves', () => {
  const s = on(man('red','P',6,9),man('blue','P',5,7))
  const r = resolveRound(s,[order(s,c(6,9),c(6,7))]).state
  const ep = order(r,c(5,7,1),c(6,8,1))
  assert.ok(ep.enPassant)
  assert.ok(!can({...r,round:r.round+1},c(5,7,1),c(6,8,1)))
  const caught = resolveRound(r,[ep])
  assert.equal(at(caught.state,6,7,2),null)
  assert.equal(caught.outcomes[0].captures[0].piece.kind,'P')
  const escape = resolveRound(r,[ep,order(r,c(6,7,1),c(6,6,1))])
  assert.equal(at(escape.state,6,6,2).player,'red')
  assert.ok(escape.outcomes.every(o=>!o.captures.length))
})

test('submitted orders must originate from distinct frontiers and use a legal route', () => {
  const s = initialState()
  const a = order(s,c(4,13),c(5,11))
  const b = order(s,c(5,12),c(5,10))
  assert.equal(resolveRound(s,[a,b]).rejected.length,2)
  assert.equal(resolveRound(s,[{...a,route:[99]}]).rejected.length,1)
  assert.deepEqual(legalMoves(resolveRound(s,[a]).state,a.from),[])
  assert.deepEqual(legalMoves(s,c(2,2)),[])
})

test('journal round-trips live state, private drafts, locks and replay frames', () => {
  const s = newSession()
  s.draft.push(order(liveState(s),c(4,13),c(5,11)))
  commit(s)
  assert.equal(planner(s),'blue')
  const imported = decode(encode(s))
  assert.equal(imported.locked[0].length,1)
  for (let i=0;i<3;i++) commit(imported)
  imported.draft.push(order(liveState(imported),c(5,11,1),c(7,11)))
  const restored = decode(encode(imported))
  assert.deepEqual(restored.frames,imported.frames)
  assert.deepEqual(restored.results,imported.results)
  assert.equal(restored.draft.length,1)
  assert.equal(encode(restored),encode(imported))
  assert.throws(()=>decode('{"format":"other"}'),/Unsupported/)
  const bad = JSON.parse(encode(restored))
  bad.draft[0].route = [500]
  assert.throws(()=>decode(JSON.stringify(bad)),/Invalid pending plan/)
  bad.journal[0][0].from.x = -3
  assert.throws(()=>decode(JSON.stringify(bad)),/Invalid board coordinate/)
})

test('an inactive frontier advances when hit and any king there still counts', () => {
  const frozen = board(1, [man('blue','K',6,6),man('blue','P',7,7)])
  const s = state([
    timeline(0,[board(0),board(1,[man('red','R',6,6),man('blue','K',9,9)])]),
    timeline(1,[frozen],{active:false,creator:'blue'}),
    timeline(2,[board(1),board(2)],{active:false,creator:'green'})
  ])
  const r = resolveRound(s,[order(s,c(6,6,1,0),c(6,6,1,1))])
  assert.deepEqual(r.eliminated,['blue'])
  assert.equal(at(r.state,6,6,2,1).player,'red')
  assert.equal(at(r.state,9,9,2),null)
  assert.equal(at(r.state,7,7,2,1),null)
  assert.equal(r.state.universes[1].active,false)
  assert.equal(r.state.universes[1].boards[0],frozen)
  assert.equal(r.state.universes[2].boards,s.universes[2].boards)
})
