type ApiError = {error?: string}
type Game = {code: string; title: string; players: number; maxPlayers: number; protected: boolean; round: number; finished: boolean}
type Games = {available: Game[]; mine: Game[]; limit: number}

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {method: data === undefined ? 'GET' : 'POST',
    headers: data === undefined ? {} : {'content-type': 'application/json'},
    body: data === undefined ? undefined : JSON.stringify(data)})
  let result: T & ApiError
  try { result = await response.json() } catch { throw new Error('Online play is unavailable. Check the game server.') }
  if (!response.ok) throw new Error(result.error || 'Request failed')
  return result
}
const error = (id: string, message: string) => { const box = el(id); box.textContent = message; box.hidden = !message }
const online = (code: string) => { location.href = `/chess/online.html?code=${encodeURIComponent(code)}` }

async function login() {
  try { if ((await api<{user: string | null}>('/me')).user) { location.replace('/chess/lobby.html'); return } } catch { /* form will show server errors */ }
  let signup = false
  const setMode = (value: boolean) => {
    signup = value
    el('auth-title').textContent = value ? 'Make account' : 'Log in'
    el('auth-submit').textContent = value ? 'Sign up' : 'Log in'
    el('confirm-row').hidden = !value
    el<HTMLInputElement>('confirm').required = value
    el<HTMLInputElement>('password').autocomplete = value ? 'new-password' : 'current-password'
    el('switch-mode').textContent = value ? 'Already have an account? Log in' : 'Create an account'
    el('missing-account').hidden = true
    error('auth-error', '')
  }
  el('switch-mode').onclick = () => setMode(!signup)
  el('make-account').onclick = () => setMode(true)
  el('return-login').onclick = () => { el('missing-account').hidden = true; error('auth-error', '') }
  el<HTMLFormElement>('auth-form').onsubmit = async event => {
    event.preventDefault()
    error('auth-error', '')
    const username = el<HTMLInputElement>('username').value.trim()
    const password = el<HTMLInputElement>('password').value
    const confirm = el<HTMLInputElement>('confirm').value
    if (signup && password !== confirm) { error('auth-error', 'Passwords do not match'); return }
    const submit = el<HTMLButtonElement>('auth-submit')
    submit.disabled = true
    try {
      await api(signup ? '/signup' : '/login', {username, password, ...(signup ? {confirm} : {})})
      location.replace('/chess/lobby.html')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not log in'
      if (message === 'Account not found' && !signup) el('missing-account').hidden = false
      else error('auth-error', message)
    } finally { submit.disabled = false }
  }
}

function row(game: Game, action: string, click: () => void) {
  const item = document.createElement('div')
  item.className = 'game-row'
  const description = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = game.title
  const detail = document.createElement('small')
  detail.textContent = `${game.code} · ${game.players}/${game.maxPlayers ?? 4} players · Round ${game.round}${game.finished ? ' · Finished' : ''}`
  description.append(title, detail)
  const button = document.createElement('button')
  button.className = 'button'
  button.textContent = action
  button.onclick = click
  item.append(description, button)
  return item
}
async function lobby() {
  let me: {user: string | null}
  try { me = await api('/me') } catch { location.replace('/chess/login.html'); return }
  if (!me.user) { location.replace('/chess/login.html'); return }
  el('account-name').textContent = me.user
  el('logout').onclick = async () => {
    await api('/logout', {})
    location.replace('/chess/')
  }
  let games: Games
  const refresh = async () => {
    games = await api<Games>('/games')
    const available = el('available-games')
    available.replaceChildren(...games.available.map(game => row(game, 'Join', () => {
      el<HTMLInputElement>('join-code').value = game.code
      el<HTMLFormElement>('join-form').requestSubmit()
    })))
    if (!games.available.length) available.textContent = 'No open games right now.'
    const mine = el('my-games')
    mine.replaceChildren(...games.mine.map(game => row(game, 'Continue', () => online(game.code))))
    if (!games.mine.length) mine.textContent = 'You have no games yet.'
  }
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.onclick = async () => {
    document.querySelectorAll<HTMLElement>('.lobby-view').forEach(view => view.hidden = view.id !== button.dataset.view)
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(other => other.setAttribute('aria-pressed', String(other === button)))
    try { await refresh() } catch (cause) { error('join-error', cause instanceof Error ? cause.message : 'Could not load games') }
  })
  el<HTMLFormElement>('make-form').onsubmit = async event => {
    event.preventDefault()
    error('make-error', '')
    try {
      const result = await api<{code: string}>('/games', {title: el<HTMLInputElement>('game-title').value.trim() || `${me.user}'s game`,
        playerCount: Number(el<HTMLSelectElement>('game-players').value), password: el<HTMLInputElement>('game-password').value})
      online(result.code)
    } catch (cause) { error('make-error', cause instanceof Error ? cause.message : 'Could not create game') }
  }
  el<HTMLFormElement>('join-form').onsubmit = async event => {
    event.preventDefault()
    error('join-error', '')
    const code = el<HTMLInputElement>('join-code').value.trim().toUpperCase()
    try {
      await api(`/games/${code}/join`, {password: el<HTMLInputElement>('join-password').value})
      online(code)
    } catch (cause) { error('join-error', cause instanceof Error ? cause.message : 'Could not join game') }
  }
  try { await refresh() } catch (cause) { error('join-error', cause instanceof Error ? cause.message : 'Could not load games') }
}

if (document.body.dataset.page === 'login') void login()
if (document.body.dataset.page === 'lobby') void lobby()
