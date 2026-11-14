import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {randomBytes,scryptSync} from 'node:crypto'
import {ITEMS} from '../src/collection.ts'

// Separate local fixtures survive restarts without touching the normal game database.
const directory=resolve('data/visual-demo'),file=resolve(directory,'multiplayer.json')
await mkdir(directory,{recursive:true})
try{await readFile(file)}catch(error){
 if(error.code!=='ENOENT')throw error
 const names=['RiftWalker','AstralKnight','ClockworkQueen','Nebula','VoidBishop','Demo','SolarForge','EchoPawn','Chronos','Prism','NightRider','Starlit']
 const users=names.map((name,i)=>{
  const salt=randomBytes(16).toString('hex'),inventory=(name==='Demo'?ITEMS:ITEMS.filter((_,n)=>n%12===i)).map(item=>({uid:randomBytes(12).toString('hex'),itemId:item.id,acquired:Date.now()-86400000,pending:false}))
  const avatar=inventory.find(o=>o.itemId.startsWith('icon-'))?.itemId??'default'
  return {name,salt,hash:scryptSync('local-demo-5d!',salt,64).toString('hex'),rating:{value:2048-i*73,games:112-i*7},settings:{avatar,movement:'live',players:2,moveNotifications:true},notifications:[],wallet:{starterGranted:true,coins:name==='Demo'?50000:2400+i*300,inventory,loadout:{icon:avatar,pieces:name==='Demo'?{K:'skin-astral',Q:'skin-astral',R:'skin-astral',B:'skin-astral',N:'skin-astral',P:'skin-astral'}:{}}}}
 })
 await writeFile(file,JSON.stringify({users,rooms:[],logins:{},listings:[]}),{flag:'wx'})
 console.log('Created 12 demo accounts, rated leaderboard, and a complete Demo collection.')
}
// Refresh only the dedicated demo collection when new cosmetic designs are added.
const db=JSON.parse(await readFile(file,'utf8')),demo=db.users.find(u=>u.name==='Demo')
if(demo){
 let changed=false
 for(const item of ITEMS)if(!demo.wallet.inventory.some(o=>o.itemId===item.id)){
  demo.wallet.inventory.push({uid:randomBytes(12).toString('hex'),itemId:item.id,acquired:Date.now(),pending:false});changed=true
 }
 if(changed)await writeFile(file,JSON.stringify(db))
}
process.env.DATA_DIR=directory
process.env.PORT??='4174'
console.log(`Demo login: Demo / local-demo-5d! | http://127.0.0.1:${process.env.PORT}/chess/login.html`)
await import('../dist/server.mjs')
