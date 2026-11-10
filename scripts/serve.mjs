import {createServer} from 'node:http'
import worker from '../.cloudflare/worker.mjs'

const port = Number(process.env.PORT || 4173)
const host = process.env.HOST || '127.0.0.1'
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || host}`)
    if (url.pathname === '/') {
      res.writeHead(307, {Location: '/chess/'}).end()
      return
    }
    const result = await worker.fetch(new Request(url, {method: req.method}))
    res.writeHead(result.status, Object.fromEntries(result.headers))
    res.end(Buffer.from(await result.arrayBuffer()))
  } catch {
    res.writeHead(500).end('Preview could not serve this request')
  }
}).listen(port, host, () => console.log(`Multiverse Chess · http://${host}:${port}/chess/`))
