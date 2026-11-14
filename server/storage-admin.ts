import {writeFileSync, mkdirSync, openSync, fsyncSync, closeSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {ChessStore} from './storage.ts'
import {syncDirectory} from './files.ts'

const [command, destination] = process.argv.slice(2)
const store = new ChessStore(process.env.DATA_DIR || 'data', {readOnly: command !== 'migrate'})
try {
  if (command === 'check' || command === 'migrate') console.log(JSON.stringify(store.check()))
  else if (command === 'backup' && destination) {
    await store.backup(resolve(destination))
    console.log('Verified SQLite backup created.')
  } else if (command === 'export' && destination) {
    const file = resolve(destination)
    mkdirSync(dirname(file),{recursive: true, mode: 0o700})
    const fd = openSync(file,'wx',0o600)
    try {writeFileSync(fd,`${JSON.stringify(store.snapshot())}\n`); fsyncSync(fd)} finally {closeSync(fd)}
    syncDirectory(dirname(file))
    console.log('Private compatibility export created.')
  } else throw new Error('Usage: storage-admin.mjs migrate | check | backup <new-file> | export <new-file> (uses DATA_DIR)')
} finally {store.close()}
