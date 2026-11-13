import {initMatchUI, setMatchHeader} from './ui.ts'
import {Scene} from './scene.ts'
import {COLORS, NAMES, pieceIcon} from './art.ts'
import {
  type Candidate, type Coord, type Order, type Outcome, type Player, type State,
  type PlayerCount, coordKey, coordName, frontier, getBoard, getUniverse, index, isMain, moveBudget, pieceAt, playerCount, players, present, survivors
} from './model.ts'
import {legalMoves, routeKey} from './moves.ts'
import {sourceBudget} from './resolve.ts'
import {type Session, SAVE_KEY, commit, decode, encode, liveState, newSession, planner} from './session.ts'

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const dialog = element<HTMLDialogElement>('dialog')
const file = element<HTMLInputElement>('import-file')
const factionNames: Record<Player, string> = {red: 'Red', blue: 'Blue', yellow: 'Yellow', green: 'Green'}
const seats: Record<Player, string> = {red: 'South', blue: 'West', yellow: 'North', green: 'East'}
const motion = matchMedia('(prefers-reduced-motion: reduce)')
fetch('/api/me').then(r => r.ok ? r.json() : null).then(data => {
  if (!data?.user) return
  const link = element<HTMLAnchorElement>('account-link')
  link.textContent = 'Lobby'
  link.href = '/chess/lobby.html'
  if (!new URLSearchParams(location.search).has('local')) location.replace('/chess/lobby.html')
}).catch(() => {})
const requestedCount = new URLSearchParams(location.search).get('players')
let localMode: PlayerCount = new URLSearchParams(location.search).has('local') && ['2', '3', '4'].includes(requestedCount ?? '')
  ? Number(requestedCount) as PlayerCount : 4
const saveKey = (count: PlayerCount) => count === 4 ? SAVE_KEY : `${SAVE_KEY}/${count}`
let session = newSession(localMode)
let saveError = false
let restoreNotice = ''
try {
  const stored = localStorage.getItem(saveKey(localMode))
  if (stored) session = decode(stored)
} catch {
  restoreNotice = 'The previous save could not be restored.'
}
let frame: number | null = null
let revealing = false
let animation: {outcomes: readonly Outcome[]; started: number; duration: number} | undefined
let selected: Coord | undefined
let choices: Candidate[] = []
let hover: Candidate | undefined
let routeChoices: Candidate[] = []
let routeIndex = 0
let inspected: Coord | undefined
let caption = ''
let privacy = false

const scene = new Scene(element<HTMLCanvasElement>('scene'), liveState(session), {
  pick,
  hover(c) {
    if (routeChoices.length) return
    hover = c ? choices.find(m => coordKey(m.to) === coordKey(c)) : undefined
    syncScene()
    paintCaption()
  },
  scale(n) {
    const value = `${Math.round(n * 100)}%`
    if (element('scale').textContent !== value) element('scale').textContent = value
  },
  describe(c) {
    inspected = c
    const u = getUniverse(shown(), c.u)
    if (!u) return
    const p = getBoard(shown(), c)?.cells[index(c)]
    const historical = frontier(u).t !== c.t
    const status = historical ? 'History' : isMain(u, present(shown())) ? 'Present frontier' :
      u.active ? 'Future frontier · optional source' : 'Inactive frontier · optional source'
    caption = `${coordName(c, shown())} · ${status}${p ? ` · ${factionNames[p.player]} ${NAMES[p.kind]}` : ''}`
    paintCaption()
  },
  rift(a, b, from) {
    caption = `Temporal Rift U${a} ↔ U${b} · available from round ${from} · Queen, Bishop, Knight`
    paintCaption()
  }
})

function shown(): State {
  if (animation) return session.frames[(frame ?? session.results.length) - 1]
  return frame === null ? liveState(session) : session.frames[frame]
}
const planning = () => frame === null && !revealing && !animation && !privacy && !!planner(session)
const name = (p: Player) => factionNames[p]
const orderText = (o: Order) => `${coordName(o.from, shown())} → ${coordName(o.to, shown())}`
const preview = () => routeChoices[routeIndex] ?? hover
const phase = () => animation ? 'RESOLVING' : frame !== null ? 'REPLAY' :
  survivors(liveState(session)).length <= 1 ? 'GAME OVER' : revealing ? 'ROUND REVEAL' : 'PLANNING'

