import test from 'node:test'
import assert from 'node:assert/strict'
import {walkPatrol} from '../server/world/patrol-motion.ts'
import {at,threshold,levelOf} from '../src/world/civic-venues.ts'
import {clearSight} from '../src/world/sight.ts'

test('a pursuing officer enters through the public door, routes around the shop wall and ascends the station stairs',()=>{
  for(const venue of ['gunshop','station']){
    const target={...threshold(venue,-1.25),zone:venue}
    const actor={...threshold(venue,1.3),zone:'city'};actor.x+=3
    const state={keys:[],residential:{doors:{},lifts:{}}}
    let crossed=false
    for(let i=0;i<150;i++){
      const before=actor.zone
      walkPatrol(actor,target,.13,state,i*50)
      if(before==='city'&&actor.zone===venue){
        assert.ok(Math.abs(actor.x-threshold(venue,0).x)<.85)
        crossed=true
      }
    }
    assert.ok(crossed,venue)
    assert.ok(Math.hypot(actor.x-target.x,actor.z-target.z)<.2)
    const behindWall={...threshold(venue,1.3),zone:'city'};behindWall.x+=3.5
    assert.equal(clearSight(behindWall,{...target,x:target.x+3.5},state,1000),false)
    if(venue==='station'){
      Object.assign(target,at('station',0,0),{zone:'precinct:1'})
      for(let i=0;i<320;i++)walkPatrol(actor,target,.13,state,8000+i*50)
      assert.equal(levelOf(actor.zone),1)
      Object.assign(target,threshold('station',1.2),{zone:'city'})
      for(let i=0;i<420;i++)walkPatrol(actor,target,.13,state,25000+i*50)
      assert.equal(actor.zone,'city')
      assert.ok(Math.hypot(actor.x-target.x,actor.z-target.z)<.2)
    }
  }
})
