import {writeFileSync, mkdirSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {ChessStore} from './storage.ts'

const [command, destination] = process.argv.slice(2)
const store = new ChessStore(process.env.DATA_DIR || 'data', {readOnly: true})
try {
  if (command === 'check') console.log(JSON.stringify(store.check()))
  else if (command === 'backup' && destination) {
    await store.backup(resolve(destination))
    console.log('SQLite backup created.')
  } else if (command === 'export' && destination) {
    const file = resolve(destination)
    mkdirSync(dirname(file),{recursive: true, mode: 0o700})
    writeFileSync(file,`${JSON.stringify(store.snapshot())}\n`,{flag: 'wx', mode: 0o600})
    console.log('Private compatibility export created.')
  } else throw new Error('Usage: storage-admin.mjs check | backup <new-file> | export <new-file> (uses DATA_DIR)')
} finally {store.close()}
