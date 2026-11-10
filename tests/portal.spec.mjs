import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:net'
import {chromium} from 'playwright'

test('account and lobby flow uses the multiplayer server', async t => {
  const listener = createServer()
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const data = await mkdtemp(join(tmpdir(), 'multiverse-portal-'))
  const server = spawn(process.execPath, ['dist/server.mjs'], {env: {...process.env, PORT:String(port), DATA_DIR:data}, stdio:'ignore'})
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE || undefined,
    args:['--no-sandbox','--disable-dev-shm-usage']})
  t.after(async () => { await browser.close(); server.kill(); await new Promise(resolve => server.once('exit', resolve)); await rm(data,{recursive:true,force:true}) })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/me')).ok) break } catch { /* startup pending */ }
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  const page = await browser.newPage()
  await page.goto(base + '/chess/login.html')
  await page.getByLabel('Username').fill('Alice')
  await page.getByLabel('Password', {exact:true}).fill('secret')
  await page.getByRole('button',{name:'Log in',exact:true}).click()
  await page.getByText('Account not found.').waitFor()
  await page.getByRole('button',{name:'Make account'}).click()
  await page.getByLabel('Re-enter password').fill('secret')
  await page.getByRole('button',{name:'Sign up'}).click()
  await page.getByRole('heading',{name:'Choose a game'}).waitFor()
  assert.equal(await page.locator('#account-name').textContent(), 'Alice')
  await page.getByRole('button',{name:'Make game'}).click()
  await page.getByLabel('Game name').fill('Alice’s room')
  await page.getByLabel('Game password').fill('private')
  await page.getByRole('button',{name:'Create game'}).click()
  await page.waitForURL(/online\.html\?code=[A-Z]{4}/)
  const code = new URL(page.url()).searchParams.get('code')
  const detail = await page.request.get(base + `/api/games/${code}`)
  assert.equal(detail.status(),200)
  assert.equal((await detail.json()).seats.red,'Alice')
  const guests = []
  for (const name of ['Bob', 'Carol', 'Dana']) {
    const context = await browser.newContext()
    t.after(() => context.close())
    const signup = await context.request.post(base + '/api/signup', {data:{username:name,password:'p',confirm:'p'}})
    assert.equal(signup.status(),201)
    const join = await context.request.post(base + `/api/games/${code}/join`, {data:{password:'private'}})
    assert.equal(join.status(),200)
    const guest = await context.newPage()
    await guest.goto(base + `/chess/online.html?code=${code}`)
    guests.push(guest)
  }
  await page.getByRole('button',{name:'Lock in a pass'}).waitFor({timeout:8000})
  await page.getByRole('button',{name:'Lock in a pass'}).click()
  for (const guest of guests) {
    await guest.getByRole('button',{name:'Lock in a pass'}).click()
  }
  await page.getByText('1 rounds resolved').waitFor({timeout:8000})
  const after = await page.request.get(base + `/api/games/${code}`)
  assert.equal((await after.json()).state.round,2)
  await page.goto(base + '/chess/lobby.html')
  await page.getByRole('button',{name:'Continue game'}).click()
  await page.getByText('Alice’s room').waitFor()
  await page.getByRole('button',{name:'Continue',exact:true}).click()
  await page.getByText('1 rounds resolved').waitFor()
  await page.goto(base + '/chess/')
  await page.waitForURL(base + '/chess/lobby.html')
  await page.getByRole('link',{name:'Local play'}).click()
  await page.waitForURL(/\/chess\/\?local=1/)
  assert.equal(await page.locator('canvas').count(),1)
})
