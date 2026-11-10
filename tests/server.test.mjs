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
  const created = await call('/api/games', {title:'Private room',password:'door'}, users[0])
  assert.equal(created.status, 201)
  const code = created.value.code
  assert.match(code, /^[A-Z]{4}$/)
  assert.equal((await call('/api/games', undefined, users[1], 'GET')).value.available.length, 0)
  assert.equal((await call(`/api/games/${code}/join`, {password:'wrong'}, users[1])).status, 403)
  for (const cookie of users.slice(1)) assert.equal((await call(`/api/games/${code}/join`, {password:'door'}, cookie)).status, 200)
  for (const cookie of users.slice(0, 3)) {
    const result = await call(`/api/games/${code}/orders`, {orders:[]}, cookie)
    assert.equal(result.value.state.round, 1)
  }
  const resolved = await call(`/api/games/${code}/orders`, {orders:[]}, users[3])
  assert.equal(resolved.value.state.round, 2)
  assert.equal(resolved.value.journal.length, 1)
  await stop()
  await start()
  const restored = await call(`/api/games/${code}`, undefined, users[0], 'GET')
  assert.equal(restored.value.state.round, 2)
  assert.equal(restored.value.journal.length, 1)
})
