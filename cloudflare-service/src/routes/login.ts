import type { Hono } from 'hono'
import type { Env, UserRow, Variables } from '../types'
import { error, errorByCode, errorDatabase, errorParam, success, successData } from '../lib/api-response'
import { md5, passwordEncryption, randomCode } from '../lib/crypto'
import { firstUserByToken, mapUser, sanitizeUser } from '../lib/db'
import { normalizeString, readJson } from '../lib/request'
import { cacheClientToken, clearClientToken, loginRequired } from '../middleware/auth'

type LoginBody = {
  username?: string
  password?: string
  vcode?: string
}

export function registerLoginRoutes(app: Hono<{ Bindings: Env, Variables: Variables }>) {
  app.post('/login', async (c) => {
    const body = await readJson<LoginBody>(c)
    const username = normalizeString(body.username).trim()
    const password = normalizeString(body.password)

    if (!username || !password)
      return errorParam(c, 'username and password are required')

    const passwordHash = passwordEncryption(password)
    const row = await c.env.DB.prepare('SELECT * FROM user WHERE username = ? AND password = ? AND deleted_at IS NULL')
      .bind(username, passwordHash)
      .first<UserRow>()

    if (!row)
      return errorByCode(c, 1003)

    const user = mapUser(row)
    if (user.status !== 1)
      return errorByCode(c, 1004)

    let realToken = user.token
    if (!realToken) {
      for (let i = 0; i < 5; i++) {
        const candidate = randomCode(32)
        const exists = await firstUserByToken(c.env, candidate)
        if (!exists) {
          realToken = candidate
          break
        }
      }
    }

    if (!realToken)
      return error(c, 'token generation failed')

    if (realToken !== user.token) {
      await c.env.DB.prepare('UPDATE user SET token = ? WHERE id = ?')
        .bind(realToken, user.id)
        .run()
      user.token = realToken
    }

    const clientToken = `${crypto.randomUUID()}-${md5(md5(`userId${user.id}`))}`
    await cacheClientToken(c.env, clientToken, realToken, user)

    const responseUser = sanitizeUser(user)
    responseUser.token = clientToken
    return successData(c, responseUser)
  })

  app.post('/logout', loginRequired, async (c) => {
    const authorization = c.req.header('authorization') ?? ''
    const clientToken = c.req.header('token') ?? (authorization.startsWith('Bearer ') ? authorization.slice(7) : '')
    if (clientToken)
      await clearClientToken(c.env, clientToken)

    return success(c)
  })
}
