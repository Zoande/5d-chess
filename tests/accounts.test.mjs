import test from 'node:test'
import assert from 'node:assert/strict'
import {eloChanges,ensureAccount,settleRatings,startRatings,notify,profile,mergedChanges,eliminationCredits,rankedPlayers} from '../server/accounts.ts'
import {initialState} from '../src/model.ts'
const account=name=>({name,salt:'test',hash:'test'})

test('new accounts appear on the leaderboard and equal Elo shares a competition rank',()=>{
 const users=['Zoe','Amy','Bea','Cy','Dan'].map(account)
 assert.deepEqual(rankedPlayers(users).map(p=>p.rank),[1,1,1,1,1])
 ensureAccount(users[0]).rating.value=1400
 ensureAccount(users[3]).rating.value=1100
 ensureAccount(users[4]).rating.value=1000
 assert.deepEqual(rankedPlayers(users).map(p=>[p.name,p.rank]),[['Zoe',1],['Amy',2],['Bea',2],['Cy',4],['Dan',5]])
})
test('Elo changes are balanced, opponent-normalized and fair for ties and upsets',()=>{
 assert.deepEqual(eloChanges([1200,1200],[1,0]),[16,-16])
 assert.deepEqual(eloChanges([1200,1200,1200,1200],[3,2,1,0]),[16,5,-5,-16])
 assert.deepEqual(eloChanges([1200,1200,1200],[1,1,1]),[0,0,0])
 const tied=eloChanges([1200,1200,1200],[2,0,0]);assert.equal(tied[1],tied[2]);assert.equal(tied.reduce((a,b)=>a+b),0)
 assert.ok(eloChanges([1000,1600],[1,0])[0]>16)
 for(let n=2;n<=4;n++){
  const changes=eloChanges(Array.from({length:n},(_,i)=>1000+i*135),Array.from({length:n},(_,i)=>n-i))
  assert.equal(changes.reduce((a,b)=>a+b),0);assert.ok(changes.every(d=>Math.abs(d)<=32))
 }
})
test('rating settlement is once-only, per-pool and includes all multiplayer placements',()=>{
 const users=['A','B','C','D'].map(account),base=initialState(4,'live')
 const room={code:'RATE',title:'Rated',seats:{red:'A',blue:'B',yellow:'C',green:'D'},state:base,results:[],rated:true}
 startRatings(room,users)
 room.results=[{eliminated:['green']},{eliminated:['blue','yellow']}]
 room.state={...base,eliminated:['green','blue','yellow']}
 assert.equal(settleRatings(room,users),true)
 const total=users.reduce((sum,u)=>sum+ensureAccount(u).ratings['live-multi'].value,0)
 assert.equal(total,4800)
 assert.equal(room.ratingChanges.blue.delta,room.ratingChanges.yellow.delta)
 const snapshot=structuredClone(users)
 assert.equal(settleRatings(room,users),false);assert.deepEqual(users,snapshot)
 for(const u of users){assert.equal(u.ratings['live-multi'].games,1);assert.equal(u.ratings['classic-duel'].value,1200);assert.equal(u.notifications[0].kind,'rating');assert.equal(u.rating.games,1);assert.ok(u.wallet.coins>=60)}
 const casual={...room,rated:false,ratingSettled:false};assert.equal(settleRatings(casual,users),false)
})
test('old accounts get safe defaults and move preference keeps rating notifications',()=>{
 const u=account('Old');const p=profile(u)
 assert.equal(p.rating.value,1200);assert.equal(p.settings.avatar,'default');assert.equal('ratings' in p,false)
 assert.equal('hash' in p,false)
 ensureAccount(u).settings.moveNotifications=false
 notify(u,{kind:'move',title:'Move',detail:'Hidden orders stay private',code:'TEST'})
 assert.equal(u.notifications.length,0)
 for(let i=0;i<110;i++)notify(u,{kind:'rating',title:'Rating',detail:'Result',code:'TEST'})
 assert.equal(u.notifications.length,100)
})

test('merged Elo rewards finish order primarily and credits each eliminated faction once',()=>{
 const noKills=mergedChanges([1200,1200,1200,1200],[3,2,1,0],[0,0,0,0])
 const kills=mergedChanges([1200,1200,1200,1200],[3,2,1,0],[0,0,2,0])
 assert.ok(kills[0]>kills[1]);assert.ok(kills[0]>0);assert.ok(kills[2]>noKills[2]);assert.equal(kills.reduce((a,b)=>a+b),0)
 assert.deepEqual(mergedChanges([1200,1200],[1,0],[0,1]),[16,-16])
 const result={eliminated:['blue'],outcomes:[{move:{player:'red'},captures:[{piece:{kind:'K',player:'blue'}},{piece:{kind:'K',player:'blue'}}]},{move:{player:'yellow'},captures:[{piece:{kind:'K',player:'blue'}}]}]}
 assert.deepEqual(eliminationCredits({results:[result,result]}),{red:.5,yellow:.5})
})
