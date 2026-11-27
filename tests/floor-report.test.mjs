import test from 'node:test'
import assert from 'node:assert/strict'
import {ChessStore} from '../server/storage.ts'
import {floorReport} from '../server/floor-report.ts'
import {cashUnits,companies,journal,operating,saveCompanies} from '../server/corporate.ts'
import {advanceLottery,lottery} from '../server/weekly-lottery.ts'
import {book,bailListing,migratePrecinct,payBail,release} from '../server/custody.ts'
import {bankApi} from '../server/bank.ts'
import {DAY} from '../server/credit.ts'
import {financeFigures} from '../src/floor-report.ts'
import {interactions,localSite} from '../src/world/model.ts'

const start=Date.UTC(2026,10,24,11)
function fixture(t){
  const db=new ChessStore('.',{memory:true})
  t.after(()=>db.close())
  const tx=fn=>db.transaction(fn)
  tx(u=>{
    for(const name of ['Reader','Other','Borrower'])u.users.add(name,{name,hash:'',salt:'',wallet:{starterGranted:true,coins:1000,inventory:[],loadout:{icon:'default',pieces:{}}}})
    const e=companies(u,start)
    for(const symbol of ['CAS','BNK','PRI','LOT']){
      const c=e[symbol];c.holders={Reader:1,Other:2};c.inventory=c.issued-3
    }
    saveCompanies(u,e)
  })
  return {tx,read:(symbol,now=start,user='Reader')=>tx(u=>floorReport(u,user,symbol,now))}
}
test('casino and bank report net profit since Amsterdam midnight, including old ledger entries but excluding financing',t=>{
  const f=fixture(t)
  f.tx(u=>{
    const e=companies(u,start)
    for(const c of [e.CAS,e.BNK]){
      c.policy.dividends=50
      journal(c,'Personal interest collected',cashUnits(13),start-DAY)
      journal(c,'Bar sales',cashUnits(1),start)
      operating(c,'Operating fixture',cashUnits(20),start)
      operating(c,'Operating expense fixture',-cashUnits(3),start)
      journal(c,'Inventory sold',cashUnits(90),start)
      c.profit=cashUnits(18);c.loss=cashUnits(6)
    }
    saveCompanies(u,e)
  })
  for(const symbol of ['CAS','BNK']){
    const v=f.read(symbol)
    assert.equal(v.profitPeriod,'Today');assert.equal(v.profit,18)
    assert.equal(v.totalDividend,6);assert.equal(v.yourDividend,2)
    assert.equal(f.read(symbol,start,'Borrower').yourDividend,0)
    assert.equal(v.register.yourShares,1)
    assert.equal(v.register.ownership[0].name,'Other')
  }
  f.tx(u=>{const e=companies(u,start);e.CAS.recoveryUntil=start+2*DAY;e.BNK.cash=cashUnits(5000);saveCompanies(u,e)})
  assert.equal(f.read('CAS').totalDividend,0);assert.equal(f.read('BNK').totalDividend,0)
})
test('weekly lottery report survives midnight and matches the gross rounded payouts at draw close',t=>{
  const f=fixture(t)
  let until
  f.tx(u=>{
    const d=advanceLottery(u,start);until=d.until
    lottery(u,u.users.get('Other'),start,{kind:'ticket',count:10,draw:until})
    // Isolate this draw from scheduled resident purchases.
    const saved=u.metadata('royalWeeklyLottery');saved.nextSale=until;u.putMetadata('royalWeeklyLottery',saved)
  })
  const v=f.read('LOT',start+DAY)
  assert.equal(v.profitPeriod,'This week');assert.equal(v.profit,1)
  assert.equal(v.totalDividend,.9999);assert.equal(v.yourDividend,.3333)
  assert.equal(v.nextPayout,until);assert.equal(v.cash,0)
  const after=f.read('LOT',until)
  assert.equal(after.lastPaid,v.totalDividend);assert.equal(after.profit,0);assert.equal(after.totalDividend,0)
  assert.equal(f.tx(u=>u.users.get('Reader').resort.dividends),v.yourDividend)
})
test('prison shows accrued net profit, excludes debt and preserves the report through early release and payout',t=>{
  const f=fixture(t)
  f.tx(u=>{
    bankApi(u,u.users.get('Borrower'),'/api/bank/borrow','POST',{amount:100,days:7,sequence:1,id:crypto.randomUUID()},start)
    book(u,'Borrower',5,start,true)
  })
  assert.equal(f.read('PRI',start+.25*DAY).profit,0)
  // The first day services principal. The next half-day covers locked interest.
  const mid=f.read('PRI',start+1.5*DAY)
  assert.equal(mid.totalDividend,0);assert.equal(mid.yourDividend,0);assert.equal(mid.profit,0)
  const at=start+1.8*DAY
  const before=f.read('PRI',at)
  assert.equal(before.profit,30)
  f.tx(u=>release(u,'Borrower',at))
  const after=f.read('PRI',at)
  assert.equal(after.profit,30);assert.equal(after.totalDividend,before.totalDividend)
  assert.equal(after.cash,30);assert.equal(after.yourDividend,10)
  assert.equal(f.read('PRI',start+2*DAY).lastPaid,after.totalDividend)
  assert.equal(f.read('PRI',start+2*DAY).yourDividend,0)
})
test('reports only occur on the four dividend floors, on opposite sides and with matching UI labels',t=>{
  const f=fixture(t)
  for(const symbol of ['CAS','BNK','LOT','PRI']){
    const zone='floor:'+symbol
    const [a,b]=interactions(zone).filter(p=>p.id.endsWith('-report')).map(p=>localSite(zone,p.x,p.z))
    assert.equal(a.x,-b.x);assert.equal(a.z,b.z)
    assert.equal(financeFigures(f.read(symbol))[1][0],symbol==='LOT'?'Profit this week':'Profit today')
  }
  assert.ok(!interactions('floor:AAPL').some(p=>p.id.endsWith('-report')))
  assert.throws(()=>f.read('AAPL'),/city company floor/)
})

