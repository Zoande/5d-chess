import {DatabaseSync, backup as sqliteBackup, type StatementSync} from 'node:sqlite'
import {mkdirSync, existsSync, readFileSync, writeFileSync, openSync, fsyncSync, closeSync, chmodSync, unlinkSync} from 'node:fs'
import {resolve, dirname, join} from 'node:path'
import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import type {Account} from './accounts.ts'
import type {Listing} from '../src/collection.ts'
import type {LegacyDatabase, Login, Room} from './model.ts'
import {roomSummary, type RoomSummary} from './room-summary.ts'
import {players, playerCount, survivors} from '../src/model.ts'
import {syncDirectory} from './files.ts'

export const STORAGE_SCHEMA = 1
const knownKeys = new Set(['users', 'logins', 'rooms', 'listings'])
type Row = {payload: string}

/** A transaction owns its detached entities. Failed work cannot leak mutated
 * wallets or game state into the next request, even when the same process lives on. */
class Entities<T> {
  private loaded = new Map<string, {before: string | null; value: T}>()
  private read: (key: string) => string | undefined
  private write: (key: string, json: string, value: T) => void
  constructor(read: (key: string) => string | undefined, write: (key: string, json: string, value: T) => void) {this.read=read; this.write=write}
  get(key: string): T | undefined {
    const cached = this.loaded.get(key)
    if (cached) return cached.value
    const json = this.read(key)
    if (json === undefined) return undefined
    const value = JSON.parse(json) as T
    this.loaded.set(key, {before: json, value})
    return value
  }
  add(key: string, value: T): void {
    if (this.get(key)) throw new Error('Duplicate record')
    this.loaded.set(key, {before: null, value})
  }
  cached(predicate: (value: T) => boolean): T | undefined {
    for (const entry of this.loaded.values()) if (predicate(entry.value)) return entry.value
  }
  flush(): void {
    for (const [key, entry] of this.loaded) {
      const json = JSON.stringify(entry.value)
      if (json !== entry.before) this.write(key, json, entry.value)
    }
  }
}

export class UnitOfWork {
  readonly users: Entities<Account>
  readonly rooms: Entities<Room>
  private market?: {before: Map<string, string>; values: Listing[]}
  private store: ChessStore
  constructor(store: ChessStore) {
    this.store = store
    this.users = new Entities(name => store.accountJson(name), (_name, json, account) => store.writeAccount(account, json))
    this.rooms = new Entities(code => store.roomJson(code), (_code, json, room) => store.writeRoom(room, json))
  }
  findAccount(name: string): Account | undefined {
    const pending = this.users.cached(account => account.name.toLowerCase() === name.toLowerCase())
    if (pending) return pending
    const exact = this.store.accountName(name)
    return exact ? this.users.get(exact) : undefined
  }
  session(hash: string): Login | undefined {return this.store.session(hash)}
  putSession(hash: string, login: Login): void {this.store.putSession(hash, login)}
  deleteSession(hash: string): void {this.store.deleteSession(hash)}
  listings(): Listing[] {
    if (!this.market) {
      const rows = this.store.listingRows()
      this.market = {before: new Map(rows.map(row => [JSON.parse(row.payload).id, row.payload])), values: rows.map(row => JSON.parse(row.payload))}
    }
    return this.market.values
  }
  flush(): void {
    this.users.flush()
    this.rooms.flush()
    if (this.market) {
      const keys = new Set<string>()
      for (const listing of this.market.values) {
        if (keys.has(listing.id)) throw new Error('Duplicate listing')
        keys.add(listing.id)
        const json = JSON.stringify(listing)
        if (json !== this.market.before.get(listing.id)) this.store.writeListing(listing.id, json)
      }
      for (const id of this.market.before.keys()) if (!keys.has(id)) this.store.deleteListing(id)
    }
  }
}

/** One database, separate domain records. WAL + FULL synchronous transactions
 * make purchases, trades and game/ratings/reward changes durable together. */