function save() {
  try {
    localStorage.setItem(saveKey(localMode), encode(session))
    saveError = false
    restoreNotice = ''
  } catch {
    saveError = true
  }
}
function currentDraft(): Candidate[] {
  if (!planning()) return []
  return session.draft.flatMap(o => legalMoves(shown(), o.from, o.to)
    .filter(m => routeKey(m.route) === routeKey(o.route)))
}
let draftForScene: Candidate[] = []
function syncScene() {
  scene.update({state: shown(), moves: choices, selected, preview: preview(), queued: draftForScene, animation})
}
function clearSelection() {
  selected = undefined
  choices = []
  hover = undefined
  routeChoices = []
  routeIndex = 0
}
function update() {
  draftForScene = currentDraft()
  syncScene()
  const s = shown()
  element('mode-label').textContent = `${playerCount(s) === 2 ? 'TWO' : playerCount(s) === 3 ? 'THREE' : 'FOUR'}-PLAYER`
  const playing = planner(session)
  const presentTime = present(s)
  const past = frame !== null
  const last = session.results.length
  const statePhase = phase()
  setMatchHeader(playing, `Round ${s.round}${session.draft.length ? ` · ${session.draft.length} queued` : ''} · ${statePhase.toLowerCase()}`)
  element('round-number').textContent = String(statePhase === 'PLANNING' || past || animation ? s.round : Math.max(1, s.round - 1)).padStart(2, '0')
  element('phase').textContent = statePhase
  element('metrics').innerHTML = `<span><i class="tiny-dot"></i> Present <b>T${presentTime}</b></span>
    <span><b>${s.universes.length}</b> ${s.universes.length === 1 ? 'universe' : 'universes'}</span>
    <span><b>${s.rifts.length}</b> ${s.rifts.length === 1 ? 'rift' : 'rifts'}</span>`
  element('factions').innerHTML = players(s).map(p => `<span class="faction ${s.eliminated.includes(p) ? 'dead' : ''} ${playing === p && statePhase === 'PLANNING' ? 'active' : ''}" style="--faction:${COLORS[p]}" title="${seats[p]}${s.eliminated.includes(p) ? ' · Eliminated' : ''}">
    <i></i><span>${name(p)}</span></span>`).join('')
  element('live-label').textContent = past ? '◌ REPLAY' : '● LIVE'
  element('history-label').textContent = !last ? 'Opening position' :
    past ? frame === 0 ? 'Opening position' : `After round ${frame} of ${last}` : `${last} ${last === 1 ? 'round' : 'rounds'} resolved`
  button('previous').disabled = !!animation || (frame ?? last + 1) <= 0 || !last
  button('next').disabled = !!animation || frame === null
  button('replay').disabled = !!animation || !(frame ?? last)
  button('live').disabled = !!animation || frame === null
  for (const id of ['export', 'import', 'new']) button(id).disabled = !!animation
  const status = restoreNotice || (saveError ? 'Autosave unavailable. Export a save to keep this game.' :
    'Autosave enabled · Stored on this device')
  element('save-status').textContent = status
  paintPanel()
  paintCaption()
}

function button(id: string) { return element<HTMLButtonElement>(id) }

function paintCaption() {
  const m = preview()
  const box = element('map-caption')
  if (m) {
    const tags = [m.branch ? 'BRANCH' : m.castle ? 'CASTLE' : 'MOVE', m.rift ? 'RIFT' : '', m.capture ? 'CAPTURE' : '', m.needsVacancy ? 'REQUIRES VACANCY' : ''].filter(Boolean)
    const route = m.route.map(u => `U${u}`).join(' → ')
    box.innerHTML = `<b>${tags.join(' · ')}</b><span>${orderText(m)}${m.route.length > 1 ? ` <em>via ${route}</em>` : ''}</span>`
  } else {
    box.innerHTML = `<b>CHRONOGRAPH</b><span></span>`
    box.lastElementChild!.textContent = caption || 'Space, time & branching universes'
  }
}

