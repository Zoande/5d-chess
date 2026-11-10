export default {
  fetch(request) {
    const url = new URL(request.url)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD'}})
    }
    if (url.pathname === '/' || url.pathname === '/chess') return Response.redirect(new URL('/chess/' + url.search, url), 308)
    if (!url.pathname.startsWith('/chess/')) return new Response('Not found', {status: 404})
    const name = url.pathname.slice('/chess/'.length) || 'index.html'
    if (!Object.hasOwn(assets, name)) return new Response('Not found', {status: 404})
    const {body, type} = assets[name]
    return new Response(request.method === 'HEAD' ? null : body, {headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    }})
  }
}
