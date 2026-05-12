import { VisitMode, type Env } from '../types'

type LocalCacheEntry = {
  value: unknown
  expiresAt: number
}

type JsonCacheReadOptions = {
  edgeCache?: boolean
  edgeTtlSeconds?: number
}

const localJsonCache = new Map<string, LocalCacheEntry>()
const localJsonCacheMaxEntries = 200
const edgeCacheBaseUrl = 'https://sun-panel-cloudflare.internal/cache/'

function localCacheTtlSeconds(key: string, ttlSeconds?: number) {
  let maxTtl = 10
  if (key.startsWith('panel:home:') || key.startsWith('panel:home-stale:'))
    maxTtl = 60 * 5
  else if (key.startsWith('auth:client:') || key.startsWith('auth:user:'))
    maxTtl = 15
  else if (key.startsWith('setting:'))
    maxTtl = 30

  return Math.max(1, Math.min(ttlSeconds ?? maxTtl, maxTtl))
}

function cloneJson<T>(value: T): T {
  return structuredClone(value)
}

function pruneLocalJsonCache(now = Date.now()) {
  for (const [key, entry] of localJsonCache) {
    if (entry.expiresAt <= now)
      localJsonCache.delete(key)
  }

  while (localJsonCache.size > localJsonCacheMaxEntries) {
    const oldestKey = localJsonCache.keys().next().value
    if (!oldestKey)
      break

    localJsonCache.delete(oldestKey)
  }
}

function getLocalJson<T>(key: string) {
  const entry = localJsonCache.get(key)
  if (!entry)
    return { hit: false, value: null as T | null }

  if (entry.expiresAt <= Date.now()) {
    localJsonCache.delete(key)
    return { hit: false, value: null as T | null }
  }

  return { hit: true, value: cloneJson(entry.value) as T }
}

function putLocalJson(key: string, value: unknown, ttlSeconds?: number) {
  pruneLocalJsonCache()
  localJsonCache.set(key, {
    value: cloneJson(value),
    expiresAt: Date.now() + localCacheTtlSeconds(key, ttlSeconds) * 1000,
  })
}

function edgeCacheRequest(key: string) {
  return new Request(`${edgeCacheBaseUrl}${encodeURIComponent(key)}`, { method: 'GET' })
}

function defaultEdgeCache() {
  if (typeof caches === 'undefined')
    return null

  return (caches as CacheStorage & { default?: Cache }).default ?? null
}

export async function getEdgeJson<T>(key: string, ttlSeconds?: number) {
  const cache = defaultEdgeCache()
  if (!cache)
    return null

  const response = await cache.match(edgeCacheRequest(key))
  if (!response)
    return null

  const value = await response.json<T>()
  putLocalJson(key, value, ttlSeconds)
  return value
}

export async function putEdgeJson(key: string, value: unknown, ttlSeconds: number) {
  const cache = defaultEdgeCache()
  if (!cache)
    return

  putLocalJson(key, value, ttlSeconds)
  await cache.put(edgeCacheRequest(key), new Response(JSON.stringify(value), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${ttlSeconds}`,
    },
  }))
}

export async function deleteEdgeCache(key: string) {
  localJsonCache.delete(key)
  const cache = defaultEdgeCache()
  if (!cache)
    return

  await cache.delete(edgeCacheRequest(key))
}

export async function getJsonWithMeta<T>(
  env: Env,
  key: string,
  options: JsonCacheReadOptions = {},
): Promise<{ value: T | null; localHit: boolean; edgeHit: boolean }> {
  const local = getLocalJson<T>(key)
  if (local.hit)
    return { value: local.value, localHit: true, edgeHit: false }

  if (options.edgeCache) {
    const edgeValue = await getEdgeJson<T>(key, options.edgeTtlSeconds)
    if (edgeValue !== null)
      return { value: edgeValue, localHit: false, edgeHit: true }
  }

  const value = await env.CACHE.get(key, 'json') as T | null
  if (value !== null)
    putLocalJson(key, value)

  return { value, localHit: false, edgeHit: false }
}

export async function getJson<T>(env: Env, key: string): Promise<T | null> {
  const result = await getJsonWithMeta<T>(env, key)
  return result.value
}

export async function putJson(env: Env, key: string, value: unknown, ttlSeconds?: number) {
  await env.CACHE.put(key, JSON.stringify(value), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined)
  putLocalJson(key, value, ttlSeconds)
}

export async function deleteCache(env: Env, key: string) {
  localJsonCache.delete(key)
  await env.CACHE.delete(key)
}

export const cacheKey = {
  clientToken: (token: string) => `auth:client:${token}`,
  userClientTokens: (userId: number) => `auth:user-clients:${userId}`,
  userToken: (token: string) => `auth:user:${token}`,
  setting: (name: string) => `setting:${name}`,
  favicon: (url: string) => `favicon:${url}`,
  panelHome: (userId: number, visitMode: number) => `panel:home:${visitMode}:${userId}`,
  panelHomeStale: (userId: number, visitMode: number) => `panel:home-stale:${visitMode}:${userId}`,
}

export async function invalidatePanelHomeFreshCache(env: Env, userId: number) {
  const loginKey = cacheKey.panelHome(userId, VisitMode.Login)
  const publicKey = cacheKey.panelHome(userId, VisitMode.Public)

  await Promise.all([
    deleteCache(env, loginKey),
    deleteCache(env, publicKey),
    deleteEdgeCache(loginKey),
    deleteEdgeCache(publicKey),
  ])
}

export async function deletePanelHomeCache(env: Env, userId: number) {
  const loginKey = cacheKey.panelHome(userId, VisitMode.Login)
  const publicKey = cacheKey.panelHome(userId, VisitMode.Public)
  const loginStaleKey = cacheKey.panelHomeStale(userId, VisitMode.Login)
  const publicStaleKey = cacheKey.panelHomeStale(userId, VisitMode.Public)

  await Promise.all([
    deleteCache(env, loginKey),
    deleteCache(env, publicKey),
    deleteCache(env, loginStaleKey),
    deleteCache(env, publicStaleKey),
    deleteEdgeCache(loginKey),
    deleteEdgeCache(publicKey),
  ])
}
