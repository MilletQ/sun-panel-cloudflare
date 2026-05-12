import type { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { errorByCode, errorParam, success, successData, successListData } from '../lib/api-response'
import { getSystemSettingString, placeholders, setSystemSetting } from '../lib/db'
import { refreshPanelHomeCacheAfterMutation } from '../lib/panel-home'
import { normalizeIds, normalizeNumber, normalizeString, readJson } from '../lib/request'
import { deleteUploadFromR2, isAllowedImage, storeImageInR2, toPublicUploadUrl } from '../lib/uploads'
import { loginRequired, publicMode } from '../middleware/auth'

type ModuleConfigBody = {
  name?: string
  value?: Record<string, unknown>
}

export function registerSystemRoutes(app: Hono<{ Bindings: Env; Variables: Variables }>) {
  app.post('/about', (c) => {
    return successData(c, {
      versionName: c.env.VERSION_NAME ?? '1.3.0',
      versionCode: Number(c.env.VERSION_CODE ?? 10),
    })
  })

  app.post('/system/moduleConfig/getByName', publicMode, async (c) => {
    const body = await readJson<ModuleConfigBody>(c)
    const name = normalizeString(body.name).trim()
    if (!name)
      return errorParam(c, 'name is required')

    const user = c.get('user')
    const row = await c.env.DB.prepare('SELECT value_json FROM module_config WHERE user_id = ? AND name = ? AND deleted_at IS NULL')
      .bind(user.id, name)
      .first<{ value_json: string }>()

    if (!row)
      return successData(c, null)

    try {
      return successData(c, JSON.parse(row.value_json || 'null'))
    }
    catch {
      return successData(c, null)
    }
  })

  app.post('/system/moduleConfig/save', loginRequired, async (c) => {
    const body = await readJson<ModuleConfigBody>(c)
    const name = normalizeString(body.name).trim()
    if (!name)
      return errorParam(c, 'name is required')

    const user = c.get('user')
    await c.env.DB.prepare(`
      INSERT INTO module_config (user_id, name, value_json)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, name) DO UPDATE SET value_json = excluded.value_json
    `)
      .bind(user.id, name, JSON.stringify(body.value ?? null))
      .run()

    if (name === 'deskModuleSearchBox')
      await refreshPanelHomeCacheAfterMutation(c.env, user, c.executionCtx)

    return success(c)
  })

  app.post('/notice/getListByDisplayType', async (c) => {
    const body = await readJson<{ displayType?: number[] }>(c)
    const displayTypes = Array.isArray(body.displayType)
      ? body.displayType.map(value => normalizeNumber(value)).filter(Boolean)
      : []

    if (displayTypes.length === 0)
      return successListData(c, [], 0)

    const rows = await c.env.DB.prepare(`
      SELECT
        id,
        created_at AS createTime,
        updated_at AS updateTime,
        title,
        content,
        display_type AS displayType,
        one_read AS oneRead,
        url,
        is_login AS isLogin
      FROM notice
      WHERE display_type IN (${placeholders(displayTypes)}) AND deleted_at IS NULL
      ORDER BY id DESC
    `)
      .bind(...displayTypes)
      .all<Record<string, unknown>>()

    return successListData(c, rows.results, 0)
  })

  app.post('/file/getList', loginRequired, async (c) => {
    const user = c.get('user')
    const rows = await c.env.DB.prepare(`
      SELECT
        id,
        created_at AS createTime,
        updated_at AS updateTime,
        src,
        src AS path,
        file_name AS fileName,
        method,
        ext
      FROM file
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `)
      .bind(user.id)
      .all<Record<string, unknown>>()

    const results = rows.results.map((row) => {
      const src = typeof row.src === 'string' ? toPublicUploadUrl(c.env, row.src) : row.src
      return {
        ...row,
        src,
        path: src,
      }
    })

    return successListData(c, results, results.length)
  })

  app.post('/file/deletes', loginRequired, async (c) => {
    const body = await readJson<Record<string, unknown>>(c)
    const ids = normalizeIds(body)
    const user = c.get('user')

    if (ids.length > 0) {
      const existing = await c.env.DB.prepare(`SELECT src FROM file WHERE user_id = ? AND id IN (${placeholders(ids)})`)
        .bind(user.id, ...ids)
        .all<{ src: string }>()

      for (const file of existing.results)
        await deleteUploadFromR2(c.env, file.src)

      await c.env.DB.prepare(`DELETE FROM file WHERE user_id = ? AND id IN (${placeholders(ids)})`)
        .bind(user.id, ...ids)
        .run()
    }

    return success(c)
  })

  app.post('/file/uploadImg', loginRequired, async (c) => {
    const user = c.get('user')
    let formData: FormData

    try {
      formData = await c.req.raw.formData()
    }
    catch {
      return errorByCode(c, 1300)
    }

    const file = formData.get('imgfile')
    if (!(file instanceof File))
      return errorByCode(c, 1300)

    if (!isAllowedImage(file))
      return errorByCode(c, 1301)

    const stored = await storeImageInR2(c.env, file)
    await c.env.DB.prepare(`
      INSERT INTO file (src, user_id, file_name, method, ext)
      VALUES (?, ?, ?, ?, ?)
    `)
      .bind(stored.publicUrl, user.id, stored.fileName, 1, stored.ext)
      .run()

    return successData(c, { imageUrl: stored.publicUrl })
  })

  app.post('/file/uploadFiles', loginRequired, async (c) => {
    const user = c.get('user')
    let formData: FormData

    try {
      formData = await c.req.raw.formData()
    }
    catch {
      return errorByCode(c, 1300)
    }

    const files = formData.getAll('files[]')
    const succMap: Record<string, string> = {}
    const errFiles: string[] = []

    for (const value of files) {
      if (!(value instanceof File) || !isAllowedImage(value)) {
        if (value instanceof File)
          errFiles.push(value.name)
        continue
      }

      try {
        const stored = await storeImageInR2(c.env, value)
        await c.env.DB.prepare(`
          INSERT INTO file (src, user_id, file_name, method, ext)
          VALUES (?, ?, ?, ?, ?)
        `)
          .bind(stored.publicUrl, user.id, stored.fileName, 1, stored.ext)
          .run()
        succMap[value.name] = stored.publicUrl
      }
      catch {
        errFiles.push(value.name)
      }
    }

    return successData(c, { succMap, errFiles })
  })

  app.get('/openness/loginConfig', async (c) => {
    const raw = await getSystemSettingString(c.env, 'system_application', '{}')
    let setting = {
      emailSuffix: '',
      openRegister: false,
      loginCaptcha: false,
      webSiteUrl: '',
    }
    try {
      setting = { ...setting, ...JSON.parse(raw) }
    }
    catch {
      await setSystemSetting(c.env, 'system_application', setting)
    }

    return successData(c, {
      loginCaptcha: setting.loginCaptcha,
      register: {
        emailSuffix: setting.emailSuffix,
        openRegister: setting.openRegister,
      },
    })
  })

  app.get('/openness/getDisclaimer', async (c) => {
    const content = await getSystemSettingString(c.env, 'disclaimer', '')
    return successData(c, content)
  })

  app.get('/openness/getAboutDescription', async (c) => {
    const content = await getSystemSettingString(c.env, 'web_about_description', '')
    return successData(c, content)
  })
}
