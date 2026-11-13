import {type Movement} from './model.ts'
export const POOLS = ['classic-duel','classic-multi','live-duel','live-multi'] as const
export type RatingPool = typeof POOLS[number]
export const AVATARS = ['person','king','queen','rook','bishop','knight'] as const
export type Avatar = typeof AVATARS[number]
export interface Preferences {avatar: Avatar; movement: Movement; players: 2|3|4; moveNotifications: boolean}
export interface Rating {value: number; games: number}
export interface Profile {name: string; settings: Preferences; ratings: Record<RatingPool,Rating>}
export interface Notice {id: string; kind: 'join'|'move'|'turn'|'result'|'rating'; title: string; detail: string; code: string; created: number; read: boolean}
export const poolFor = (movement: Movement = 'live', count = 2): RatingPool => `${movement}-${count === 2 ? 'duel' : 'multi'}`
export const poolLabel = (pool: RatingPool) => `${pool.startsWith('classic') ? 'Classic' : 'Live'} · ${pool.endsWith('duel') ? '2 players' : '3–4 players'}`