function paintPanel() {
  const turn = element('turn')
  const controls = element('planning')
  const activity = element('activity')
  const s = shown()
  const p = planner(session)
  const alive = survivors(s)
  if (!planning() || !p) {
    controls.innerHTML = ''
    activity.innerHTML = ''
    if (animation) {
      turn.innerHTML = '<div class="turn"><div class="turn-icon neutral">✧</div><div><h3>Orders revealed</h3><p>Resolving together</p></div></div>'
      return
    }
    if (frame !== null || revealing || alive.length <= 1) {
      const record = session.results[(frame ?? session.results.length) - 1]
      const title = alive.length === 0 ? 'Draw' : alive.length === 1 ? `${name(alive[0])} wins` :
        frame === 0 ? 'Opening position' : `Round ${frame ?? session.results.length} resolved`
      turn.innerHTML = `<div class="turn"><div class="turn-icon neutral">${alive.length === 1 ? pieceIcon('K', alive[0], 33) : '✧'}</div><div>
        <h3>${title}</h3><p>${frame !== null ? 'Inspect the multiverse in replay' : alive.length <= 1 ? 'The match is complete' : 'All factions resolved together'}</p></div></div>`
      if (record) {
        const moves = record.outcomes.map(outcomeText).join('')
        const dead = record.eliminated.map(name).join(', ')
        activity.innerHTML = `${dead ? `<div class="eliminations">Eliminated · ${dead}</div>` : ''}
          <div class="outcomes">${moves || '<div class="empty compact">All factions passed.</div>'}</div>`
      }
      if (frame === null && revealing && alive.length > 1) {
        controls.innerHTML = '<button class="button primary block" data-action="continue">Begin next round <span>→</span></button>'
      }
      return
    }
    turn.innerHTML = '<div class="turn"><div class="turn-icon neutral">✧</div><div><h3>Private planning</h3><p>Pass the device</p></div></div>'
    return
  }
  const budget = moveBudget(s)
  const main = session.draft.filter(o => isMain(getUniverse(s, o.from.u)!, present(s))).length
  const extra = session.draft.length - main
  const selectedPiece = selected ? pieceAt(s, selected) : null
  turn.innerHTML = `<div class="turn" style="--faction:${COLORS[p]}"><div class="turn-icon">${pieceIcon('K', p, 33)}</div>
    <div><h3>${name(p)} to plan</h3><p>${session.locked.length} of ${alive.length} players ready</p></div></div>`
  controls.innerHTML = `<div class="budget">
      <div><span>MAIN ORDERS</span><b>${budget.main - main}<small> / ${budget.main}</small></b></div>
      <div><span>OPTIONAL ORDER</span><b>${1 - extra}<small> / 1</small></b></div>
    </div>
    <div class="order-title"><h4>Queued orders <span>${session.draft.length}</span></h4><button class="text-button" data-action="clear" ${session.draft.length ? '' : 'disabled'}>Clear</button></div>
    ${draftForScene.length ? `<ol class="order-list">${draftForScene.map((o, i) => `<li>${pieceIcon(o.piece.kind, p, 21)}
      <button class="order-focus" data-focus-order="${i}" title="Focus source">${orderText(o)}<small>${o.rift ? 'Temporal Rift' : o.branch ? 'Historical branch' : o.castle ? 'Castling' : o.capture ? 'Capture' : 'Move'}</small></button>
      <button data-remove="${i}" class="order-remove" aria-label="Remove order ${i + 1}">×</button></li>`).join('')}</ol>` :
      `<div class="empty"><span>◇</span><p>${selectedPiece ? `Choose a highlighted destination.<small>${NAMES[selectedPiece.kind]} · ${choices.length} ${choices.length === 1 ? 'route' : 'routes'}</small>` :
        'Select a piece to plan a move.'}</p></div>`}
    ${routeChoices.length ? `<div class="route-choice"><span>ROUTE ${routeIndex + 1} / ${routeChoices.length}</span><button class="text-button" data-action="route">Cycle route</button>
      <button class="text-button" data-action="queue">Queue this route</button></div>` : ''}
    <button class="button primary block" data-action="lock">${session.draft.length ? 'Lock orders' : 'Lock in a pass'} <span>→</span></button>
    <div class="planning-links"><button class="text-button" data-action="undo" ${session.draft.length ? '' : 'disabled'}>↶ Undo</button>
    <button class="text-button" data-action="pass" ${session.draft.length ? 'disabled' : ''}>Pass round</button></div>`
  activity.innerHTML = ''
}

function outcomeText(o: Outcome) {
  const m = o.move
  let detail = o.status === 'contested' ? 'Contested · failed' : o.status === 'blocked' ? 'Blocked · failed' :
    o.branch !== undefined ? `Created universe U${o.branch}` : m.castle ? 'Castled' : 'Applied'
  if (o.captures.length) detail += ` · Captured ${o.captures.map(c => `${name(c.piece.player)} ${NAMES[c.piece.kind]}`).join(', ')}`
  return `<div class="outcome">${pieceIcon(m.piece.kind, m.player, 22)}<div><b>${orderText(m)}</b><small>${detail}</small></div></div>`
}

