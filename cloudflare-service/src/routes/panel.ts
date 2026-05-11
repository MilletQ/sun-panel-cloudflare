import type { Hono } from 'hono'
import type { Env, ItemIcon, ItemIconGroupRow, ItemIconRow, SortItem, UserRow, Variables } from '../types'
import { error, errorByCode, errorParam, success, successData, successListData } from '../lib/api-response'
import { cacheKey, deleteCache, deletePanelHomeCache, getJson, putJson } from '../lib/cache'
import { passwordEncryption } from '../lib/crypto'
import { firstUserById, firstUserByUsername, getSystemSettingJson, mapItemIcon, mapItemIconGroup, mapUser, placeholders, sanitizeUser, setSystemSetting } from '../lib/db'
import { normalizeIds, normalizeNumber, normalizeString, readJson } from '../lib/request'
import { toStoredUploadPath, withPublicUploadUrls, withStoredUploadPaths } from '../lib/uploads'
import { adminRequired, loginRequired, publicMode } from '../middleware/auth'

type UserConfigBody = {
  panel?: Record<string, unknown>
  searchEngine?: Record<string, unknown>
}

type ItemIconGroupBody = {
  id?: number
  icon?: string
  title?: string
  description?: string
  sort?: number
}

type ItemIconBody = {
  id?: number
  icon?: Record<string, unknown> | null
  title?: string
  url?: string
  lanUrl?: string
  description?: string
  openMethod?: number
  sort?: number
  itemIconGroupId?: number
}

type UserBody = {
  id?: number
  username?: string
  password?: string
  name?: string
  headImage?: string
  status?: number
  role?: number
  mail?: string
}

type ListBody = {
  limit?: number
  page?: number
  keyword?: string
}

async function getOrCreateGroups(env: Env, userId: number) {
  const rows = await env.DB.prepare('SELECT * FROM item_icon_group WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort, created_at')
    .bind(userId)
    .all<ItemIconGroupRow>()

  if (rows.results.length > 0)
    return rows.results.map(mapItemIconGroup)

  const inserted = await env.DB.prepare('INSERT INTO item_icon_group (title, user_id, icon) VALUES (?, ?, ?)')
    .bind('APP', userId, 'material-symbols:ad-group-outline')
    .run()

  const id = Number(inserted.meta.last_row_id)
  await env.DB.prepare('UPDATE item_icon SET item_icon_group_id = ? WHERE user_id = ? AND item_icon_group_id = 0')
    .bind(id, userId)
    .run()

  const row = await env.DB.prepare('SELECT * FROM item_icon_group WHERE id = ?')
    .bind(id)
    .first<ItemIconGroupRow>()

  return row ? [mapItemIconGroup(row)] : []
}

