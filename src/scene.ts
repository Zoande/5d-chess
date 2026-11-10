import {
  type Candidate, type Coord, type Order, type Outcome, type Player, type State, type Universe,
  SIZE, boardBounds, boardKey, coordKey, frontier, getUniverse, index, insideState, isMain, pieceAt, playerCount, present, squares
} from './model.ts'
import {COLORS, drawPiece} from './art.ts'

interface Point {x: number; y: number}
interface Camera extends Point {scale: number}
interface Node extends Point {u: Universe; t: number; size: number; front: boolean}
interface Layout {rows: Map<number, number>; nodes: Map<string, Node>; width: number; height: number}
interface Display {
  state: State
  moves: readonly Candidate[]
  queued: readonly Order[]
  selected?: Coord
  preview?: Candidate
  animation?: {outcomes: readonly Outcome[]; started: number; duration: number}
}

const BOARD = 448
const TIME = 616
const ROW = 568
const MIN_SCALE = .015
const MAX_SCALE = 3.5
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const pathColors = {normal: '#79dfb4', capture: '#ff8582', branch: '#83b4ff', rift: '#c99dff', gold: '#f0cc83'}
const ease = (p: number) => p * p * (3 - 2 * p)
const colorOf = (m: Candidate) => m.rift ? pathColors.rift : m.branch ? pathColors.branch :
  m.capture ? pathColors.capture : m.needsVacancy ? pathColors.gold : pathColors.normal
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))

function layoutOf(s: State): Layout {
  const kids = Map.groupBy(s.universes, u => u.parent)
  const rows = new Map<number, number>()
  const stack = [...(kids.get(null) ?? [])].reverse()
  while (stack.length) {
    const u = stack.pop()!
    rows.set(u.id, rows.size)
    for (const child of [...(kids.get(u.id) ?? [])].reverse()) stack.push(child)
  }
  const nodes = new Map<string, Node>()
  let maxTime = 0
  for (const u of s.universes) {
    const y = rows.get(u.id)! * ROW
    const end = frontier(u).t
    maxTime = Math.max(maxTime, end)
    for (const b of u.boards) {
      const front = b.t === end
      const node = {u, t: b.t, x: b.t * TIME, y, size: front ? BOARD : BOARD * .85, front}
      nodes.set(boardKey({u: u.id, t: b.t}), node)
    }
  }
  return {rows, nodes, width: maxTime * TIME, height: (rows.size - 1) * ROW}
}

export class Scene {
  private ctx: CanvasRenderingContext2D
  private layout: Layout
  private view: Display
  private camera: Camera = {x: 0, y: 0, scale: 1}
  private motion?: {start: Camera; end: Camera; time: number}
  private width = 1
  private height = 1
  private ratio = 1
  private frame = 0
  private freshSize = true
  private pointers = new Map<number, Point>()
  private press?: {start: Point; moved: boolean}
  private keyboard?: Coord
  private inspected?: Coord
  private targets = new Map<string, Candidate>()
  private targetBoards = new Map<string, string>()
  private hover?: Coord
  private animatedDepartures = new Set<string>()
  private overlays: Record<string, boolean> = {axes: true, links: true, rifts: true, labels: true, paths: true}
  private panKeys = new Set<string>()
  private panVelocity: Point = {x: 0, y: 0}
  private lastFrame = 0

  setOverlay(name: string, enabled: boolean) { this.overlays[name] = enabled; this.request() }

  constructor(private canvas: HTMLCanvasElement, state: State,
    private callbacks: {pick(c?: Coord): void; hover(c?: Coord): void; scale(scale: number): void;
      describe(c: Coord): void; rift(a: number, b: number, usableFrom: number): void}) {
    this.ctx = canvas.getContext('2d')!
    this.view = {state, moves: [], queued: []}
    this.layout = layoutOf(state)
    new ResizeObserver(() => this.resize()).observe(canvas)
    canvas.addEventListener('wheel', e => {
      e.preventDefault()
      this.zoom(Math.exp(-e.deltaY * (e.deltaMode === 1 ? .042 : .0018)), this.point(e))
    }, {passive: false})
    canvas.addEventListener('pointerdown', e => this.down(e))
    canvas.addEventListener('pointermove', e => this.move(e))
    canvas.addEventListener('pointerup', e => this.up(e, false))
    canvas.addEventListener('pointercancel', e => this.up(e, true))
    canvas.addEventListener('pointerleave', () => { if (!this.pointers.size) this.updateHover() })
    canvas.addEventListener('keydown', e => this.key(e))
    canvas.addEventListener('keyup', e => { this.panKeys.delete(e.key.toLowerCase()); this.request() })
    canvas.addEventListener('blur', () => {this.keyboard = undefined; this.panKeys.clear(); this.request()})
  }

