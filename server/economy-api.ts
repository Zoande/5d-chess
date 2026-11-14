import type {Account} from './accounts.ts'
import {profile} from './accounts.ts'
import {economyView, openOwnedCase, buySet, listSet, equipDesign, equipCollection, purchase, spin, buyCrate, buyFeatured, resolveDuplicate, equip, equipLook, listItem, cancelListing, buyListing, wallet} from './economy.ts'
import {KINDS} from '../src/model.ts'
import {fail} from './http.ts'
import type {UnitOfWork} from './storage.ts'
import type {Reply} from './model.ts'

export function economyApi(unit: UnitOfWork, account: Account, path: string, method: string, data: Record<string, unknown>): Reply | undefined {
  if (path === '/api/economy' && method === 'GET') return {status: 200, value: economyView(account)}
  if (path === '/api/market' && method === 'GET') return {status: 200, value: {listings: unit.listings()}}
  if (!path.startsWith('/api/economy/') || method !== 'POST') return
  let drop
  switch (path) {
    case '/api/economy/visit-shop': wallet(account).shopSeen=true; break
    case '/api/economy/spin-again': drop=purchase(account,data.requestId,()=>spin(account,Date.now(),true,data.expectedDay)); break
    case '/api/economy/spin': drop=purchase(account,data.requestId,()=>spin(account,Date.now(),false,data.expectedDay)); break
    case '/api/economy/case':
    case '/api/economy/crate': drop=purchase(account,data.requestId,()=>buyCrate(account,data.case??data.crate,undefined,data.month,data.offerKey,data.expectedPrice)); break
    case '/api/economy/buy': drop=purchase(account,data.requestId,()=>buyFeatured(account,data.itemId,undefined,data.expectedPrice,data.kind)); break
    case '/api/economy/open-case': drop=purchase(account,data.requestId,()=>openOwnedCase(account,data.caseUid)); break
    case '/api/economy/buy-set': drop=purchase(account,data.requestId,()=>buySet(account,data.setId)); break
    case '/api/economy/equip-design': equipDesign(account,data.itemId); break
    case '/api/economy/equip-collection': equipCollection(account,data.setId); break
    case '/api/economy/list-set': listSet(account,unit.listings(),data.setId,data.price,data.description??'',data.requestId); break
    case '/api/economy/duplicate': resolveDuplicate(account,data.uid,data.refund); break
    case '/api/economy/equip-look': equipLook(account,data.target,data.primary,data.secondary); break
    case '/api/economy/equip-set': for (const kind of KINDS) equip(account,kind,data.uid); break
    case '/api/economy/equip': equip(account,data.slot,data.uid); break
    case '/api/economy/list': listItem(account,unit.listings(),data.uid,data.price,Date.now(),data.description===undefined?'':data.description); break
    case '/api/economy/cancel': cancelListing(account,unit.listings(),data.id); break
    case '/api/economy/market-buy': {
      const listings = unit.listings(), listing = listings.find(item=>item.id===data.id)
      const seller = listing ? unit.users.get(listing.seller) : undefined
      buyListing(account, seller ? [account, seller] : [account], listings, data.id)
      break
    }
    default: fail(404,'Not found')
  }
  return {status: 200, value: {...economyView(account), profile: profile(account), drop}}
}
