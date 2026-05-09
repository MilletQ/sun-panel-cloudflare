import type { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { errorByCode, errorDatabase, errorParam, success, successData } from '../lib/api-response'
import { cacheKey, deleteCache } from '../lib/cache'
import { passwordEncryption, randomCode } from '../lib/crypto'
import { firstUserById, sanitizeUser } from '../lib/db'
import { normalizeString, readJson } from '../lib/request'
import { toPublicUploadUrl, toStoredUploadPath } from '../lib/uploads'
import { loginRequired, publicMode } from '../middleware/auth'

type UpdateInfoBody = {
  headImage?: string
  name?: string
}

type UpdatePasswordBody = {
  oldPassword?: string
  newPassword?: string
}

export function registerUserRoutes(app: Hono<{ Bindings: Env, Variables: Variables }>) {
  app.post('/user/getInfo', loginRequired, (c) => {
    const user = c.get('user')
    return successData(c, {
      userId: user.id,
      id: user.id,
      headImage: toPublicUploadUrl(c.req.url, user.headImage),
      name: user.name,
      role: user.role,
    })
  })

  app.post('/user/getAuthInfo', publicMode, (c) => {
    const user = sanitizeUser(c.get('user'))
    return successData(c, {
      user: {
        id: user.id,
        userId: user.id,
        headImage: toPublicUploadUrl(c.req.url, user.headImage),
        name: user.name,
        role: user.role,
        username: user.username,
      },
      visitMode: c.get('visitMode'),
    })
  })

  app.post('/user/updateInfo', loginRequired, async (c) => {
    const body = await readJson<UpdateInfoBody>(c)
    const name = normalizeString(body.name).trim()
    const headImage = toStoredUploadPath(normalizeString(body.headImage))

    if (name.length < 3 || name.length > 15)
      return errorParam(c, 'name length must be between 3 and 15')

    const user = c.get('user')
    const result = await c.env.DB.prepare('UPDATE user SET name = ?, head_image = ? WHERE id = ?')
      .bind(name, headImage, user.id)
      .run()

    if (!result.success)
      return errorDatabase(c, 'failed to update user')

    if (user.token)
      await deleteCache(c.env, cacheKey.userToken(user.token))

    return success(c)
  })

  app.post('/user/updatePassword', loginRequired, async (c) => {
    const body = await readJson<UpdatePasswordBody>(c)
    const oldPassword = normalizeString(body.oldPassword)
    const newPassword = normalizeString(body.newPassword)

    if (!oldPassword || !newPassword)
      return errorParam(c, 'oldPassword and newPassword are required')

    const user = c.get('user')
    const storedUser = await firstUserById(c.env, user.id)
    if (!storedUser)
      return errorByCode(c, 1006)

    if (storedUser.password !== passwordEncryption(oldPassword))
      return errorByCode(c, 1007)

    const result = await c.env.DB.prepare('UPDATE user SET password = ?, token = ? WHERE id = ?')
      .bind(passwordEncryption(newPassword), '', user.id)
      .run()

    if (!result.success)
      return errorDatabase(c, 'failed to update password')

    if (storedUser.token)
      await deleteCache(c.env, cacheKey.userToken(storedUser.token))

    return success(c)
  })

  app.post('/user/getReferralCode', loginRequired, async (c) => {
    const user = c.get('user')
    const storedUser = await firstUserById(c.env, user.id)
    if (!storedUser)
      return errorByCode(c, 1006)

    let referralCode = storedUser.referralCode ?? ''
    if (!referralCode) {
      for (let i = 0; i < 8; i++) {
        const candidate = randomCode(8)
        const exists = await c.env.DB.prepare('SELECT id FROM user WHERE referral_code = ?')
          .bind(candidate)
          .first<{ id: number }>()

        if (!exists) {
          referralCode = candidate
          break
        }
      }

      if (!referralCode)
        return errorDatabase(c, 'failed to generate referral code')

      await c.env.DB.prepare('UPDATE user SET referral_code = ? WHERE id = ?')
        .bind(referralCode, user.id)
        .run()
    }

    return successData(c, { referralCode })
  })
}