function queue(move: Candidate) {
  session.draft.push(move)
  clearSelection()
  caption = 'Order queued. The board stays frozen until reveal.'
  save()
  update()
}
function pick(c?: Coord) {
  if (!planning()) return
  if (c && selected && coordKey(c) !== coordKey(selected)) {
    const matches = choices.filter(m => coordKey(m.to) === coordKey(c))
    if (matches.length === 1) {queue(matches[0]); return}
    if (matches.length > 1) {
      routeChoices = matches
      routeIndex = 0
      hover = undefined
      update()
      return
    }
  }
  const wasSelected = !!(c && selected && coordKey(c) === coordKey(selected))
  clearSelection()
  if (c && !wasSelected && pieceAt(shown(), c)?.player === planner(session) && sourceBudget(shown(), c, session.draft)) {
    selected = c
    choices = legalMoves(shown(), c)
  }
  update()
}

function handoff() {
  const p = planner(session)
  if (!p) return
  privacy = true
  inspected = undefined
  clearSelection()
  caption = ''
  update()
  modal(`<div class="handoff-icon" style="--faction:${COLORS[p]}">${pieceIcon('K', p, 57)}</div>
    <p class="eyebrow">PRIVATE HANDOFF</p><h2>Pass to ${name(p)}</h2>
    <p>Hand the device to the ${name(p)} player. Locked orders stay hidden until the round resolves.</p>
    <button class="button primary block" data-dialog="ready">I’m ${name(p)} · Ready <span>→</span></button>`, true)
}

function animateRound(roundIndex: number, end: () => void) {
  const result = session.results[roundIndex - 1]
  if (!result) return
  clearSelection()
  caption = ''
  const duration = motion.matches ? 260 : 1350
  animation = {outcomes: result.outcomes, started: performance.now(), duration}
  update()
  if (result.outcomes.length) scene.fit()
  window.setTimeout(() => {
    animation = undefined
    end()
    update()
    if (!result.outcomes.length) scene.focusPlayer(planner(session))
    else if (result.state.universes.length < 6) scene.fit()
  }, duration + 30)
}

function lock() {
  if (!planning()) return
  clearSelection()
  const result = commit(session)
  save()
  if (!result) {handoff(); return}
  revealing = true
  animateRound(session.results.length, () => {})
}

function goTo(n: number | null) {
  if (animation) return
  frame = n
  inspected = undefined
  clearSelection()
  caption = ''
  update()
  if (frame !== null) scene.fit()
  else scene.focusPlayer(planner(session))
}

function modal(body: string, locked = false) {
  element('dialog-inner').innerHTML = body
  element('dialog-inner').querySelector('h2')?.setAttribute('id', 'dialog-title')
  dialog.dataset.locked = locked ? 'yes' : 'no'
  if (!dialog.open) dialog.showModal()
}
dialog.addEventListener('cancel', e => {
  if (dialog.dataset.locked === 'yes') e.preventDefault()
})
dialog.addEventListener('click', e => {
  const target = e.target as HTMLElement
  if (target === dialog && dialog.dataset.locked !== 'yes') dialog.close()
  const action = target.closest<HTMLElement>('[data-dialog]')?.dataset.dialog
  if (!action) return
  handleDialogAction(action)
})
function handleDialogAction(action: string) {
  if (action === 'ready') {
    privacy = false
    update()
    scene.focusPlayer(planner(session))
  }
  if (action === 'export') {
    const url = URL.createObjectURL(new Blob([encode(session)], {type: 'application/json'}))
    const a = document.createElement('a')
    a.href = url
    a.download = `multiverse-chess-round-${liveState(session).round}.json`
    a.hidden = true
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
  if (action === 'import') file.click()
  if (action === 'new') {
    modal(`<p class="eyebrow">NEW MATCH</p><h2>Start over?</h2><p>This replaces the current match and its autosave. Export the match first if you want to keep it.</p>
      <div class="dialog-row"><button class="button" data-dialog="close">Cancel</button><button class="button primary" data-dialog="reset">Start new match</button></div>`)
    return
  }
  if (action === 'reset') setSession(newSession(localMode), false)
  dialog.close()
}
file.addEventListener('change', async () => {
  const chosen = file.files?.[0]
  file.value = ''
  if (!chosen) return
  try {
    setSession(decode(await chosen.text()), true)
  } catch (error) {
    modal('<p class="eyebrow">IMPORT SAVE</p><h2>Could not open save</h2><p id="import-error"></p><button class="button primary block" data-dialog="close">Close</button>')
    element('import-error').textContent = error instanceof Error ? error.message : 'The save is invalid.'
  }
})
function setSession(next: Session, privateRestore: boolean) {
  session = next
  localMode = playerCount(liveState(next))
  if (privateRestore) history.replaceState(null, '', `/chess/?local=1&players=${localMode}`)
  revealing = false
  frame = null
  privacy = false
  inspected = undefined
  clearSelection()
  caption = ''
  save()
  update()
  scene.focusPlayer(planner(session))
  if (privateRestore && (session.locked.length || session.draft.length)) handoff()
}

element('planning').addEventListener('click', e => {
  const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!target) return
  const {action, remove, focusOrder} = target.dataset
  if (action === 'continue') {
    revealing = false
    handoff()
    return
  }
  if (!planning()) return
  if (action === 'lock' || action === 'pass') {lock(); return}
  if (action === 'route') {
    routeIndex = (routeIndex + 1) % routeChoices.length
    update()
    return
  }
  if (action === 'queue') {if (routeChoices[routeIndex]) queue(routeChoices[routeIndex]); return}
  if (focusOrder !== undefined) {
    const o = draftForScene[Number(focusOrder)]
    if (o) {
      clearSelection()
      hover = o
      scene.focus(o.from)
      update()
    }
    return
  }
  if (remove !== undefined) session.draft.splice(Number(remove), 1)
  else if (action === 'undo') session.draft.pop()
  else if (action === 'clear') session.draft = []
  else return
  clearSelection()
  caption = ''
  save()
  update()
})