  update(view: Display) {
    if (view.state !== this.view.state) this.layout = layoutOf(view.state)
    if (view.moves !== this.view.moves) {
      this.targets.clear()
      this.targetBoards.clear()
      for (const m of view.moves) {
        const key = coordKey(m.to)
        if (!this.targets.has(key)) this.targets.set(key, m)
        const board = boardKey(m.to)
        if (!this.targetBoards.has(board) || m.rift || m.branch) this.targetBoards.set(board, colorOf(m))
      }
    }
    if (view.animation !== this.view.animation) {
      this.animatedDepartures.clear()
      for (const out of view.animation?.outcomes ?? []) {
        if (out.status !== 'applied') continue
        this.animatedDepartures.add(coordKey(out.move.from))
        if (out.move.castle) this.animatedDepartures.add(coordKey(out.move.castle.from))
      }
    }
    this.view = view
    this.request()
  }

  private resize() {
    const {width, height} = this.canvas.getBoundingClientRect()
    this.width = width
    this.height = height
    this.ratio = Math.min(devicePixelRatio || 1, 2)
    this.canvas.width = Math.max(1, Math.round(width * this.ratio))
    this.canvas.height = Math.max(1, Math.round(height * this.ratio))
    if (this.freshSize) {
      this.freshSize = false
      this.focusPlayer(undefined, false)
    }
    this.request()
  }

  private point(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect()
    return {x: e.clientX - rect.left, y: e.clientY - rect.top}
  }

  private world(point: Point): Point {
    return {x: this.camera.x + (point.x - this.width / 2) / this.camera.scale,
      y: this.camera.y + (point.y - this.height / 2) / this.camera.scale}
  }

  private dimensions(size: number) {
    const bounds = boardBounds(this.view.state)
    const tile = size / SIZE
    return {...bounds, tile, width: (bounds.maxX - bounds.minX + 1) * tile,
      height: (bounds.maxY - bounds.minY + 1) * tile}
  }

  private hit(point: Point, allowFrame = false): Coord | undefined {
    const w = this.world(point)
    const t = Math.round(w.x / TIME)
    const row = Math.round(w.y / ROW)
    const u = [...this.layout.rows].find(([, n]) => n === row)?.[0]
    if (u === undefined) return
    const node = this.layout.nodes.get(boardKey({u, t}))
    if (!node) return
    const d = this.dimensions(node.size)
    const x = Math.floor((w.x - node.x + d.width / 2) / d.tile) + d.minX
    const y = Math.floor((w.y - node.y + d.height / 2) / d.tile) + d.minY
    if (insideState(this.view.state, {x, y})) return {x, y, u, t}
    if (allowFrame && x >= d.minX - 1 && x <= d.maxX + 1 && y >= d.minY - 2 && y <= d.maxY + 1)
      return {x: Math.floor((d.minX + d.maxX) / 2), y: Math.floor((d.minY + d.maxY) / 2), u, t}
  }

  private riftAt(point: Point) {
    const w = this.world(point)
    const tolerance = 9 / this.camera.scale
    for (const r of this.view.state.rifts) {
      const arc = this.riftArc(r.a, r.b)
      if (!arc) continue
      const [a, b, c, d] = arc
      for (let i = 0; i <= 48; i++) {
        const t = i / 48, v = 1 - t
        const x = v ** 3 * a.x + 3 * v * v * t * b.x + 3 * v * t * t * c.x + t ** 3 * d.x
        const y = v ** 3 * a.y + 3 * v * v * t * b.y + 3 * v * t * t * c.y + t ** 3 * d.y
        if (Math.hypot(x - w.x, y - w.y) <= tolerance) return r
      }
    }
  }

