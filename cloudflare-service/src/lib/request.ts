import type { Context } from 'hono'

export async function readJson<T = unknown>(c: Context): Promise<T> {
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.includes('application/json'))
    return {} as T

  try {
    return await c.req.json<T>()
  }
  catch {
    return {} as T
  }
}

export function normalizeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

export function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

export function normalizeIds(body: Record<string, unknown>, key = 'ids') {
  const value = body[key]
  if (!Array.isArray(value))
    return []

  return value
    .map(item => Number(item))
    .filter(item => Number.isInteger(item) && item > 0)
}
