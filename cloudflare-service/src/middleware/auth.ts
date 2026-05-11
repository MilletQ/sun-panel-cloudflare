import type { MiddlewareHandler } from 'hono'
import type { Env, User, Variables } from '../types'
import { VisitMode } from '../types'
import { errorByCode } from '../lib/api-response'
import { cacheKey, deleteCache, getJson, getJsonWithMeta, putJson } from '../lib/cache'
import { firstUserById, firstUserByToken, getSystemSettingJson, sanitizeUser } from '../lib/db'

const userCacheTtl = 60 * 60
const clientTokenCacheTtl = 60 * 60 * 72

type ClientSession = {
  realToken: string
  user: User
}

function elapsedMs(start: number) {
  return Date.now() - start
}

function shouldLogPanelHomeAuthTiming(pathname: string) {
  return pathname.endsWith('/panel/home/getData')
}

function logPublicModeTiming(shouldLog: boolean, timing: Record<string, unknown>, start: number) {
  if (!shouldLog)
    return

  console.log(JSON.stringify({
    type: 'public_mode_timing',
    ...timing,
    public_mode_total_ms: elapsedMs(start),
  }))
}

function getRequestToken(c: Parameters<MiddlewareHandler<{ Bindings: Env, Variables: Variables }>>[0]) {
  const tokenHeader = c.req.header('token')
  if (tokenHeader)
    return tokenHeader

  const authorization = c.req.header('authorization') ?? ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
}

function isClientSession(value: unknown): value is ClientSession {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as ClientSession).realToken === 'string'
    && typeof (value as ClientSession).user === 'object',
  )
}

async function cacheUserClientToken(env: Env, userId: number, clientToken: string) {
  const cached = await getJson<string[]>(env, cacheKey.userClientTokens(userId))
  const tokens = Array.isArray(cached) ? cached : []
  if (!tokens.includes(clientToken))
    tokens.push(clientToken)

  await putJson(env, cacheKey.userClientTokens(userId), tokens, clientTokenCacheTtl)
}

async function removeUserClientToken(env: Env, userId: number, clientToken: string) {
  const cached = await getJson<string[]>(env, cacheKey.userClientTokens(userId))
  if (!Array.isArray(cached))
    return

  await putJson(
    env,
    cacheKey.userClientTokens(userId),
    cached.filter(token => token !== clientToken),
    clientTokenCacheTtl,
  )
}

async function putClientSession(env: Env, clientToken: string, realToken: string, user: User) {
  const cached = sanitizeUser(user)
  await Promise.all([
    putJson(env, cacheKey.clientToken(clientToken), { realToken, user: cached }, clientTokenCacheTtl),
    putJson(env, cacheKey.userToken(realToken), cached, userCacheTtl),
    cacheUserClientToken(env, cached.id, clientToken),
  ])
}

export async function refreshUserAuthSessions(env: Env, user: User) {
  if (!user.token)
    return

  const cached = sanitizeUser(user)
  const clientTokens = await getJson<string[]>(env, cacheKey.userClientTokens(user.id))
  const tokens = Array.isArray(clientTokens) ? clientTokens : []
  await Promise.all([
    putJson(env, cacheKey.userToken(user.token), cached, userCacheTtl),
    ...tokens.map(clientToken => putJson(env, cacheKey.clientToken(clientToken), {
      realToken: user.token,
      user: cached,
    }, clientTokenCacheTtl)),
  ])
}

export async function clearUserAuthSessions(env: Env, userId: number, realToken?: string) {
  const clientTokens = await getJson<string[]>(env, cacheKey.userClientTokens(userId))
  const tokens = Array.isArray(clientTokens) ? clientTokens : []
  await Promise.all([
    ...tokens.map(clientToken => deleteCache(env, cacheKey.clientToken(clientToken))),
    deleteCache(env, cacheKey.userClientTokens(userId)),
    realToken ? deleteCache(env, cacheKey.userToken(realToken)) : Promise.resolve(),
  ])
}