button('previous').onclick = () => goTo(frame === null ? (revealing ? session.results.length : session.results.length - 1) : Math.max(0, frame - 1))
button('next').onclick = () => goTo(frame === null || frame >= session.results.length ? null : frame + 1)
button('live').onclick = () => goTo(null)
button('replay').onclick = () => {
  frame ??= session.results.length
  animateRound(frame, () => {})
}
element('viewport').querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b => b.onclick = () => {
  switch (b.dataset.camera) {
    case 'minus': scene.zoom(1 / 1.3, undefined, true); break
    case 'plus': scene.zoom(1.3, undefined, true); break
    case 'fit': scene.fit(); break
    case 'focus': scene.focus(selected ?? inspected); break
    case 'player': scene.focusPlayer(planner(session)); break
    case 'reset': scene.focusPlayer(); break
  }
})
for (const id of ['export', 'import', 'new']) button(id).onclick = () => handleDialogAction(id)
element('viewport').querySelectorAll<HTMLButtonElement>('[data-overlay]').forEach(control => {
  control.onclick = () => {
    const enabled = control.getAttribute('aria-pressed') !== 'true'
    control.setAttribute('aria-pressed', String(enabled))
    scene.setOverlay(control.dataset.overlay!, enabled)
  }
})
initMatchUI()
button('help').onclick = () => modal(`<p class="eyebrow">FIELD GUIDE</p><h2>How to play</h2>
  <div class="guide">
    <p><b>Plan in private.</b> Select one of your pieces, choose a highlighted square, and lock your orders. Pass the device to the next faction.</p>
    <p><b>Move through four dimensions.</b> Rooks use one axis, bishops two, and queens up to four. Sliding distances must match on every axis used. Knights jump two along one axis and one along another. Kings step at most one on each axis.</p>
    <p><b>Follow the tree.</b> Parent–child edges count as one universe step. Queens, bishops, and knights may use one purple Rift per move. Pawns push toward the center or down to child universes. They capture diagonally in space or along one child edge plus one time step.</p>
    <p><b>Rewrite the past.</b> A blue arrival forks a historical board. Its original future remains intact. Active frontiers at the Present advance each round, even if everyone passes. A future or inactive frontier can supply one optional order.</p>
    <p><b>Capture a king.</b> An enemy that moves away successfully escapes. Orders that claim the same resulting square fail together. Capturing any king eliminates its faction. The final surviving faction wins.</p>
    <p><b>Navigate.</b> Drag, WASD, or arrow keys to pan. Scroll, pinch, or use +/− to zoom. Alt + arrows moves a square cursor, Shift + arrows moves between board nodes, and Enter selects.</p>
  </div><button class="button primary block" data-dialog="close">Back to the board</button>`)

update()
if (session.locked.length || session.draft.length) handoff()
