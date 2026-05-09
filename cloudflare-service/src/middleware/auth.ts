import type { MiddlewareHandler } from 'hono'
import type { Env, User, Variables } from '../types'
import { VisitMode } from '../types'
import { errorByCode } from '../lib/api-response'
import { cacheKey, deleteCache, getJson, putJson } from '../lib/cache'
import { firstUserById, firstUserByToken, getSystemSettingJson, sanitizeUser } from '../lib/db'

const userCacheTtl = 60 * 60

function getRequestToken(c: Parameters<MiddlewareHandler<{ Bindings: Env, Variables: Variables }>>[0]) {
  const tokenHeader = c.req.header('token')
  if (tokenHeader)
    return tokenHeader

  const authorization = c.req.header('authorization') ?? ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
}

export async function resolveUserFromClientToken(env: Env, clientToken: string) {
  const realToken = await getJson<string>(env, cacheKey.clientToken(clientToken))
  if (!realToken)
    return null

  const cachedUser = await getJson<User>(env, cacheKey.userToken(realToken))
  if (cachedUser)
    return cachedUser

  const user = await firstUserByToken(env, realToken)
  if (!user)
    return null

  const cached = sanitizeUser(user)
  await putJson(env, cacheKey.userToken(realToken), cached, userCacheTtl)
  return cached
}

export async function cacheClientToken(env: Env, clientToken: string, realToken: string, user: User) {
  await putJson(env, cacheKey.clientToken(clientToken), realToken, 60 * 60 * 72)
  await putJson(env, cacheKey.userToken(realToken), sanitizeUser(user), userCacheTtl)
}

export async function clearClientToken(env: Env, clientToken: string) {
  const realToken = await getJson<string>(env, cacheKey.clientToken(clientToken))
  await deleteCache(env, cacheKey.clientToken(clientToken))
  if (realToken)
    await deleteCache(env, cacheKey.userToken(realToken))
}

export const loginRequired: MiddlewareHandler<{ Bindings: Env, Variables: Variables }> = async (c, next) => {
  const clientToken = getRequestToken(c)
  if (!clientToken)
    return errorByCode(c, 1000)

  const user = await resolveUserFromClientToken(c.env, clientToken)
  if (!user)
    return errorByCode(c, 1001)

  c.set('user', user)
  c.set('visitMode', VisitMode.Login)
  await next()
}

export const publicMode: MiddlewareHandler<{ Bindings: Env, Variables: Variables }> = async (c, next) => {
  const clientToken = getRequestToken(c)
  if (clientToken) {
    const user = await resolveUserFromClientToken(c.env, clientToken)
    if (user) {
      c.set('user', user)
      c.set('visitMode', VisitMode.Login)
      await next()
      return
    }
  }

  const publicUserId = await getSystemSettingJson<number | null>(c.env, 'panel_public_user_id', null)
  if (!publicUserId)
    return errorByCode(c, 1001)

  const publicUser = await firstUserById(c.env, publicUserId)
  if (!publicUser)
    return errorByCode(c, 1001)

  c.set('user', sanitizeUser(publicUser))
  c.set('visitMode', VisitMode.Public)
  await next()
}

export const adminRequired: MiddlewareHandler<{ Bindings: Env, Variables: Variables }> = async (c, next) => {
  const user = c.get('user')
  if (!user || user.role !== 1)
    return errorByCode(c, 1005)

  await next()
}
