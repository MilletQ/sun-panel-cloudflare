import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context } from 'hono'
import type { Env, Variables } from './types'
import { error } from './lib/api-response'
import { registerLoginRoutes } from './routes/login'
import { registerPanelRoutes } from './routes/panel'
import { registerSystemRoutes } from './routes/system'
import { registerUserRoutes } from './routes/user'
import { getUploadFromR2 } from './lib/uploads'

const app = new Hono<{ Bindings: Env, Variables: Variables }>()

function fallbackRouteLabel(pathname: string) {
  if (pathname === '/')
    return '/'

  if (pathname.startsWith('/uploads/'))
    return '/uploads/*'

  if (pathname.startsWith('/api/')) {
    const [, apiPrefix, group] = pathname.split('/')
    return group ? `/${apiPrefix}/${group}/*` : '/api'
  }

  return '404'
}

function routeLabel(c: Context<{ Bindings: Env, Variables: Variables }>) {
  for (let i = c.req.matchedRoutes.length - 1; i >= 0; i--) {
    const route = c.req.matchedRoutes[i]
    if (route.method !== 'ALL')
      return route.path
  }

  return fallbackRouteLabel(c.req.path)
}

app.use('*', async (c, next) => {
  const start = Date.now()
  let thrown = false

  try {
    await next()
  }
  catch (err) {
    thrown = true
    throw err
  }
  finally {
    console.log(JSON.stringify({
      type: 'request_timing',
      route: routeLabel(c),
      path: c.req.path,
      method: c.req.method,
      status: thrown ? 500 : c.res.status,
      duration_ms: Date.now() - start,
    }))
  }
})

app.use('/api/*', cors({
  origin: (origin, c) => c.env.CORS_ORIGIN === '*' ? '*' : (c.env.CORS_ORIGIN ?? origin),
  allowHeaders: ['Content-Type', 'Authorization', 'token', 'lang'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 86400,
}))

const api = new Hono<{ Bindings: Env, Variables: Variables }>()

registerLoginRoutes(api)
registerUserRoutes(api)
registerPanelRoutes(api)
registerSystemRoutes(api)

api.notFound(c => error(c, `route not found: ${c.req.method} ${new URL(c.req.url).pathname}`))

app.route('/api', api)

app.get('/uploads/*', async (c) => {
  const pathname = new URL(c.req.url).pathname
  const object = await getUploadFromR2(c.env, pathname)
  if (!object)
    return c.notFound()

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  if (!headers.has('content-type'))
    headers.set('content-type', 'application/octet-stream')
  headers.set('cache-control', 'public, max-age=31536000, immutable')

  return new Response(object.body, { headers })
})

app.get('/', c => c.text('Sun Panel Cloudflare Worker API'))

export default app