  private down(e: PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return
    this.canvas.setPointerCapture(e.pointerId)
    this.motion = undefined
    const point = this.point(e)
    if (!this.pointers.size) this.press = {start: point, moved: e.button === 1}
    this.pointers.set(e.pointerId, point)
    if (this.pointers.size > 1 && this.press) this.press.moved = true
  }

  private move(e: PointerEvent) {
    const point = this.point(e)
    const previous = this.pointers.get(e.pointerId)
    if (!previous || !this.press) {
      this.updateHover(this.hit(point))
      this.canvas.style.cursor = this.hover ? 'pointer' : this.riftAt(point) ? 'help' : 'grab'
      return
    }
    this.pointers.set(e.pointerId, point)
    const other = [...this.pointers].find(([id]) => id !== e.pointerId)?.[1]
    if (other) {
      const previousDistance = Math.hypot(previous.x - other.x, previous.y - other.y)
      const distance = Math.hypot(point.x - other.x, point.y - other.y)
      this.pan((point.x - previous.x) / 2, (point.y - previous.y) / 2)
      this.zoom(distance / Math.max(1, previousDistance), {x: (point.x + other.x) / 2, y: (point.y + other.y) / 2})
      return
    }
    if (!this.press.moved && Math.hypot(point.x - this.press.start.x, point.y - this.press.start.y) > 5) {
      this.press.moved = true
      this.updateHover()
    }
    if (this.press.moved) {
      this.canvas.style.cursor = 'grabbing'
      this.pan(point.x - previous.x, point.y - previous.y)
    }
  }

  private up(e: PointerEvent, cancelled: boolean) {
    this.pointers.delete(e.pointerId)
    if (this.pointers.size) return
    const point = this.point(e)
    if (this.press && !this.press.moved && !cancelled) {
      this.keyboard = undefined
      const hit = this.hit(point)
      if (hit) this.pick(hit)
      else {
        const r = this.riftAt(point)
        if (r) this.callbacks.rift(r.a, r.b, r.usableFrom)
        else {
          const frame = this.hit(point, true)
          if (frame) {this.inspected = frame; this.callbacks.describe(frame)}
          else this.callbacks.pick()
        }
      }
    }
    this.press = undefined
    this.canvas.style.cursor = 'grab'
  }

  private pick(c: Coord) {
    this.inspected = c
    this.callbacks.pick(c)
    this.callbacks.describe(c)
  }

  private updateHover(c?: Coord) {
    if ((!c && !this.hover) || (c && this.hover && coordKey(c) === coordKey(this.hover))) return
    this.hover = c
    this.callbacks.hover(c)
    this.request()
  }

  private pan(x: number, y: number) {
    this.motion = undefined
    this.camera.x -= x / this.camera.scale
    this.camera.y -= y / this.camera.scale
    this.request()
  }

  zoom(factor: number, anchor = {x: this.width / 2, y: this.height / 2}, smooth = false) {
    this.motion = undefined
    const w = this.world(anchor)
    const scale = clamp(this.camera.scale * factor, MIN_SCALE, MAX_SCALE)
    const end = {scale, x: w.x - (anchor.x - this.width / 2) / scale,
      y: w.y - (anchor.y - this.height / 2) / scale}
    this.center(end, smooth)
  }

  private center(end: Camera, smooth = true) {
    this.motion = smooth && !reduced.matches ? {start: {...this.camera}, end, time: performance.now()} : undefined
    if (!this.motion) this.camera = end
    this.request()
  }

  fit() {
    const {width, height} = this.layout
    const d = this.dimensions(BOARD)
    this.center({x: width / 2, y: height / 2, scale: clamp(
      Math.min((this.width - 40) / (width + d.width + 52), (this.height - 54) / (height + d.height + 102)), MIN_SCALE, 1.38)})
  }

