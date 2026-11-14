import type {Account} from './accounts.ts'
import {profile} from './accounts.ts'
import {casinoBet,casinoView} from './casino.ts'
import {CASINO_OWNER} from '../src/casino-model.ts'
import type {UnitOfWork} from './storage.ts'
import type {Reply} from './model.ts'

export function casinoApi(unit: UnitOfWork, account: Account, path: string, method: string, data: Record<string, unknown>): Reply | undefined {
  if (path === '/api/casino' && method === 'GET') return {status:200,value:casinoView(account)}
  if (path !== '/api/casino/bet' || method !== 'POST') return
  const owner = unit.findAccount(CASINO_OWNER)
  const accounts = owner && owner !== account ? [account,owner] : [account]
  const result = casinoBet(account,accounts,data)
  for (const target of accounts) if (!unit.findAccount(target.name)) unit.users.add(target.name,target)
  return {status:200,value:{...result,profile:profile(account)}}
}
