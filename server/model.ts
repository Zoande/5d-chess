import type {Account, RatedRoom} from './accounts.ts'
import type {Listing} from '../src/collection.ts'
import type {Order, Player, State, Resolution} from '../src/model.ts'

export interface Login {user: string; expires: number}
export type Room = {code: string; title: string; owner: string; password?: string; salt?: string;
  seats: Partial<Record<Player, string>>; state: State; journal: Order[][]; results: Resolution[];
  locked: Partial<Record<Player, Order[]>>; created: number} & RatedRoom
export interface LegacyDatabase {
  users: Account[];
  logins: Record<string, Login>;
  rooms: Room[];
  listings?: Listing[];
  [key: string]: unknown;
}
export interface Reply {status: number; value: unknown; headers?: Record<string, string>}