  focus(c = this.view.selected ?? this.inspected) {
    if (c && this.layout.nodes.has(boardKey(c))) this.focusBoard(c.u, c.t)
    else this.focusPlayer()
  }

  focusBoard(u: number, t: number, smooth = true) {
    const node = this.layout.nodes.get(boardKey({u, t}))
    if (!node) return
    const d = this.dimensions(node.size)
    const scale = clamp(Math.min((this.width - 48) / d.width, (this.height - 154) / d.height), .2, 1.62)
    this.center({x: node.x, y: node.y + 2, scale}, smooth)
  }

  focusPlayer(player?: Player, smooth = true) {
    const s = this.view.state
    const now = present(s)
    const main = s.universes.filter(u => isMain(u, now))
    const has = (u: Universe) => player && frontier(u).cells.some(p => p?.player === player)
    const u = main.find(has) ?? s.universes.find(has) ?? main[0] ?? s.universes[0]
    const t = frontier(u).t
    this.inspected = {x: 6, y: 6, u: u.id, t}
    this.keyboard = undefined
    this.focusBoard(u.id, t, smooth)
  }

  private key(e: KeyboardEvent) {
    const key = e.key.toLowerCase()
    const panKey = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)
    if (panKey && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      this.motion = undefined
      if (!this.panKeys.has(key)) {
        this.panVelocity.x += (key === 'd' || key === 'arrowright' ? 1 : key === 'a' || key === 'arrowleft' ? -1 : 0) * 120
        this.panVelocity.y += (key === 's' || key === 'arrowdown' ? 1 : key === 'w' || key === 'arrowup' ? -1 : 0) * 120
      }
      this.panKeys.add(key)
      this.request()
      e.preventDefault()
      return
    }
    if (key === 'f') this.fit()
    else if (key === 'z') this.focus()
    else if (key === '0') this.focusPlayer()
    else if (key === '+' || key === '=') this.zoom(1.3, undefined, true)
    else if (key === '-') this.zoom(1 / 1.3, undefined, true)
    else if (key === 'escape') this.callbacks.pick()
    else if (key === 'enter' || key === ' ') {
      const at = this.keyboard ?? this.inspected
      if (at) this.pick(at)
    } else if (key.startsWith('arrow') && (e.shiftKey || e.altKey)) {
      const s = this.view.state
      const u = s.universes.find(u => isMain(u, present(s)))!
      const anchor = this.view.selected ?? this.inspected
      const start = this.keyboard ?? (anchor && this.layout.nodes.has(boardKey(anchor)) ? anchor :
        {x: 6, y: 6, u: u.id, t: frontier(u).t})
      const dx = key === 'arrowleft' ? -1 : key === 'arrowright' ? 1 : 0
      const dy = key === 'arrowup' ? -1 : key === 'arrowdown' ? 1 : 0
      if (e.shiftKey) {
        const nextU = dy ? [...this.layout.rows].find(([, n]) => n === this.layout.rows.get(start.u)! + dy)?.[0] : start.u
        if (nextU !== undefined) {
          const line = getUniverse(s, nextU)!
          const nextT = dy ? clamp(start.t, line.boards[0].t, frontier(line).t) : start.t + dx
          if (this.layout.nodes.has(boardKey({u: nextU, t: nextT}))) {
            this.keyboard = {...start, u: nextU, t: nextT}
          }
        }
      } else {
        const next = {...start, x: start.x + dx, y: start.y + dy}
        this.keyboard = insideState(this.view.state, next) ? next : start
      }
      this.keyboard ??= start
      this.callbacks.describe(this.keyboard)
      this.callbacks.hover(this.keyboard)
      const p = this.squarePoint(this.keyboard)
      if (Math.abs(p.x - this.camera.x) * this.camera.scale > this.width * .43 ||
        Math.abs(p.y - this.camera.y) * this.camera.scale > this.height * .40) {
        this.focusBoard(this.keyboard.u, this.keyboard.t)
      }
      this.request()
    } else return
    e.preventDefault()
  }

  private request() {
    if (!this.frame) this.frame = requestAnimationFrame(now => this.render(now))
  }

  private render(now: number) {
    this.frame = 0
    const dt = Math.min(0.05, this.lastFrame ? (now - this.lastFrame) / 1000 : 0)
    this.lastFrame = now
    if (this.motion) {
      const {start, end, time} = this.motion
      const p = ease(clamp((now - time) / 290, 0, 1))
      this.camera = {x: start.x + (end.x - start.x) * p, y: start.y + (end.y - start.y) * p,
        scale: start.scale * (end.scale / start.scale) ** p}
      if (p === 1) this.motion = undefined
      else this.request()
    }
    const direction = {
      x: Number(this.panKeys.has('d') || this.panKeys.has('arrowright')) - Number(this.panKeys.has('a') || this.panKeys.has('arrowleft')),
      y: Number(this.panKeys.has('s') || this.panKeys.has('arrowdown')) - Number(this.panKeys.has('w') || this.panKeys.has('arrowup'))
    }
    const length = Math.hypot(direction.x, direction.y) || 1
    const response = 1 - Math.exp(-dt * (this.panKeys.size ? 14 : 10))
    this.panVelocity.x += (direction.x / length * 540 - this.panVelocity.x) * response
    this.panVelocity.y += (direction.y / length * 540 - this.panVelocity.y) * response
    if (Math.hypot(this.panVelocity.x, this.panVelocity.y) > 0.5) {
      this.camera.x += this.panVelocity.x * dt / this.camera.scale
      this.camera.y += this.panVelocity.y * dt / this.camera.scale
      this.request()
    } else this.panVelocity = {x: 0, y: 0}
    this.callbacks.scale(this.camera.scale)
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    const k = this.camera.scale * this.ratio
    ctx.setTransform(k, 0, 0, k, this.canvas.width / 2 - this.camera.x * k, this.canvas.height / 2 - this.camera.y * k)
    const s = this.view.state
    const current = present(s)
    const selectedPreview = this.view.preview
    const low = this.world({x: 0, y: 0}), high = this.world({x: this.width, y: this.height})
    if (this.overlays.axes) this.drawAxes(current, low, high)
    if (this.overlays.links || this.overlays.rifts) this.drawConnections(s, selectedPreview)
    for (const node of this.layout.nodes.values()) {
      const d = this.dimensions(node.size)
      if (node.x + d.width / 2 + 65 < low.x || node.x - d.width / 2 - 65 > high.x ||
        node.y + d.height / 2 + 65 < low.y || node.y - d.height / 2 - 65 > high.y) continue
      this.drawBoard(node, current)
    }
    for (const order of this.overlays.paths ? this.view.queued : []) {
      const move = order as Candidate
      if (move.path) this.drawPath(move, COLORS[move.player], .54, true)
    }
    if (selectedPreview && this.overlays.paths) this.drawPath(selectedPreview, pathColors.gold, .93, false)
    if (this.view.animation) {
      const {outcomes, started, duration} = this.view.animation
      const p = clamp((now - started) / duration, 0, 1)
      this.drawAnimation(outcomes, p)
      if (p < 1) this.request()
    }
  }

  private drawAxes(current: number, low: Point, high: Point) {
    const ctx = this.ctx
    const x = current * TIME
    const d = this.dimensions(BOARD)
    const top = -d.height / 2 - 40
    const bottom = Math.max(d.height / 2 + 36, this.layout.height + d.height / 2 + 36)
    ctx.fillStyle = '#78cdb00c'
    ctx.fillRect(x - d.width / 2 - 38, Math.min(top, low.y), d.width + 76, Math.max(bottom, high.y) - Math.min(top, low.y))
    ctx.strokeStyle = '#77cfa72e'
    ctx.setLineDash([4, 8])
    ctx.lineWidth = 1.2
    for (const edge of [x - d.width / 2 - 38, x + d.width / 2 + 38]) {
      ctx.beginPath(); ctx.moveTo(edge, low.y); ctx.lineTo(edge, high.y); ctx.stroke()
    }
    ctx.setLineDash([])
    if (this.camera.scale < .20) return
    ctx.font = '650 12px ui-monospace, monospace'
    ctx.textAlign = 'center'
    for (let t = Math.max(0, Math.floor(low.x / TIME)); t <= Math.min(this.layout.width / TIME, Math.ceil(high.x / TIME)); t++) {
      const col = t * TIME
      if (t === current) {
        ctx.fillStyle = '#18342c'
        ctx.beginPath(); ctx.roundRect(col - 63, top - 13, 126, 24, 5); ctx.fill()
      }
      ctx.fillStyle = t === current ? '#a8f4cf' : '#a2acb5'
      ctx.fillText(t === current ? `◆ PRESENT · T${t}` : `TIME · T${t}`, col, top + 3)
    }
  }

  private drawConnections(s: State, preview?: Candidate) {
    const ctx = this.ctx
    for (const u of s.universes) {
      if (!this.overlays.links) break
      const first = this.layout.nodes.get(boardKey({u: u.id, t: u.boards[0].t}))!
      const end = this.layout.nodes.get(boardKey({u: u.id, t: frontier(u).t}))!
      const selectedEdge = (a: number, b: number) => preview?.route.some((id, i, path) =>
        i > 0 && ((id === a && path[i - 1] === b) || (id === b && path[i - 1] === a)))
      ctx.lineWidth = 2.2
      ctx.strokeStyle = u.active ? '#68a88b75' : '#66838e47'
      ctx.setLineDash(u.active ? [] : [8, 8])
      ctx.beginPath(); ctx.moveTo(first.x, first.y); ctx.lineTo(end.x, end.y); ctx.stroke()
      if (u.parent !== null) {
        const parent = this.layout.nodes.get(boardKey({u: u.parent, t: u.divergence}))!
        const chosen = selectedEdge(u.parent, u.id)
        ctx.strokeStyle = chosen ? pathColors.gold : u.active ? '#75cba18a' : '#66838e70'
        ctx.lineWidth = chosen ? 4 : 2.6
        ctx.beginPath()
        ctx.moveTo(parent.x + this.dimensions(parent.size).width / 2, parent.y)
        ctx.bezierCurveTo(parent.x + TIME * .62, parent.y, first.x - TIME * .60, first.y,
          first.x - this.dimensions(first.size).width / 2, first.y)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }
    if (!this.overlays.rifts) return
    for (const r of s.rifts) {
      const arc = this.riftArc(r.a, r.b)
      if (!arc) continue
      const i = preview?.route.findIndex((u, i, path) => i > 0 &&
        ((u === r.a && path[i - 1] === r.b) || (u === r.b && path[i - 1] === r.a))) ?? -1
      const selected = preview?.rift && i >= 0
      const capable = this.view.selected && ['Q', 'B', 'N'].includes(pieceAt(s, this.view.selected)?.kind ?? '')
      ctx.strokeStyle = selected ? pathColors.rift : capable ? '#ae83eeaf' : '#ae83ee71'
      ctx.lineWidth = selected ? 4.5 : 2.8
      ctx.setLineDash([9, 9])
      ctx.beginPath()
      ctx.moveTo(arc[0].x, arc[0].y)
      ctx.bezierCurveTo(arc[1].x, arc[1].y, arc[2].x, arc[2].y, arc[3].x, arc[3].y)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  private riftArc(a: number, b: number): [Point, Point, Point, Point] | undefined {
    const s = this.view.state
    const ua = getUniverse(s, a), ub = getUniverse(s, b)
    if (!ua || !ub) return
    const A = this.layout.nodes.get(boardKey({u: a, t: frontier(ua).t}))!
    const B = this.layout.nodes.get(boardKey({u: b, t: frontier(ub).t}))!
    const start = {x: A.x + this.dimensions(A.size).width / 2, y: A.y - 15}
    const end = {x: B.x + this.dimensions(B.size).width / 2, y: B.y - 15}
    const bend = Math.max(start.x, end.x) + 145 + Math.min(120, Math.abs(start.y - end.y) * .12)
    return [start, {x: bend, y: start.y - 38}, {x: bend, y: end.y - 38}, end]
  }

  private drawBoard(node: Node, current: number) {
    const ctx = this.ctx
    const {u, t, size, front} = node
    const b = u.boards[t - u.boards[0].t]
    const id = boardKey({u: u.id, t})
    const accent = this.targetBoards.get(id)
    const now = front && u.active && t === current
    const optional = front && !now
    const selected = this.view.selected && id === boardKey(this.view.selected)
    const scale = this.camera.scale
    const d = this.dimensions(size)
    const L = node.x - d.width / 2, T = node.y - d.height / 2
    const tile = d.tile
    ctx.save()
    ctx.translate(L, T)
    ctx.globalAlpha = (accent || selected) ? 1 : !u.active ? .58 : front ? 1 : .76
    ctx.fillStyle = '#0b171d'
    ctx.strokeStyle = selected ? pathColors.gold : accent ?? (now ? '#75c9a4' : optional ? '#6d7484' : '#344a51')
    ctx.lineWidth = selected || accent ? 2.8 : 1.5
    if (scale > .27 && (now || accent)) {
      ctx.shadowColor = accent ?? '#64c49761'
      ctx.shadowBlur = accent ? 11 : 14
    }
    ctx.beginPath()
    if (playerCount(this.view.state) === 3) {
      const arm = 3 * tile - 8
      const armEnd = 11 * tile + 8
      ctx.moveTo(arm, -8)
      ctx.lineTo(d.width + 8, -8)
      ctx.lineTo(d.width + 8, d.height + 8)
      ctx.lineTo(arm, d.height + 8)
      ctx.lineTo(arm, armEnd)
      ctx.lineTo(-8, armEnd)
      ctx.lineTo(-8, arm)
      ctx.lineTo(arm, arm)
      ctx.closePath()
    } else ctx.roundRect(-8, -8, d.width + 16, d.height + 16, 7)
    ctx.fill(); ctx.stroke()
    if (!u.active) {
      ctx.setLineDash([9, 7]); ctx.strokeStyle = '#b5c5d8'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([])
    }
    ctx.shadowBlur = 0
    {
      for (const square of squares(this.view.state)) {
        const {x, y} = square
        const sx = (x - d.minX) * tile, sy = (y - d.minY) * tile
        ctx.fillStyle = (x + y) % 2 ? '#284e50' : '#426969'
        ctx.fillRect(sx, sy, tile, tile)
        const c = {u: u.id, t, x, y}
        const key = coordKey(c)
        const marked = this.targets.get(key)
        const chosen = this.view.selected && coordKey(this.view.selected) === key
        const kbd = this.keyboard && coordKey(this.keyboard) === key
        const hover = this.hover && coordKey(this.hover) === key
        if (chosen || marked || hover || kbd) {
          ctx.fillStyle = chosen ? '#e6c3799e' : marked ? colorOf(marked) + '43' : '#e8f3ee28'
          ctx.fillRect(sx, sy, tile, tile)
          if (kbd || chosen) {
            ctx.strokeStyle = chosen ? pathColors.gold : '#e6f2ea'
            ctx.lineWidth = 1.5
            ctx.strokeRect(sx + 1, sy + 1, tile - 2, tile - 2)
          }
          if (marked) {
            ctx.fillStyle = colorOf(marked)
            if (marked.capture || b.cells[index(square)]) {
              ctx.strokeStyle = colorOf(marked)
              ctx.lineWidth = 2
              ctx.strokeRect(sx + 2, sy + 2, tile - 4, tile - 4)
            } else {
              ctx.beginPath(); ctx.arc(sx + tile / 2, sy + tile / 2, tile * .15, 0, 2 * Math.PI); ctx.fill()
            }
          }
        }
        const piece = b.cells[index(square)]
        if (piece && !this.animatedDepartures.has(key)) {
          const ghost = front && this.view.state.eliminated.includes(piece.player)
          if (ghost) ctx.globalAlpha *= .27
          drawPiece(ctx, piece.kind, piece.player, sx + tile / 2, sy + tile / 2 + .4, tile * .98)
          if (ghost) ctx.globalAlpha /= .27
        }
      }
    }
    if (scale > .38) {
      // Coordinates sit just outside the playable area.
      ctx.fillStyle = '#89a5a8'
      ctx.font = '10px ui-monospace, monospace'
      ctx.textAlign = 'center'
      for (let i = 0; i <= d.maxX - d.minX; i++) {
        const col = String.fromCharCode(97 + i)
        ctx.fillText(col, (i + .5) * tile, -15)
      }
      for (let i = 0; i <= d.maxY - d.minY; i++) {
        ctx.fillText(String(d.maxY - d.minY + 1 - i), -20, (i + .61) * tile)
      }
      for (const [player, x, y, dir] of [
        ['yellow', d.width / 2, 3, 0], ['red', d.width / 2, d.height - 3, 0],
        ['blue', 3, d.height / 2, 1], ['green', d.width - 3, d.height / 2, 1]
      ] as const) {
        if ((player === 'green' && d.maxX < 13) || (player === 'blue' && d.minX > 0)) continue
        ctx.strokeStyle = COLORS[player] + 'ad'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x - (dir ? 0 : 18), y - (dir ? 18 : 0))
        ctx.lineTo(x + (dir ? 0 : 18), y + (dir ? 18 : 0)); ctx.stroke()
      }
    }
    if (scale > .20 && this.overlays.labels) {
      ctx.globalAlpha = 1
      ctx.textAlign = 'center'
      ctx.font = '650 12px ui-monospace, monospace'
      ctx.fillStyle = now ? '#b5efd4' : '#a9b8c3'
      const marker = u.creator ? `  ·  ${u.creator.toUpperCase()}` : ''
      ctx.fillText(`U${u.id}  /  T${t}${front ? now ? '   ·   PRESENT' : u.active ? '   ·   FUTURE' : '   ·   INACTIVE' : '   ·   HISTORY'}${marker}`, d.width / 2, d.height + 29)
    }
    ctx.restore()
  }

  private squarePoint(c: Coord): Point {
    const node = this.layout.nodes.get(boardKey(c))
    const size = node?.size ?? BOARD
    const d = this.dimensions(size)
    return {x: c.t * TIME + (c.x - d.minX + .5) * d.tile - d.width / 2,
      y: (this.layout.rows.get(c.u) ?? 0) * ROW + (c.y - d.minY + .5) * d.tile - d.height / 2}
  }

  private drawPath(m: Candidate, color: string, alpha: number, dashed: boolean) {
    const ctx = this.ctx
    const points = m.path.map(p => this.squarePoint(p))
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 3.4
    if (dashed) ctx.setLineDash([6, 7])
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.stroke()
    const end = points.at(-1)!
    const prior = points.at(-2)!
    const angle = Math.atan2(end.y - prior.y, end.x - prior.x)
    ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(end.x, end.y)
    for (const n of [-.5, .5]) ctx.lineTo(end.x - 11 * Math.cos(angle + n), end.y - 11 * Math.sin(angle + n))
    ctx.closePath(); ctx.fill()
    ctx.restore()
  }

  private drawAnimation(outcomes: readonly Outcome[], p: number) {
    const ctx = this.ctx
    for (const {move, status, captures} of outcomes) {
      this.drawPath(move, status === 'applied' ? COLORS[move.player] : '#ff8c85', .66 - p * .26, status !== 'applied')
      const end = this.squarePoint(move.to)
      if (status === 'applied') {
        const parts = move.castle ? [move, {...move.castle, path: [move.castle.from, move.castle.to]}] : [move]
        for (const leg of parts) {
          const position = ease(Math.min(1, p * 1.28)) * (leg.path.length - 1)
          const a = this.squarePoint(leg.path[Math.floor(position)])
          const b = this.squarePoint(leg.path[Math.min(leg.path.length - 1, Math.ceil(position))])
          const k = position % 1
          drawPiece(ctx, leg.piece.kind, leg.piece.player, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 33)
        }
      }
      if ((captures.length || status !== 'applied' || move.branch) && p > .45) {
        ctx.save()
        ctx.globalAlpha = (1 - p) * 1.8
        ctx.strokeStyle = captures.length || status !== 'applied' ? '#ff8f85' : '#a7b8ff'
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.arc(end.x, end.y, 9 + p * 27, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }
    }
  }
}
