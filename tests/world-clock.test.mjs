import test from 'node:test'
import assert from 'node:assert/strict'
import {WorldClock} from '../server/world/clock.ts'

test('simulation steps once across observers and drops excess motion after a stall',()=>{
  const clock=new WorldClock(0),steps=[],dropped=[]
  for(const now of [49,50,50,110,1140,1140,1150])clock.advance(now,t=>steps.push(t),ms=>dropped.push(ms))
  assert.deepEqual(steps,[50,100,950,1000,1050,1100,1150])
  assert.deepEqual(dropped,[800])
})
