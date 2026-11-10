import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:net'

async function port() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const n = server.address().port
  await new Promise(resolve => server.close(resolve))
  return n
}

test('accounts, rooms and four private plans survive a server restart', async t => {
  const data = await mkdtemp(join(tmpdir(), 'multiverse-server-'))
  const number = await port()
  let child
  const base = `http://127.0.0.1:${number}`
  const start = async () => {
    child = spawn(process.execPath, ['dist/server.mjs'], {env: {...process.env, DATA_DIR: data, PORT: String(number)}, stdio: 'ignore'})
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/api/me')).ok) return } catch { /* startup pending */ }
      await new Promise(resolve => setTimeout(resolve, 30))
    }
    throw new Error('Server did not start')
  }
  const stop = async () => {
    child.kill()
    await new Promise(resolve => child.once('exit', resolve))
  }
  t.after(async () => { if (child?.exitCode === null) await stop(); await rm(data, {recursive:true, force:true}) })
  await start()
  const call = async (path, value, cookie, method = 'POST') => {
    const response = await fetch(base + path, {method, headers: {
      ...(cookie ? {cookie} : {}), ...(value === undefined ? {} : {'content-type':'application/json'})},
      body: value === undefined ? undefined : JSON.stringify(value)})
    return {status: response.status, value: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0]}
  }
  assert.equal((await call('/api/login', {username:'missing',password:'a'})).value.error, 'Account not found')
  const users = []
  for (const name of ['Red', 'Blue', 'Yellow', 'Green']) {
    const account = await call('/api/signup', {username:name,password:'p',confirm:'p'})
    assert.equal(account.status, 201)
    users.push(account.cookie)
  }
  assert.equal((await call('/api/signup', {username:'red',password:'p',confirm:'p'})).status, 409)
  assert.equal((await call('/api/signup', {username:'Space',password:' p ',confirm:' p '})).status,201)
  assert.equal((await call('/api/login', {username:'Space',password:' p '})).status,200)
  for (let i = 0; i < 10; i++) assert.equal((await call('/api/login', {username:'Red',password:'wrong'})).status,401)
  assert.equal((await call('/api/login', {username:'Red',password:'wrong'})).status,429)
  const created = await call('/api/games', {title:'Private room',password:'door'}, users[0])
  assert.equal(created.status, 201)
  const code = created.value.code
  assert.match(code, /^[A-Z]{4}$/)
  assert.equal((await call('/api/games', undefined, users[1], 'GET')).value.available.length, 0)
  assert.equal((await call(`/api/games/${code}/join`, {password:'wrong'}, users[1])).status, 403)
  for (const cookie of users.slice(1)) assert.equal((await call(`/api/games/${code}/join`, {password:'door'}, cookie)).status, 200)
  const redMove = {player:'red',from:{x:4,y:13,u:0,t:0},to:{x:5,y:11,u:0,t:0},route:[0]}
  const invalid = await call(`/api/games/${code}/orders`, {orders:[{...redMove,player:'blue'}]}, users[0])
  assert.equal(invalid.status,400)
  for (const [index,cookie] of users.slice(0, 3).entries()) {
    const result = await call(`/api/games/${code}/orders`, {orders:index === 0 ? [redMove] : []}, cookie)
    assert.equal(result.value.state.round, 1)
  }
  const resolved = await call(`/api/games/${code}/orders`, {orders:[]}, users[3])
  assert.equal(resolved.value.state.round, 2)
  assert.equal(resolved.value.journal.length, 1)
  assert.equal(resolved.value.state.universes[0].boards.at(-1).cells[11 * 14 + 5]?.player, 'red')
  const duel = await call('/api/games', {title:'Two seats',playerCount:2}, users[0])
  assert.equal(duel.value.state.playerCount,2)
  const duelJoin = await call(`/api/games/${duel.value.code}/join`, {}, users[1])
  assert.equal(duelJoin.value.seat,'yellow')
  assert.equal(duelJoin.value.waiting,false)
  await call(`/api/games/${duel.value.code}/orders`, {orders:[]}, users[0])
  assert.equal((await call(`/api/games/${duel.value.code}/orders`, {orders:[]}, users[1])).value.state.round,2)
  assert.equal((await call(`/api/games/${duel.value.code}/join`, {}, users[2])).status,409)
  const trio = await call('/api/games', {title:'Three seats',playerCount:3}, users[0])
  assert.equal(trio.value.state.playerCount,3)
  await call(`/api/games/${trio.value.code}/join`, {}, users[1])
  const trioJoin = await call(`/api/games/${trio.value.code}/join`, {}, users[2])
  assert.equal(trioJoin.value.seat,'yellow')
  assert.equal(trioJoin.value.waiting,false)
  for (const user of users.slice(0,3)) {
    const response = await call(`/api/games/${trio.value.code}/orders`, {orders:[]}, user)
    assert.equal(response.status,200)
  }
  assert.equal((await call(`/api/games/${trio.value.code}`, undefined, users[0], 'GET')).value.state.round,2)
  assert.equal((await call('/api/games', {title:'Invalid',playerCount:5}, users[0])).status,400)
  for (let i = 3; i < 50; i++) assert.equal((await call('/api/games', {title:`Room ${i}`}, users[0])).status,201)
  assert.equal((await call('/api/games', {title:'Too many'}, users[0])).status,409)
  await stop()
  await start()
  const restored = await call(`/api/games/${code}`, undefined, users[0], 'GET')
  assert.equal(restored.value.state.round, 2)
  assert.equal(restored.value.journal.length, 1)
})