export async function resolveUserFromClientToken(
  env: Env,
  clientToken: string,
  timing?: Record<string, unknown>,
  executionCtx?: ExecutionContext,
) {
  const clientTokenCacheStart = Date.now()
  const sessionResult = await getJsonWithMeta<ClientSession | string>(env, cacheKey.clientToken(clientToken))
  const session = sessionResult.value
  if (timing)
    timing.client_token_cache_get_ms = elapsedMs(clientTokenCacheStart)
  if (timing)
    timing.client_token_local_cache_hit = sessionResult.localHit

  if (!session) {
    if (timing)
      timing.auth_user_source = 'client_token_cache_miss'
    return null
  }

  if (isClientSession(session)) {
    if (timing)
      timing.auth_user_source = 'client_session_cache_hit'
    return session.user
  }

  const realToken = session
  const userTokenCacheStart = Date.now()
  const cachedUserResult = await getJsonWithMeta<User>(env, cacheKey.userToken(realToken))
  const cachedUser = cachedUserResult.value
  if (timing)
    timing.user_token_cache_get_ms = elapsedMs(userTokenCacheStart)
  if (timing)
    timing.user_token_local_cache_hit = cachedUserResult.localHit

  if (cachedUser) {
    if (timing)
      timing.auth_user_source = 'user_token_cache_hit'
    const upgrade = putClientSession(env, clientToken, realToken, cachedUser)
    if (executionCtx)
      executionCtx.waitUntil(upgrade)
    else
      await upgrade
    if (timing)
      timing.auth_session_upgrade_scheduled = Boolean(executionCtx)
    return cachedUser
  }

  const userDbStart = Date.now()
  const user = await firstUserByToken(env, realToken)
  if (timing)
    timing.user_token_db_ms = elapsedMs(userDbStart)

  if (!user) {
    if (timing)
      timing.auth_user_source = 'user_token_db_miss'
    return null
  }

  const cached = sanitizeUser(user)
  const upgrade = putClientSession(env, clientToken, realToken, cached)
  if (executionCtx)
    executionCtx.waitUntil(upgrade)
  else
    await upgrade

  if (timing) {
    timing.auth_session_upgrade_scheduled = Boolean(executionCtx)
    timing.auth_user_source = 'user_token_db_hit'
  }

  return cached
}

export async function cacheClientToken(env: Env, clientToken: string, realToken: string, user: User) {
  await putClientSession(env, clientToken, realToken, user)
}

export async function clearClientToken(env: Env, clientToken: string) {
  const session = await getJson<ClientSession | string>(env, cacheKey.clientToken(clientToken))
  const realToken = typeof session === 'string' ? session : session?.realToken
  const userId = isClientSession(session) ? session.user.id : undefined

  await deleteCache(env, cacheKey.clientToken(clientToken))
  if (userId)
    await removeUserClientToken(env, userId, clientToken)

  if (realToken)
    await deleteCache(env, cacheKey.userToken(realToken))
}

export const loginRequired: MiddlewareHandler<{ Bindings: Env, Variables: Variables }> = async (c, next) => {
  const clientToken = getRequestToken(c)
  if (!clientToken)
    return errorByCode(c, 1000)

  const user = await resolveUserFromClientToken(c.env, clientToken, undefined, c.executionCtx)
  if (!user)
    return errorByCode(c, 1001)

  c.set('user', user)
  c.set('visitMode', VisitMode.Login)
  await next()
}

export const publicMode: MiddlewareHandler<{ Bindings: Env, Variables: Variables }> = async (c, next) => {
  const start = Date.now()
  const shouldLog = shouldLogPanelHomeAuthTiming(c.req.path)
  const timing: Record<string, unknown> = {
    route: '/api/panel/home/getData',
    path: c.req.path,
    method: c.req.method,
  }

  const clientToken = getRequestToken(c)
  timing.has_client_token = Boolean(clientToken)

  if (clientToken) {
    const user = await resolveUserFromClientToken(c.env, clientToken, shouldLog ? timing : undefined, c.executionCtx)
    timing.client_token_valid = Boolean(user)
    if (user) {
      c.set('user', user)
      c.set('visitMode', VisitMode.Login)
      timing.visit_mode = VisitMode.Login
      logPublicModeTiming(shouldLog, timing, start)
      await next()
      return
    }
  }

  const publicUserSettingStart = Date.now()
  const publicUserId = await getSystemSettingJson<number | null>(c.env, 'panel_public_user_id', null)
  timing.public_user_setting_ms = elapsedMs(publicUserSettingStart)
  timing.has_public_user_id = Boolean(publicUserId)

  if (!publicUserId) {
    logPublicModeTiming(shouldLog, timing, start)
    return errorByCode(c, 1001)
  }

  const publicUserDbStart = Date.now()
  const publicUser = await firstUserById(c.env, publicUserId)
  timing.public_user_db_ms = elapsedMs(publicUserDbStart)
  timing.public_user_found = Boolean(publicUser)

  if (!publicUser) {
    logPublicModeTiming(shouldLog, timing, start)
    return errorByCode(c, 1001)
  }

  c.set('user', sanitizeUser(publicUser))
  c.set('visitMode', VisitMode.Public)
  timing.visit_mode = VisitMode.Public
  logPublicModeTiming(shouldLog, timing, start)
  await next()
}

export const adminRequired: MiddlewareHandler<{ Bindings: Env, Variables: Variables }> = async (c, next) => {
  const user = c.get('user')
  if (!user || user.role !== 1)
    return errorByCode(c, 1005)

  await next()
}