test('bail accrues as PRI profit and is distributed to shareholders at the existing daily settlement',t=>{
  const f=fixture(t)
  f.tx(u=>{
    book(u,'Borrower',3,start)
    const report=floorReport(u,'Reader','PRI',start)
    assert.equal(report.totalDividend,0)
    const [b]=u.metadata('meridianBookings')
    payBail(u,'Other',b.id,start)
  })
  const report=f.read('PRI')
  assert.equal(report.profit,21);assert.equal(report.totalDividend,21);assert.equal(report.yourDividend,7)
  assert.equal(f.read('PRI',start+DAY).lastPaid,21)
  assert.equal(f.read('PRI',start+DAY).profit,0)
  assert.equal(f.tx(u=>u.users.get('Reader').stocks.prisonDividendsPaid),7)
})

test('existing sentences get stable anonymous bail quotes across restart, including all five timed tiers',t=>{
  const f=fixture(t)
  const now=Date.now()
  f.tx(u=>{
    const records=[]
    for(let i=1;i<=5;i++){
      const name='Legacy '+i
      u.users.add(name,{name,hash:'',salt:''})
      const b=book(u,name,i,now)
      delete b.id;delete b.reason;delete b.minutes
      records.push(b)
    }
    u.putMetadata('meridianBookings',records)
    migratePrecinct(u)
  })
  const listing=()=>f.tx(u=>u.metadata('meridianBookings').map(bailListing))
  const rows=listing()
  assert.deepEqual(rows.map(r=>r.price),[1,4,21,125,500])
  assert.ok(rows.every(r=>r.id&&r.reason.includes('unrecorded')))
  f.tx(u=>migratePrecinct(u));assert.deepEqual(listing(),rows)
})