export class ChessStore {
  readonly path: string
  private db: DatabaseSync
  private statements = new Map<string, StatementSync>()
  private inTransaction = false
  constructor(dataDirectory: string, options: {readOnly?: boolean; memory?: boolean} = {}) {
    const directory = resolve(dataDirectory)
    this.path = options.memory ? ':memory:' : join(directory, 'chess.sqlite')
    if (!options.readOnly && !options.memory) {
      mkdirSync(directory, {recursive: true, mode: 0o700})
      // Create private before SQLite creates the WAL alongside it.
      if (!existsSync(this.path)) {const fd = openSync(this.path, 'wx', 0o600); closeSync(fd)}
    }
    this.db = new DatabaseSync(this.path, {readOnly: options.readOnly ?? false})
    try {
      this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
      const version = Number((this.db.prepare('PRAGMA user_version').get() as {user_version: number}).user_version)
      if (version !== 0 && version !== STORAGE_SCHEMA) throw new Error(`Unsupported chess storage schema ${version}.`)
      if (options.readOnly && version !== STORAGE_SCHEMA) throw new Error('Chess database has not been migrated.')
      if (!options.readOnly) {
        this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
        if (version === 0) this.initialize(options.memory ? undefined : join(directory, 'multiplayer.json'))
      }
    } catch (error) {this.db.close(); throw error}
  }
  private statement(sql: string): StatementSync {
    let statement = this.statements.get(sql)
    if (!statement) {statement = this.db.prepare(sql); this.statements.set(sql, statement)}
    return statement
  }
  private initialize(legacyPath?: string): void {
    if (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length) throw new Error('Unversioned nonempty database; refusing to overwrite it.')
    let source: LegacyDatabase = {users: [], logins: {}, rooms: [], listings: []}
    let migration: Record<string, unknown> = {kind: 'empty', createdAt: new Date().toISOString()}
    if (legacyPath && existsSync(legacyPath)) {
      const raw = readFileSync(legacyPath)
      try {source = JSON.parse(raw.toString('utf8')) as LegacyDatabase}
      catch {throw new Error('Legacy multiplayer.json is not valid JSON; original data has not been replaced.')}
      if (!source || !Array.isArray(source.users) || !Array.isArray(source.rooms) || !source.logins || typeof source.logins !== 'object' || Array.isArray(source.logins)
        || source.listings !== undefined && !Array.isArray(source.listings)) throw new Error('Invalid legacy chess database; refusing an empty replacement.')
      const digest = createHash('sha256').update(raw).digest('hex')
      const backupDirectory = join(dirname(legacyPath), 'backups')
      mkdirSync(backupDirectory, {recursive: true, mode: 0o700})
      const backupPath = join(backupDirectory, `multiplayer-before-sqlite-${digest}.json`)
      if (!existsSync(backupPath)) {
        const fd = openSync(backupPath, 'wx', 0o600)
        try {writeFileSync(fd, raw); fsyncSync(fd)} finally {closeSync(fd)}
        syncDirectory(backupDirectory)
      }
      if (createHash('sha256').update(readFileSync(backupPath)).digest('hex') !== digest) throw new Error('Legacy migration backup checksum mismatch.')
      migration = {kind: 'legacy-json', sourceSha256: digest, backupPath, createdAt: new Date().toISOString()}
    }
    this.db.exec('BEGIN IMMEDIATE')
    this.inTransaction = true
    try {
      this.db.exec(`
        CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, name_key TEXT NOT NULL UNIQUE,
          payload TEXT NOT NULL CHECK(json_valid(payload)), revision INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_name TEXT NOT NULL REFERENCES accounts(name) DEFERRABLE INITIALLY DEFERRED,
          expires INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
        CREATE INDEX sessions_expiry ON sessions(expires);
        CREATE TABLE rooms (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, owner TEXT NOT NULL REFERENCES accounts(name),
          payload TEXT NOT NULL CHECK(json_valid(payload)), summary TEXT NOT NULL CHECK(json_valid(summary)),
          finished INTEGER NOT NULL, open_seats INTEGER NOT NULL, private INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
        CREATE INDEX rooms_available ON rooms(finished, private, open_seats);
        CREATE TABLE room_members (room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
          account_name TEXT NOT NULL REFERENCES accounts(name), my_turn INTEGER NOT NULL, PRIMARY KEY(room_code, account_name));
        CREATE INDEX room_members_account ON room_members(account_name);
        CREATE TABLE listings (ordinal INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL CHECK(json_valid(payload)), revision INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));
        CREATE TABLE migrations (version INTEGER PRIMARY KEY, receipt TEXT NOT NULL CHECK(json_valid(receipt)));
      `)
      for (const account of source.users) this.writeAccount(account, JSON.stringify(account))
      for (const [hash, login] of Object.entries(source.logins)) this.putSession(hash, login)
      for (const room of source.rooms) this.writeRoom(room, JSON.stringify(room))
      for (const listing of source.listings ?? []) this.writeListing(listing.id, JSON.stringify(listing))
      for (const [key, value] of Object.entries(source)) if (!knownKeys.has(key)) this.statement('INSERT INTO metadata(key,value) VALUES(?,?)').run(key, JSON.stringify(value))
      // Verify the entire import, including unknown operational metadata and
      // exact wallet/session/game payloads, before making this database authoritative.
      if (!isDeepStrictEqual(this.snapshotRows(), {...source, listings: source.listings ?? []})) throw new Error('Legacy import verification failed; original file and backup retained.')
      this.statement('INSERT INTO migrations(version,receipt) VALUES(?,?)').run(STORAGE_SCHEMA, JSON.stringify(migration))
      this.db.exec(`PRAGMA user_version = ${STORAGE_SCHEMA}; COMMIT`)
    } catch (error) {
      this.db.exec('ROLLBACK'); this.statements.clear(); throw error
    } finally {this.inTransaction = false}
  }
  transaction<T>(work: (unit: UnitOfWork) => T): T {
    if (work.constructor.name === 'AsyncFunction') throw new Error('Chess transactions must be synchronous')
    if (this.inTransaction) throw new Error('Nested chess transaction')
    this.db.exec('BEGIN IMMEDIATE')
    this.inTransaction = true
    try {
      const unit = new UnitOfWork(this)
      const result = work(unit)
      if (result && typeof result === 'object' && 'then' in result) {
        void Promise.resolve(result).catch(()=>undefined)
        throw new Error('Chess transactions must be synchronous')
      }
      unit.flush()
      this.db.exec('COMMIT')
      return result
    } catch (error) {this.db.exec('ROLLBACK'); throw error}
    finally {this.inTransaction = false}
  }
  accountJson(name: string): string | undefined {return (this.statement('SELECT payload FROM accounts WHERE name=?').get(name) as Row | undefined)?.payload}
  accountName(name: string): string | undefined {return (this.statement('SELECT name FROM accounts WHERE name_key=?').get(name.toLowerCase()) as {name: string} | undefined)?.name}
  writeAccount(account: Account, json: string): void {
    this.requireWriter()
    if (typeof account.name !== 'string' || !account.name) throw new Error('Invalid account name')
    this.statement(`INSERT INTO accounts(name,name_key,payload) VALUES(?,?,?)
      ON CONFLICT(name) DO UPDATE SET payload=excluded.payload, revision=accounts.revision+1`).run(account.name, account.name.toLowerCase(), json)
  }
  session(hash: string): Login | undefined {const row = this.statement('SELECT payload FROM sessions WHERE token_hash=?').get(hash) as Row | undefined; return row ? JSON.parse(row.payload) : undefined}
  putSession(hash: string, login: Login): void {this.requireWriter(); this.statement('INSERT INTO sessions(token_hash,account_name,expires,payload) VALUES(?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET account_name=excluded.account_name,expires=excluded.expires,payload=excluded.payload').run(hash, login.user, login.expires, JSON.stringify(login))}
  deleteSession(hash: string): void {this.requireWriter(); this.statement('DELETE FROM sessions WHERE token_hash=?').run(hash)}
  roomJson(code: string): string | undefined {return (this.statement('SELECT payload FROM rooms WHERE code=?').get(code) as Row | undefined)?.payload}
  writeRoom(room: Room, json: string): void {
    this.requireWriter()
    const summary = roomSummary(room)
    this.statement(`INSERT INTO rooms(code,owner,payload,summary,finished,open_seats,private) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(code) DO UPDATE SET payload=excluded.payload,summary=excluded.summary,finished=excluded.finished,
      open_seats=excluded.open_seats,private=excluded.private,revision=rooms.revision+1`).run(room.code, room.owner, json, JSON.stringify(summary), Number(summary.finished), summary.maxPlayers-summary.players, Number(summary.protected))
    this.statement('DELETE FROM room_members WHERE room_code=?').run(room.code)
    for (const name of new Set(Object.values(room.seats))) if (name) {
      const seat = players(room.state).find(player => room.seats[player] === name)!
      const myTurn = Object.keys(room.seats).length === playerCount(room.state) && survivors(room.state).includes(seat)
        && !room.locked[seat] && (room.state.movement !== 'classic' || room.state.turn === seat)
      this.statement('INSERT INTO room_members(room_code,account_name,my_turn) VALUES(?,?,?)').run(room.code, name, Number(myTurn))
    }
  }
  availableRooms(): RoomSummary[] {return (this.statement('SELECT summary AS payload FROM rooms WHERE private=0 AND finished=0 AND open_seats>0 ORDER BY id').all() as Row[]).map(row => JSON.parse(row.payload))}
  memberRooms(name: string): Array<RoomSummary & {myTurn: boolean}> {
    return (this.statement('SELECT r.summary AS payload,m.my_turn FROM rooms r JOIN room_members m ON m.room_code=r.code WHERE m.account_name=? ORDER BY r.id').all(name) as Array<Row & {my_turn: number}>).map(row => ({...JSON.parse(row.payload), myTurn: !!row.my_turn}))
  }
  activeRooms(): number {return Number((this.statement('SELECT COUNT(*) AS count FROM rooms WHERE finished=0').get() as {count: number}).count)}
  leaderboard() {
    const rows = this.statement(`SELECT name, COALESCE(json_extract(payload,'$.wallet.loadout.icon'),'default') AS avatar,
      json_extract(payload,'$.wallet.loadout.frame') AS frame, COALESCE(json_extract(payload,'$.rating.value'),1200) AS rating,
      COALESCE(json_extract(payload,'$.rating.games'),0) AS games FROM accounts`).all() as Array<{name: string; avatar: string; frame: string | null; rating: number; games: number}>
    const sorted = rows.map(row => ({...row, frame: row.frame ?? undefined, rating: Math.round(row.rating)})).sort((a,b) => b.rating-a.rating || a.name.localeCompare(b.name))
    let rank = 1
    return sorted.map((row,i) => {if (i && row.rating !== sorted[i-1].rating) rank=i+1; return {...row, rank}})
  }
  listingRows(): Row[] {return this.statement('SELECT payload FROM listings ORDER BY ordinal').all() as Row[]}
  writeListing(id: string, json: string): void {this.requireWriter(); this.statement('INSERT INTO listings(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=listings.revision+1').run(id, json)}
  deleteListing(id: string): void {this.requireWriter(); this.statement('DELETE FROM listings WHERE id=?').run(id)}
  private requireWriter(): void {if (!this.inTransaction) throw new Error('Storage changes require a transaction')}
  private snapshotRows(): LegacyDatabase {
    const metadata = Object.fromEntries((this.statement('SELECT key,value FROM metadata ORDER BY rowid').all() as Array<{key: string; value: string}>).map(row => [row.key, JSON.parse(row.value)]))
    return {...metadata, users: (this.statement('SELECT payload FROM accounts ORDER BY id').all() as Row[]).map(row => JSON.parse(row.payload)),
      logins: Object.fromEntries((this.statement('SELECT token_hash,payload FROM sessions ORDER BY rowid').all() as Array<Row & {token_hash: string}>).map(row => [row.token_hash, JSON.parse(row.payload)])),
      rooms: (this.statement('SELECT payload FROM rooms ORDER BY id').all() as Row[]).map(row => JSON.parse(row.payload)),
      listings: this.listingRows().map(row => JSON.parse(row.payload))}
  }
  snapshot(): LegacyDatabase {
    this.db.exec('BEGIN')
    try {const result = this.snapshotRows(); this.db.exec('COMMIT'); return result}
    catch (error) {this.db.exec('ROLLBACK'); throw error}
  }
  check() {
    const integrity = this.db.prepare('PRAGMA integrity_check').all() as Array<{integrity_check: string}>
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || this.db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Chess storage integrity check failed')
    return {schema: STORAGE_SCHEMA, accounts: this.count('accounts'), sessions: this.count('sessions'), rooms: this.count('rooms'), listings: this.count('listings')}
  }
  ready(): void {this.statement('SELECT code FROM rooms LIMIT 1').get()}
  private count(table: 'accounts' | 'sessions' | 'rooms' | 'listings'): number {return Number((this.statement(`SELECT COUNT(*) AS count FROM ${table}`).get() as {count: number}).count)}
  async backup(destination: string): Promise<void> {
    if (existsSync(destination)) throw new Error('Backup destination already exists')
    mkdirSync(dirname(resolve(destination)), {recursive: true, mode: 0o700})
    writeFileSync(destination, '', {flag: 'wx', mode: 0o600})
    try {
      await sqliteBackup(this.db, destination)
      const copy = new DatabaseSync(destination, {readOnly: true})
      try {
        const integrity = copy.prepare('PRAGMA integrity_check').all() as Array<{integrity_check: string}>
        if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || copy.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Backup integrity check failed')
      } finally {copy.close()}
      chmodSync(destination, 0o600)
      const fd = openSync(destination, 'r'); try {fsyncSync(fd)} finally {closeSync(fd)}
      syncDirectory(dirname(resolve(destination)))
    } catch (error) {unlinkSync(destination); throw error}
  }
  close(): void {this.db.close()}
}
