import {Scene} from './scene.ts'
import {NAMES} from './art.ts'
import {type Candidate, type Coord, type Order, type Player, type Resolution, type State,
  PLAYERS, coordKey, coordName, getUniverse, initialState, isMain, moveBudget, pieceAt, present, survivors} from './model.ts'
import {legalMoves, routeKey} from './moves.ts'
import {sourceBudget} from './resolve.ts'

type Room = {code: string; title: string; seats: Partial<Record<Player, string>>; seat?: Player;
  state: State; results: Resolution[]; journal: Order[][]; locked: Record<Player, boolean>;
  waiting: boolean; finished: boolean}
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const code = new URLSearchParams(location.search).get('code')?.toUpperCase()
if (!code || !/^[A-Z]{4}$/.test(code)) location.replace('/chess/lobby.html')
let room: Room | undefined
let frame: number | null = null
let selected: Coord | undefined
let choices: Candidate[] = []
let hover: Candidate | undefined
let routes: Candidate[] = []
let routeIndex = 0
let draft: Candidate[] = []
let caption = ''
let first = true
let loading = false
const names: Record<Player, string> = {red:'Red',blue:'Blue',yellow:'Yellow',green:'Green'}
const opening = initialState()
const scene = new Scene(element<HTMLCanvasElement>('scene'), opening, {
  pick,
  hover(c) {
    if (routes.length) return
    hover = c ? choices.find(m => coordKey(m.to) === coordKey(c)) : undefined
    sync()
  },
  scale(n) { element('scale').textContent = `${Math.round(n * 100)}%` },
  describe(c) {
    if (!room) return
    const piece = pieceAt(shown(), c)
    caption = `${coordName(c)}${piece ? ` · ${names[piece.player]} ${NAMES[piece.kind]}` : ''}`
    element('map-caption').textContent = caption
  },
  rift(a, b, from) { element('map-caption').textContent = `Rift U${a} ↔ U${b} · from round ${from}` }
})
function shown() { return frame === null ? room!.state : frame === 0 ? opening : room!.results[frame - 1].state }
const canPlan = () => !!room && frame === null && !room.waiting && !room.finished &&
  !!room.seat && survivors(room.state).includes(room.seat) && !room.locked[room.seat]