async function discoverFavicon(env: Env, rawUrl: string) {
  const cached = await env.CACHE.get(cacheKey.favicon(rawUrl))
  if (cached)
    return cached

  const hasProtocol = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
  const site = new URL(hasProtocol ? rawUrl : `https://${rawUrl}`)
  let iconUrl = new URL('/favicon.ico', site).toString()

  try {
    const response = await fetch(site.toString(), {
      headers: {
        'user-agent': 'Sun-Panel Cloudflare Worker',
      },
    })
    const html = await response.text()
    const match = html.match(/<link[^>]+rel=["'][^"']*(?:icon|shortcut icon|apple-touch-icon)[^"']*["'][^>]*>/i)
    const href = match?.[0].match(/href=["']([^"']+)["']/i)?.[1]
    if (href)
      iconUrl = new URL(href, site).toString()
  }
  catch {
    iconUrl = new URL('/favicon.ico', site).toString()
  }

  await env.CACHE.put(cacheKey.favicon(rawUrl), iconUrl, { expirationTtl: 60 * 60 * 24 })
  return iconUrl
}

function mapPublicItemIcon(env: Env, row: ItemIconRow) {
  return withPublicUploadUrls(env, mapItemIcon(row))
}

const panelHomeCacheTtl = 60 * 5

export function registerPanelRoutes(app: Hono<{ Bindings: Env; Variables: Variables }>) {
  app.post('/panel/home/getData', publicMode, async (c) => {
    const user = c.get('user')
    const visitMode = c.get('visitMode')
    const homeCacheKey = cacheKey.panelHome(user.id, visitMode)
    const cached = await getJson(c.env, homeCacheKey)
    if (cached !== null)
      return successData(c, cached)

    const [configRow, searchBoxRow] = await Promise.all([
      c.env.DB.prepare('SELECT panel_json, search_engine_json FROM user_config WHERE user_id = ?')
        .bind(user.id)
        .first<{ panel_json: string; search_engine_json: string }>(),
      c.env.DB.prepare('SELECT value_json FROM module_config WHERE user_id = ? AND name = ? AND deleted_at IS NULL')
        .bind(user.id, 'deskModuleSearchBox')
        .first<{ value_json: string }>(),
    ])

    const groups = await getOrCreateGroups(c.env, user.id)
    const iconRows = await c.env.DB.prepare(`
      SELECT * FROM item_icon
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY item_icon_group_id, sort, created_at
    `)
      .bind(user.id)
      .all<ItemIconRow>()

    const itemsByGroupId = new Map<number, ItemIcon[]>()
    for (const row of iconRows.results) {
      const item = mapPublicItemIcon(c.env, row)
      const list = itemsByGroupId.get(item.itemIconGroupId) ?? []
      list.push(item)
      itemsByGroupId.set(item.itemIconGroupId, list)
    }

    let panel: Record<string, unknown> | null = null
    let searchEngine: Record<string, unknown> | null = null
    let searchBox: Record<string, unknown> | null = null

    try {
      panel = withPublicUploadUrls(c.env, JSON.parse(configRow?.panel_json || 'null'))
      searchEngine = withPublicUploadUrls(c.env, JSON.parse(configRow?.search_engine_json || 'null'))
      searchBox = withPublicUploadUrls(c.env, JSON.parse(searchBoxRow?.value_json || 'null'))
    }
    catch {
      panel = null
      searchEngine = null
      searchBox = null
    }

    const homeData = {
      user: withPublicUploadUrls(c.env, sanitizeUser(user)),
      visitMode,
      panel,
      searchEngine,
      searchBox,
      itemIconGroups: groups.map(group => ({
        ...group,
        items: itemsByGroupId.get(group.id ?? 0) ?? [],
      })),
    }

    await putJson(c.env, homeCacheKey, homeData, panelHomeCacheTtl)
    return successData(c, homeData)
  })

  app.post('/panel/userConfig/get', publicMode, async (c) => {
    const user = c.get('user')
    const row = await c.env.DB.prepare('SELECT * FROM user_config WHERE user_id = ?')
      .bind(user.id)
      .first<{ panel_json: string; search_engine_json: string; user_id: number }>()

    if (!row)
      return errorByCode(c, -1, 'No data record found')

    let panel: Record<string, unknown> | null = null
    let searchEngine: Record<string, unknown> | null = null
    try {
      panel = withPublicUploadUrls(c.env, JSON.parse(row.panel_json || 'null'))
      searchEngine = withPublicUploadUrls(c.env, JSON.parse(row.search_engine_json || 'null'))
    }
    catch {
      panel = null
      searchEngine = null
    }

    return successData(c, {
      userId: row.user_id,
      panel,
      searchEngine,
    })
  })

  app.post('/panel/userConfig/set', loginRequired, async (c) => {
    const body = await readJson<UserConfigBody>(c)
    const user = c.get('user')
    const panel = withStoredUploadPaths(body.panel ?? {})
    const searchEngine = withStoredUploadPaths(body.searchEngine ?? {})

    await c.env.DB.prepare(`
      INSERT INTO user_config (user_id, panel_json, search_engine_json)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        panel_json = excluded.panel_json,
        search_engine_json = excluded.search_engine_json
    `)
      .bind(user.id, JSON.stringify(panel), JSON.stringify(searchEngine))
      .run()

    await deletePanelHomeCache(c.env, user.id)
    return success(c)
  })

  app.post('/panel/itemIconGroup/getList', publicMode, async (c) => {
    const user = c.get('user')
    const groups = await getOrCreateGroups(c.env, user.id)
    return successListData(c, groups, 0)
  })

  app.post('/panel/itemIconGroup/edit', loginRequired, async (c) => {
    const body = await readJson<ItemIconGroupBody>(c)
    const user = c.get('user')
    const id = normalizeNumber(body.id)
    const sort = normalizeNumber(body.sort)
    let savedId = id

    if (id > 0) {
      await c.env.DB.prepare(`
        UPDATE item_icon_group
        SET icon = ?, title = ?, description = ?, sort = COALESCE(NULLIF(?, 0), sort)
        WHERE id = ? AND user_id = ?
      `)
        .bind(
          normalizeString(body.icon),
          normalizeString(body.title),
          normalizeString(body.description),
          sort,
          id,
          user.id,
        )
        .run()
    }
    else {
      const inserted = await c.env.DB.prepare(`
        INSERT INTO item_icon_group (icon, title, description, sort, user_id)
        VALUES (?, ?, ?, ?, ?)
      `)
        .bind(
          normalizeString(body.icon),
          normalizeString(body.title),
          normalizeString(body.description),
          sort,
          user.id,
        )
        .run()
      savedId = Number(inserted.meta.last_row_id)
    }

    const row = await c.env.DB.prepare('SELECT * FROM item_icon_group WHERE id = ? AND user_id = ?')
      .bind(savedId, user.id)
      .first<ItemIconGroupRow>()

    await deletePanelHomeCache(c.env, user.id)
    return successData(c, row ? mapItemIconGroup(row) : { id: savedId })
  })

  app.post('/panel/itemIconGroup/deletes', loginRequired, async (c) => {
    const body = await readJson<Record<string, unknown>>(c)
    const ids = normalizeIds(body)
    const user = c.get('user')

    if (ids.length === 0)
      return success(c)

    const countRow = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM item_icon_group WHERE user_id = ? AND deleted_at IS NULL')
      .bind(user.id)
      .first<{ count: number }>()
    if ((countRow?.count ?? 0) <= ids.length)
      return errorByCode(c, 1201)

    const inSql = placeholders(ids)
    await c.env.DB.prepare(`DELETE FROM item_icon WHERE user_id = ? AND item_icon_group_id IN (${inSql})`)
      .bind(user.id, ...ids)
      .run()
    await c.env.DB.prepare(`DELETE FROM item_icon_group WHERE user_id = ? AND id IN (${inSql})`)
      .bind(user.id, ...ids)
      .run()

    await deletePanelHomeCache(c.env, user.id)
    return success(c)
  })

  app.post('/panel/itemIconGroup/saveSort', loginRequired, async (c) => {
    const body = await readJson<{ sortItems?: SortItem[] }>(c)
    const user = c.get('user')
    const sortItems = Array.isArray(body.sortItems) ? body.sortItems : []

    for (const item of sortItems) {
      await c.env.DB.prepare('UPDATE item_icon_group SET sort = ? WHERE user_id = ? AND id = ?')
        .bind(normalizeNumber(item.sort), user.id, normalizeNumber(item.id))
        .run()
    }

    await deletePanelHomeCache(c.env, user.id)
    return success(c)
  })

  app.post('/panel/itemIcon/getListByGroupId', publicMode, async (c) => {
    const body = await readJson<{ itemIconGroupId?: number }>(c)
    const groupId = normalizeNumber(body.itemIconGroupId)
    const user = c.get('user')

    const rows = await c.env.DB.prepare(`
      SELECT * FROM item_icon
      WHERE item_icon_group_id = ? AND user_id = ? AND deleted_at IS NULL
      ORDER BY sort, created_at
    `)
      .bind(groupId, user.id)
      .all<ItemIconRow>()

    return successListData(c, rows.results.map(row => mapPublicItemIcon(c.env, row)), 0)
  })

  app.post('/panel/itemIcon/edit', loginRequired, async (c) => {
    const body = await readJson<ItemIconBody>(c)
    const groupId = normalizeNumber(body.itemIconGroupId)
    if (!groupId)
      return errorParam(c, 'Group is mandatory')

    const user = c.get('user')
    const id = normalizeNumber(body.id)
    const iconJson = JSON.stringify(withStoredUploadPaths(body.icon ?? null))
    let savedId = id

    if (id > 0) {
      await c.env.DB.prepare(`
        UPDATE item_icon
        SET icon_json = ?, title = ?, url = ?, lan_url = ?, description = ?, open_method = ?,
            item_icon_group_id = ?, sort = COALESCE(NULLIF(?, 0), sort)
        WHERE id = ? AND user_id = ?
      `)
        .bind(
          iconJson,
          normalizeString(body.title),
          normalizeString(body.url),
          normalizeString(body.lanUrl),
          normalizeString(body.description),
          normalizeNumber(body.openMethod),
          groupId,
          normalizeNumber(body.sort),
          id,
          user.id,
        )
        .run()
    }
    else {
      const inserted = await c.env.DB.prepare(`
        INSERT INTO item_icon (icon_json, title, url, lan_url, description, open_method, sort, item_icon_group_id, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          iconJson,
          normalizeString(body.title),
          normalizeString(body.url),
          normalizeString(body.lanUrl),
          normalizeString(body.description),
          normalizeNumber(body.openMethod),
          9999,
          groupId,
          user.id,
        )
        .run()
      savedId = Number(inserted.meta.last_row_id)
    }

    const row = await c.env.DB.prepare('SELECT * FROM item_icon WHERE id = ? AND user_id = ?')
      .bind(savedId, user.id)
      .first<ItemIconRow>()

    await deletePanelHomeCache(c.env, user.id)
    return successData(c, row ? mapPublicItemIcon(c.env, row) : { id: savedId })
  })

  app.post('/panel/itemIcon/addMultiple', loginRequired, async (c) => {
    const body = await readJson<ItemIconBody[]>(c)
    if (!Array.isArray(body))
      return errorParam(c, 'request body must be an array')

    const user = c.get('user')
    const saved: ItemIcon[] = []

    for (const item of body) {
      const groupId = normalizeNumber(item.itemIconGroupId)
      if (!groupId)
        return errorParam(c, 'Group is mandatory')

      const inserted = await c.env.DB.prepare(`
        INSERT INTO item_icon (icon_json, title, url, lan_url, description, open_method, sort, item_icon_group_id, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          JSON.stringify(withStoredUploadPaths(item.icon ?? null)),
          normalizeString(item.title),
          normalizeString(item.url),
          normalizeString(item.lanUrl),
          normalizeString(item.description),
          normalizeNumber(item.openMethod),
          9999,
          groupId,
          user.id,
        )
        .run()

      const row = await c.env.DB.prepare('SELECT * FROM item_icon WHERE id = ?')
        .bind(Number(inserted.meta.last_row_id))
        .first<ItemIconRow>()
      if (row)
        saved.push(mapPublicItemIcon(c.env, row))
    }

    await deletePanelHomeCache(c.env, user.id)
    return successData(c, saved)
  })

  app.post('/panel/itemIcon/deletes', loginRequired, async (c) => {
    const body = await readJson<Record<string, unknown>>(c)
    const ids = normalizeIds(body)
    const user = c.get('user')

    if (ids.length > 0) {
      await c.env.DB.prepare(`DELETE FROM item_icon WHERE user_id = ? AND id IN (${placeholders(ids)})`)
        .bind(user.id, ...ids)
        .run()
      await deletePanelHomeCache(c.env, user.id)
    }

    return success(c)
  })

  app.post('/panel/itemIcon/saveSort', loginRequired, async (c) => {
    const body = await readJson<{ sortItems?: SortItem[]; itemIconGroupId?: number }>(c)
    const user = c.get('user')
    const groupId = normalizeNumber(body.itemIconGroupId)
    const sortItems = Array.isArray(body.sortItems) ? body.sortItems : []

    for (const item of sortItems) {
      await c.env.DB.prepare('UPDATE item_icon SET sort = ? WHERE user_id = ? AND id = ? AND item_icon_group_id = ?')
        .bind(normalizeNumber(item.sort), user.id, normalizeNumber(item.id), groupId)
        .run()
    }

    await deletePanelHomeCache(c.env, user.id)
    return success(c)
  })

  app.post('/panel/itemIcon/getSiteFavicon', loginRequired, async (c) => {
    const body = await readJson<{ url?: string }>(c)
    const url = normalizeString(body.url).trim()
    if (!url)
      return errorParam(c, 'url is required')

    try {
      const iconUrl = await discoverFavicon(c.env, url)
      return successData(c, { iconUrl })
    }
    catch (err) {
      return error(c, `acquisition failed:${err instanceof Error ? err.message : String(err)}`)
    }
  })

  app.post('/panel/users/create', loginRequired, adminRequired, async (c) => {
    const body = await readJson<UserBody>(c)
    const username = normalizeString(body.username).trim()
    const password = normalizeString(body.password)
    if (username.length < 5)
      return errorParam(c, 'The account must be no less than 5 characters long')
    if (!password)
      return errorParam(c, 'password is required')

    const exists = await firstUserByUsername(c.env, username)
    if (exists)
      return errorByCode(c, 1006)

    const inserted = await c.env.DB.prepare(`
      INSERT INTO user (username, password, name, head_image, status, role, mail)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        username,
        passwordEncryption(password),
        normalizeString(body.name, username),
        toStoredUploadPath(normalizeString(body.headImage)),
        1,
        normalizeNumber(body.role, 2),
        normalizeString(body.mail),
      )
      .run()

    return successData(c, { userId: Number(inserted.meta.last_row_id) })
  })

  app.post('/panel/users/update', loginRequired, adminRequired, async (c) => {
    const body = await readJson<UserBody>(c)
    const id = normalizeNumber(body.id)
    const username = normalizeString(body.username).trim()
    if (!id)
      return errorParam(c, 'id is required')
    if (username.length < 3)
      return errorParam(c, 'The account must be no less than 3 characters long')

    const exists = await firstUserByUsername(c.env, username)
    if (exists && exists.id !== id)
      return errorByCode(c, 1006)

    const storedUser = await firstUserById(c.env, id)
    const password = normalizeString(body.password)
    const passwordSql = password ? ', password = ?' : ''
    const params: unknown[] = [
      username,
      normalizeString(body.name),
      normalizeString(body.mail),
      toStoredUploadPath(normalizeString(body.headImage)),
      normalizeNumber(body.status, 1),
      normalizeNumber(body.role, 2),
      '',
    ]
    if (password)
      params.push(passwordEncryption(password))
    params.push(id)

    await c.env.DB.prepare(`
      UPDATE user
      SET username = ?, name = ?, mail = ?, head_image = ?, status = ?, role = ?, token = ?${passwordSql}
      WHERE id = ?
    `)
      .bind(...params)
      .run()

    if (storedUser?.token)
      await deleteCache(c.env, cacheKey.userToken(storedUser.token))

    await deletePanelHomeCache(c.env, id)
    const updated = await firstUserById(c.env, id)
    return successData(c, updated ? withPublicUploadUrls(c.env, sanitizeUser(updated)) : { id })
  })

  app.post('/panel/users/getList', loginRequired, adminRequired, async (c) => {
    const body = await readJson<ListBody>(c)
    const limit = Math.max(1, normalizeNumber(body.limit, 20))
    const page = Math.max(1, normalizeNumber(body.page, 1))
    const keyword = `%${normalizeString(body.keyword).trim()}%`
    const offset = (page - 1) * limit

    const whereSql = body.keyword ? 'WHERE (name LIKE ? OR username LIKE ?) AND deleted_at IS NULL' : 'WHERE deleted_at IS NULL'
    const listParams = body.keyword ? [keyword, keyword, limit, offset] : [limit, offset]
    const countParams = body.keyword ? [keyword, keyword] : []

    const rows = await c.env.DB.prepare(`
      SELECT * FROM user ${whereSql}
      ORDER BY id
      LIMIT ? OFFSET ?
    `)
      .bind(...listParams)
      .all<UserRow>()

    const countRow = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM user ${whereSql}`)
      .bind(...countParams)
      .first<{ count: number }>()

    return successListData(c, rows.results.map(row => withPublicUploadUrls(c.env, sanitizeUser(mapUser(row)))), countRow?.count ?? 0)
  })

  app.post('/panel/users/deletes', loginRequired, adminRequired, async (c) => {
    const body = await readJson<Record<string, unknown>>(c)
    const userIds = normalizeIds(body, 'userIds')

    if (userIds.length === 0)
      return success(c)

    const inSql = placeholders(userIds)
    const remainingAdmins = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM user WHERE role = 1 AND id NOT IN (${inSql})`)
      .bind(...userIds)
      .first<{ count: number }>()

    if ((remainingAdmins?.count ?? 0) === 0)
      return errorByCode(c, 1201)

    for (const userId of userIds) {
      await c.env.DB.prepare('DELETE FROM item_icon WHERE user_id = ?').bind(userId).run()
      await c.env.DB.prepare('DELETE FROM item_icon_group WHERE user_id = ?').bind(userId).run()
      await c.env.DB.prepare('DELETE FROM module_config WHERE user_id = ?').bind(userId).run()
      await c.env.DB.prepare('DELETE FROM user_config WHERE user_id = ?').bind(userId).run()
    }
    await c.env.DB.prepare(`DELETE FROM user WHERE id IN (${inSql})`).bind(...userIds).run()

    return success(c)
  })

  app.post('/panel/users/getPublicVisitUser', loginRequired, adminRequired, async (c) => {
    const publicUserId = await getSystemSettingJson<number | null>(c.env, 'panel_public_user_id', null)
    if (!publicUserId)
      return errorByCode(c, -1, 'No data record found')

    const user = await firstUserById(c.env, publicUserId)
    if (!user)
      return errorByCode(c, -1, 'No data record found')

    return successData(c, withPublicUploadUrls(c.env, sanitizeUser(user)))
  })

  app.post('/panel/users/setPublicVisitUser', loginRequired, adminRequired, async (c) => {
    const body = await readJson<{ userId?: number | null }>(c)
    const userId = body.userId === null ? null : normalizeNumber(body.userId)
    if (userId) {
      const user = await firstUserById(c.env, userId)
      if (!user)
        return errorByCode(c, -1, 'No data record found')
    }

    const previousPublicUserId = await getSystemSettingJson<number | null>(c.env, 'panel_public_user_id', null)
    await setSystemSetting(c.env, 'panel_public_user_id', userId || null)
    if (previousPublicUserId)
      await deletePanelHomeCache(c.env, previousPublicUserId)
    if (userId && userId !== previousPublicUserId)
      await deletePanelHomeCache(c.env, userId)
    return success(c)
  })
}
