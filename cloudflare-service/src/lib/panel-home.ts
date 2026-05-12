import type { Env, ItemIcon, ItemIconGroupRow, ItemIconRow, User } from '../types'
import { VisitMode } from '../types'
import { cacheKey, getJsonWithMeta, invalidatePanelHomeFreshCache, putEdgeJson, putJson } from './cache'
import { mapItemIcon, mapItemIconGroup, sanitizeUser } from './db'
import { withPublicUploadUrls } from './uploads'

type PanelHomeConfigRow = {
  panel_json: string | null
  search_engine_json: string | null
  search_box_json: string | null
}

type PanelHomeReadResult<T> = {
  data: T | null
  stale: boolean
  edgeWarm?: Promise<void>
}

export const panelHomeCacheTtl = 60 * 60 * 24 * 30
export const panelHomeEdgeCacheTtl = 60 * 10

function elapsedMs(start: number) {
  return Date.now() - start
}

async function timed<T>(handler: () => Promise<T>) {
  const start = Date.now()
  const value = await handler()
  return {
    value,
    durationMs: elapsedMs(start),
  }
}

export async function getOrCreateGroups(env: Env, userId: number) {
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

export function mapPublicItemIcon(env: Env, row: ItemIconRow) {
  return withPublicUploadUrls(env, mapItemIcon(row))
}

export async function buildPanelHomeData(
  env: Env,
  user: User,
  visitMode: VisitMode,
  timing?: Record<string, unknown>,
) {
  const configPromise = timed(() => env.DB.prepare(`
    SELECT
      (SELECT panel_json FROM user_config WHERE user_id = ?) AS panel_json,
      (SELECT search_engine_json FROM user_config WHERE user_id = ?) AS search_engine_json,
      (
        SELECT value_json
        FROM module_config
        WHERE user_id = ? AND name = ? AND deleted_at IS NULL
      ) AS search_box_json
  `)
    .bind(user.id, user.id, user.id, 'deskModuleSearchBox')
    .first<PanelHomeConfigRow>())
  const groupsPromise = timed(() => getOrCreateGroups(env, user.id))
  const iconsPromise = timed(() => env.DB.prepare(`
    SELECT * FROM item_icon
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY item_icon_group_id, sort, created_at
  `)
    .bind(user.id)
    .all<ItemIconRow>())

  const [configResult, groupsResult, iconsResult] = await Promise.all([
    configPromise,
    groupsPromise,
    iconsPromise,
  ])
  const configRow = configResult.value
  const groups = groupsResult.value
  const iconRows = iconsResult.value
  if (timing) {
    timing.config_db_ms = configResult.durationMs
    timing.groups_db_ms = groupsResult.durationMs
    timing.icons_db_ms = iconsResult.durationMs
    timing.has_panel_config = Boolean(configRow?.panel_json || configRow?.search_engine_json)
    timing.has_search_box_config = Boolean(configRow?.search_box_json)
    timing.group_count = groups.length
    timing.item_icon_count = iconRows.results.length
  }

  const mapIconsStart = Date.now()
  const itemsByGroupId = new Map<number, ItemIcon[]>()
  for (const row of iconRows.results) {
    const item = mapPublicItemIcon(env, row)
    const list = itemsByGroupId.get(item.itemIconGroupId) ?? []
    list.push(item)
    itemsByGroupId.set(item.itemIconGroupId, list)
  }
  if (timing) {
    timing.map_icons_ms = elapsedMs(mapIconsStart)
    timing.item_icon_group_bucket_count = itemsByGroupId.size
  }

  let panel: Record<string, unknown> | null = null
  let searchEngine: Record<string, unknown> | null = null
  let searchBox: Record<string, unknown> | null = null

  const parseConfigStart = Date.now()
  try {
    panel = withPublicUploadUrls(env, JSON.parse(configRow?.panel_json || 'null'))
    searchEngine = withPublicUploadUrls(env, JSON.parse(configRow?.search_engine_json || 'null'))
    searchBox = withPublicUploadUrls(env, JSON.parse(configRow?.search_box_json || 'null'))
    if (timing)
      timing.config_parse_error = false
  }
  catch {
    panel = null
    searchEngine = null
    searchBox = null
    if (timing)
      timing.config_parse_error = true
  }
  if (timing)
    timing.parse_config_ms = elapsedMs(parseConfigStart)

  const buildResponseStart = Date.now()
  const homeData = {
    user: withPublicUploadUrls(env, sanitizeUser(user)),
    visitMode,
    panel,
    searchEngine,
    searchBox,
    itemIconGroups: groups.map(group => ({
      ...group,
      items: itemsByGroupId.get(group.id ?? 0) ?? [],
    })),
  }
  if (timing)
    timing.build_response_ms = elapsedMs(buildResponseStart)

  return homeData
}

export async function putPanelHomeCache(env: Env, userId: number, visitMode: VisitMode, homeData: unknown) {
  const homeCacheKey = cacheKey.panelHome(userId, visitMode)
  await Promise.all([
    putJson(env, homeCacheKey, homeData, panelHomeCacheTtl),
    putJson(env, cacheKey.panelHomeStale(userId, visitMode), homeData),
    putEdgeJson(homeCacheKey, homeData, panelHomeEdgeCacheTtl),
  ])
}

export async function readPanelHomeCache<T>(
  env: Env,
  userId: number,
  visitMode: VisitMode,
  timing?: Record<string, unknown>,
): Promise<PanelHomeReadResult<T>> {
  const homeCacheKey = cacheKey.panelHome(userId, visitMode)
  const cacheGetStart = Date.now()
  const cachedResult = await getJsonWithMeta<T>(env, homeCacheKey, {
    edgeCache: true,
    edgeTtlSeconds: panelHomeEdgeCacheTtl,
  })
  if (timing) {
    timing.cache_get_ms = elapsedMs(cacheGetStart)
    timing.cache_hit = cachedResult.value !== null
    timing.cache_local_hit = cachedResult.localHit
    timing.cache_edge_hit = cachedResult.edgeHit
  }

  if (cachedResult.value !== null) {
    const edgeWarm = !cachedResult.localHit && !cachedResult.edgeHit
      ? putEdgeJson(homeCacheKey, cachedResult.value, panelHomeEdgeCacheTtl)
      : undefined
    if (edgeWarm && timing)
      timing.cache_edge_warm_scheduled = true

    return {
      data: cachedResult.value,
      stale: false,
      edgeWarm,
    }
  }

  const staleGetStart = Date.now()
  const staleResult = await getJsonWithMeta<T>(env, cacheKey.panelHomeStale(userId, visitMode))
  if (timing) {
    timing.stale_cache_get_ms = elapsedMs(staleGetStart)
    timing.stale_cache_hit = staleResult.value !== null
    timing.stale_cache_local_hit = staleResult.localHit
    timing.stale_cache_returned = staleResult.value !== null
  }

  return {
    data: staleResult.value,
    stale: staleResult.value !== null,
  }
}

export async function rebuildPanelHomeCacheForUser(env: Env, user: User) {
  const safeUser = sanitizeUser(user)
  const loginHomeData = await buildPanelHomeData(env, safeUser, VisitMode.Login)
  const publicHomeData = {
    ...loginHomeData,
    visitMode: VisitMode.Public,
  }

  await Promise.all([
    putPanelHomeCache(env, safeUser.id, VisitMode.Login, loginHomeData),
    putPanelHomeCache(env, safeUser.id, VisitMode.Public, publicHomeData),
  ])
}

export async function invalidateAndRebuildPanelHomeCache(env: Env, user: User) {
  await invalidatePanelHomeFreshCache(env, user.id)
  await rebuildPanelHomeCacheForUser(env, user)
}

function logPanelHomeRefreshError(user: User, err: unknown) {
  console.error(JSON.stringify({
    type: 'panel_home_cache_refresh_error',
    user_id: user.id,
    error: err instanceof Error ? err.message : String(err),
  }))
}

export function schedulePanelHomeCacheRefresh(env: Env, user: User, executionCtx: ExecutionContext) {
  executionCtx.waitUntil(
    invalidateAndRebuildPanelHomeCache(env, user)
      .catch(err => logPanelHomeRefreshError(user, err)),
  )
}

export async function refreshPanelHomeCacheAfterMutation(env: Env, user: User, executionCtx: ExecutionContext) {
  await invalidatePanelHomeFreshCache(env, user.id)
  executionCtx.waitUntil(
    rebuildPanelHomeCacheForUser(env, user)
      .catch(err => logPanelHomeRefreshError(user, err)),
  )
}