const preview = () => routes[routeIndex] ?? hover
function sync() {
  if (!room) return
  scene.update({state:shown(), moves:canPlan() ? choices : [], selected, preview:preview(), queued:draft})
}
function clear() { selected = undefined; choices = []; hover = undefined; routes = []; routeIndex = 0 }
function pick(c?: Coord) {
  if (!canPlan() || !room?.seat) return
  if (c && selected && coordKey(c) !== coordKey(selected)) {
    const matches = choices.filter(m => coordKey(m.to) === coordKey(c))
    if (matches.length === 1) { queue(matches[0]); return }
    if (matches.length > 1) { routes = matches; routeIndex = 0; render(); return }
  }
  const same = !!(c && selected && coordKey(c) === coordKey(selected))
  clear()
  if (c && !same && pieceAt(room.state, c)?.player === room.seat && sourceBudget(room.state, c, draft)) {
    selected = c
    choices = legalMoves(room.state, c)
  }
  render()
}
function queue(move: Candidate) { draft.push(move); clear(); render() }
function message(text: string, problem = false) {
  const box = element('activity')
  box.className = problem ? 'form-error' : 'online-message'
  box.textContent = text
}
function render() {
  if (!room) return
  element('game-code').textContent = room.code
  element('game-title').textContent = room.title
  document.title = `${room.title} · Multiverse Chess`
  const seat = room.seat
  const s = shown()
  element('phase').textContent = room.finished ? 'FINISHED' : room.waiting ? 'WAITING' : frame !== null ? 'REPLAY' :
    seat && room.locked[seat] ? 'LOCKED' : 'PLANNING'
  element('metrics').textContent = `Present T${present(s)} · ${s.universes.length} universes · ${s.rifts.length} rifts`
  const seats = element('seats')
  seats.replaceChildren(...PLAYERS.map(player => {
    const span = document.createElement('span')
    span.className = `${player === seat ? 'self' : ''} ${room!.locked[player] ? 'locked' : ''}`
    span.textContent = `${names[player]}: ${room!.seats[player] || 'Open'}${room!.locked[player] ? ' ✓' : ''}`
    return span
  }))
  const last = room.results.length
  element('history-label').textContent = frame === null ? `${last} rounds resolved` : frame ? `After round ${frame}` : 'Opening position'
  element<HTMLButtonElement>('previous').disabled = !last || frame === 0
  element<HTMLButtonElement>('next').disabled = frame === null
  element<HTMLButtonElement>('live').disabled = frame === null
  const turn = element('turn')
  turn.replaceChildren()
  const head = document.createElement('div')
  head.className = 'turn'
  const title = document.createElement('h3')
  title.textContent = seat ? `${names[seat]} · ${room.seats[seat]}` : 'Spectating'
  head.append(title)
  turn.append(head)
  const panel = element('planning')
  panel.replaceChildren()
  if (room.waiting) {
    const p = document.createElement('p')
    p.className = 'online-message'
    p.textContent = `Share code ${room.code} with friends. ${Object.keys(room.seats).length}/4 players joined. ${room.seats.red ? 'The game starts when all four seats are filled.' : ''}`
    panel.append(p)
  } else if (room.finished) {
    const alive = survivors(room.state)
    const p = document.createElement('p')
    p.className = 'online-message'
    p.textContent = alive.length === 1 ? `${names[alive[0]]} wins.` : 'The game ended in a draw.'
    panel.append(p)
  } else if (frame !== null) {
    const p = document.createElement('p'); p.className = 'online-message'; p.textContent = 'Viewing an earlier round.'; panel.append(p)
  } else if (seat && room.locked[seat]) {
    const p = document.createElement('p'); p.className = 'online-message'; p.textContent = 'Orders locked. Waiting for the other players. There is no turn timer.'; panel.append(p)
  } else if (canPlan()) {
    const budget = moveBudget(room.state)
    const main = draft.filter(o => isMain(getUniverse(room!.state, o.from.u)!, present(room!.state))).length
    const count = document.createElement('p')
    count.className = 'online-message'
    count.textContent = `Main orders: ${budget.main - main}/${budget.main} · Optional: ${1 - (draft.length - main)}/1`
    panel.append(count)
    for (const [i, order] of draft.entries()) {
      const row = document.createElement('div'); row.className = 'game-row'
      const label = document.createElement('span'); label.textContent = `${coordName(order.from)} → ${coordName(order.to)}`
      const remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = 'Remove'
      remove.onclick = () => {draft.splice(i, 1); render()}
      row.append(label, remove); panel.append(row)
    }
    if (routes.length) {
      const cycle = document.createElement('button'); cycle.className = 'button'; cycle.textContent = `Cycle route ${routeIndex + 1}/${routes.length}`
      cycle.onclick = () => {routeIndex = (routeIndex + 1) % routes.length; render()}
      const select = document.createElement('button'); select.className = 'button'; select.textContent = 'Queue route'
      select.onclick = () => queue(routes[routeIndex])
      panel.append(cycle, select)
    }
    const lock = document.createElement('button'); lock.className = 'button primary block'; lock.textContent = draft.length ? 'Lock orders' : 'Lock in a pass'
    lock.onclick = () => void submit()
    panel.append(lock)
  }
  if (!element('activity').textContent) message('The game updates automatically when others join or finish planning.')
  sync()
}
async function load() {
  if (loading) return
  loading = true
  try {
    const response = await fetch(`/api/games/${code}`)
    if (response.status === 401) { location.replace('/chess/login.html'); return }
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not load game')
    const oldRound = room?.state.round
    room = data as Room
    if (oldRound && oldRound !== room.state.round) { draft = []; clear(); frame = null; message(`Round ${oldRound} resolved. Plan the next round.`) }
    render()
    if (first) { first = false; scene.focusPlayer(room.seat, false) }
  } catch (cause) { message(cause instanceof Error ? cause.message : 'Could not load game', true) }
  finally { loading = false }
}
async function submit() {
  if (!canPlan()) return
  try {
    const response = await fetch(`/api/games/${code}/orders`, {method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({orders:draft.map(({player, from, to, route}) => ({player, from, to, route}))})})
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not lock orders')
    room = data as Room
    draft = []; clear(); message('Orders locked. Waiting for the others.'); render()
  } catch (cause) { message(cause instanceof Error ? cause.message : 'Could not lock orders', true) }
}
element<HTMLButtonElement>('previous').onclick = () => { if (!room?.results.length) return; frame = Math.max(0, (frame ?? room.results.length) - 1); clear(); render() }
element<HTMLButtonElement>('next').onclick = () => { if (frame === null || !room) return; frame = frame >= room.results.length ? null : frame + 1; clear(); render() }
element<HTMLButtonElement>('live').onclick = () => { frame = null; clear(); render() }
element('viewport').querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(button => button.onclick = () => {
  switch (button.dataset.camera) {
    case 'minus': scene.zoom(1 / 1.3, undefined, true); break
    case 'plus': scene.zoom(1.3, undefined, true); break
    case 'fit': scene.fit(); break
    case 'focus': scene.focus(); break
    case 'player': scene.focusPlayer(room?.seat); break
  }
})
element('viewport').querySelectorAll<HTMLButtonElement>('[data-overlay]').forEach(button => button.onclick = () => {
  const enabled = button.getAttribute('aria-pressed') !== 'true'
  button.setAttribute('aria-pressed', String(enabled))
  scene.setOverlay(button.dataset.overlay!, enabled)
})
const panel = element('sidebar'), handle = element('panel-handle')
handle.addEventListener('pointerdown', event => {
  const rect = panel.getBoundingClientRect(), dx = event.clientX - rect.left, dy = event.clientY - rect.top
  handle.setPointerCapture(event.pointerId)
  const move = (e: PointerEvent) => {
    panel.style.left = `${Math.max(0, Math.min(window.innerWidth - rect.width, e.clientX - dx))}px`
    panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 55, e.clientY - dy))}px`
    panel.style.right = 'auto'
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', move), {once:true})
})
void load()
window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 3000)
