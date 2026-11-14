import {createServer} from 'node:http'
import type {Socket} from 'node:net'
import {dailyValuation} from './elo-gambling.ts'
import {nextReset} from '../src/collection.ts'
import {ChessStore} from './storage.ts'
import {createApplication} from './application.ts'

const store = new ChessStore(process.env.DATA_DIR || 'data')
let midnightTimer:ReturnType<typeof setTimeout>
function refreshValuation(){
  let delay=Math.max(1,nextReset()-Date.now()+10)
  try {store.transaction(unit=>dailyValuation(unit,store))}
  catch {console.error('Daily Elo valuation deferred; retrying shortly');delay=1000}
  midnightTimer=setTimeout(refreshValuation,delay)
  midnightTimer.unref()
}
refreshValuation()
const application = createApplication(store)
const server = createServer(application.handle)
const sockets = new Set<Socket>()
server.on('connection', socket => {sockets.add(socket); socket.once('close',()=>sockets.delete(socket))})
const port = Number(process.env.PORT || 4174), host = process.env.HOST || '127.0.0.1'
server.listen(port,host,()=>console.log(`Multiverse server · http://${host}:${port}/chess/`))
server.once('error', error => {store.close(); console.error(error); process.exitCode=1})

let stopping = false
function shutdown(): void {
  if (stopping) return
  stopping = true
  clearTimeout(midnightTimer)
  application.drain()
  // Finish responses before closing storage. Transactions themselves never await.
  server.close(()=>{store.close()})
  const deadline = setTimeout(()=>{for (const socket of sockets) socket.destroy()},10_000)
  deadline.unref()
}
process.once('SIGINT',shutdown)
process.once('SIGTERM',shutdown)
