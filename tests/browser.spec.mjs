import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {chromium} from 'playwright'
import worker from '../.cloudflare/worker.mjs'

async function server(t) {
  const http = createServer(async (request, response) => {
    const result = await worker.fetch(new Request(`http://localhost${request.url}`, {method: request.method}))
    response.writeHead(result.status, Object.fromEntries(result.headers))
    response.end(Buffer.from(await result.arrayBuffer()))
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => {http.close(resolve); http.closeAllConnections()}))
  return `http://127.0.0.1:${http.address().port}`
}

test('production paths serve on refresh, with chess-only routing', async t => {
  const base = await server(t)
  const redirect = await fetch(base + '/chess?sample=1', {redirect: 'manual'})
  assert.equal(redirect.status, 308)
  assert.match(redirect.headers.get('location'), /\/chess\/\?sample=1$/)
  assert.equal((await fetch(base + '/')).status, 404)
  assert.equal((await fetch(base + '/math/')).status, 404)
  assert.equal((await fetch(base + '/chess/nothing')).status, 404)
  const root = await fetch(base + '/chess/')
  assert.equal(root.status, 200)
  assert.match(await root.text(), /src="\/chess\/game\.js"/)
  for (const asset of ['game.js', 'styles.css', 'emblem.svg']) {
    assert.equal((await fetch(base + '/chess/' + asset)).status, 200)
  }
  assert.equal((await fetch(base + '/chess/', {method:'POST'})).status, 405)
})

test('four players create a branch and Rift in one scene, then reload, replay, export and import', async t => {
  const base = await server(t)
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']})
  t.after(() => browser.close())
  const page = await browser.newPage({viewport:{width:1380,height:920}, reducedMotion:'reduce', acceptDownloads:true})
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text())})
  await page.goto(base + '/chess/')
  const canvas = page.locator('#scene')
  const waitText = (selector, value) => page.waitForFunction(([selector, value]) =>
    document.querySelector(selector)?.textContent.includes(value), [selector, value])
  const clickAction = name => page.locator('[data-action="' + name + '"]').click()
  const focusPlayer = () => page.getByRole('button',{name:'Focus player',exact:true}).click()
  async function clickSquare(x,y) {
    await focusPlayer()
    const box = await canvas.boundingBox()
    const scale = Math.max(.2,Math.min(1.62,Math.min((box.width-48)/448,(box.height-154)/448)))
    await canvas.click({position:{x:box.width/2+(x+.5-7)*32*scale,
      y:box.height/2+((y+.5-7)*32-2)*scale}})
  }
  async function handoff(color) {
    const screen = page.getByRole('dialog')
    await screen.getByRole('heading', {name:'Pass to ' + color}).waitFor()
    assert.equal(await page.locator('.order-list').count(),0)
    await screen.getByRole('button', {name:new RegExp(color + ' · Ready')}).click()
    await waitText('#turn', color + ' to plan')
  }
  async function finishRound(n, redAction = 'lock') {
    await clickAction(redAction)
    for (const p of ['Blue','Yellow','Green']) {
      await handoff(p)
      await clickAction('pass')
    }
    await waitText('#turn', 'Round ' + n + ' resolved')
  }
  async function startNext() {
    await clickAction('continue')
    await handoff('Red')
  }
  const press = async (key, count = 1) => {
    for (let i = 0; i < count; i++) await canvas.press(key)
  }

  await waitText('#turn','Red to plan')
  if (process.env.QA_SCREENSHOT) await page.screenshot({path:process.env.QA_SCREENSHOT})
  assert.equal(await page.locator('canvas').count(),1)
  assert.equal(await page.locator('#viewport').evaluate(el => Math.round(el.getBoundingClientRect().width)), 1380)
  const riftsOverlay = page.getByRole('button',{name:'Temporal Rifts'})
  await riftsOverlay.click()
  assert.equal(await riftsOverlay.getAttribute('aria-pressed'), 'false')
  await riftsOverlay.click()
  assert.equal(await riftsOverlay.getAttribute('aria-pressed'), 'true')
  await clickSquare(4,13)
  await clickSquare(5,11)
  await waitText('.order-list','U0·T0 e1 → U0·T0 f3')
  await clickAction('undo')
  assert.equal(await page.locator('.order-list').count(),0)
  await clickSquare(4,13)
  await clickSquare(5,11)
  await finishRound(1)
  await startNext()
  await clickSquare(5,11)
  await press('Shift+ArrowLeft')
  await press('Alt+ArrowRight',2)
  await press('Enter')
  await waitText('.order-list','Historical branch')
  await finishRound(2)
  await waitText('#metrics','2 universes')
  await waitText('#activity','Created universe U1')
  await startNext()
  await finishRound(3,'pass')
  await startNext()
  await canvas.focus()
  await press('Shift+ArrowDown')
  await press('Alt+ArrowRight')
  await press('Alt+ArrowDown',5)
  await press('Enter')
  await waitText('#map-caption','Red Knight')
  await press('Shift+ArrowUp')
  await press('Shift+ArrowLeft',2)
  await press('Enter')
  await waitText('.order-list','U1·T2 h3 → U0·T0 h3')
  await finishRound(4)
  await waitText('#metrics','3 universes')
  await waitText('#metrics','1 rift')
  await page.getByRole('button',{name:'Previous round',exact:true}).click()
  await waitText('#phase','REPLAY')
  await page.getByRole('button',{name:'Play round'}).click()
  await waitText('#phase','RESOLVING')
  await waitText('#phase','REPLAY')
  await page.getByRole('button',{name:'Return to live'}).click()
  await page.reload()
  await waitText('#metrics','1 rift')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button',{name:'Export',exact:true}).click()
  const download = await downloadEvent
  const downloaded = await download.path()
  const saved = JSON.parse(await readFile(downloaded,'utf8'))
  assert.equal(saved.journal.length,4)
  assert.deepEqual(saved.journal[3][0].route,[1,0])
  const phone = await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true,reducedMotion:'reduce'})
  await phone.goto(base + '/chess/')
  await phone.locator('#import-file').setInputFiles({name:'game.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))})
  await phone.waitForFunction(() => document.querySelector('#metrics')?.textContent?.includes('1 rift'))
  assert.equal(await phone.locator('canvas').count(),1)
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth),393)
  assert.deepEqual(errors,[])
})
