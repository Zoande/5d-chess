import type {Account} from './accounts.ts'
import {profile} from './accounts.ts'
import {wallet} from './economy.ts'
import {fail} from './http.ts'
import type {Preferences} from '../src/account-model.ts'
import type {Movement, PlayerCount} from '../src/model.ts'
import type {ChessStore} from './storage.ts'
import type {Reply} from './model.ts'
import {ensureAccount} from './accounts.ts'

export function accountApi(store: ChessStore, source: Account, path: string, method: string, data: Record<string, unknown>): Reply | undefined {
  const account = ensureAccount(source)
  if (path === '/api/settings' && method === 'POST') {
    if (!['classic','live'].includes(data.movement as string) || ![2,3,4].includes(data.players as number) || typeof data.moveNotifications !== 'boolean') fail(400, 'Invalid settings')
    account.settings = {avatar: wallet(account).loadout.icon, movement: data.movement as Movement, players: data.players as PlayerCount, moveNotifications: data.moveNotifications} satisfies Preferences
    return {status: 200, value: {profile: profile(account)}}
  }
  if (path === '/api/notifications' && method === 'GET') return {status: 200, value: {items: account.notifications, unread: account.notifications.filter(n=>!n.read).length}}
  if (path === '/api/notifications/read' && method === 'POST') {
    if (data.all !== true && (!Array.isArray(data.ids) || data.ids.length>100 || data.ids.some(id=>typeof id!=='string' || !/^[a-f0-9]{24}$/.test(id)))) fail(400, 'Invalid notification selection')
    const ids = new Set((data.ids ?? []) as string[])
    for (const notice of account.notifications) if (data.all === true || ids.has(notice.id)) notice.read = true
    return {status: 200, value: {items: account.notifications, unread: account.notifications.filter(n=>!n.read).length}}
  }
  if ((path === '/api/leaderboard'||path === '/api/leaderboard/full') && method === 'GET') {
    const rows = store.leaderboard(), self = rows.find(row=>row.name===account.name)!
    return {status: 200, value: {players: path.endsWith('/full')?rows:rows.slice(0,100), me: {name: account.name, rating: self.rating, games: self.games, rank: self.rank}}}
  }
}
