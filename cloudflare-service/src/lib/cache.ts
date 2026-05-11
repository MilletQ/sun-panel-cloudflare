import { VisitMode, type Env } from '../types'

export async function getJson<T>(env: Env, key: string): Promise<T | null> {
  const value = await env.CACHE.get(key, 'json')
  return value as T | null
}

export async function putJson(env: Env, key: string, value: unknown, ttlSeconds?: number) {
  await env.CACHE.put(key, JSON.stringify(value), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined)
}

export async function deleteCache(env: Env, key: string) {
  await env.CACHE.delete(key)
}

export const cacheKey = {
  clientToken: (token: string) => `auth:client:${token}`,
  userToken: (token: string) => `auth:user:${token}`,
  setting: (name: string) => `setting:${name}`,
  favicon: (url: string) => `favicon:${url}`,
  panelHome: (userId: number, visitMode: number) => `panel:home:${visitMode}:${userId}`,
}

export async function deletePanelHomeCache(env: Env, userId: number) {
  await Promise.all([
    deleteCache(env, cacheKey.panelHome(userId, VisitMode.Login)),
    deleteCache(env, cacheKey.panelHome(userId, VisitMode.Public)),
  ])
}
