import type { Env } from '../types'
import { randomCode } from './crypto'

const allowedImageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'])

export type StoredUpload = {
  fileName: string
  ext: string
  contentType: string
  publicPath: string
  publicUrl: string
  objectKey: string
}

function getExt(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

function buildDatePath(now: Date) {
  return `${now.getUTCFullYear()}/${now.getUTCMonth() + 1}/${now.getUTCDate()}`
}

export function isAllowedImage(file: File) {
  const ext = getExt(file.name)
  return allowedImageExts.has(ext) && file.type.startsWith('image/')
}

export async function storeImageInR2(env: Env, file: File): Promise<StoredUpload> {
  const ext = getExt(file.name)
  const contentType = file.type || 'application/octet-stream'
  const fileBaseName = `${Date.now()}-${randomCode(16)}${ext}`
  const publicPath = `/uploads/${buildDatePath(new Date())}/${fileBaseName}`
  const objectKey = publicPath.replace(/^\//, '')

  if (!env.R2_PUBLIC_BASE_URL?.trim())
    throw new Error('R2_PUBLIC_BASE_URL is required to return a public R2 upload URL')

  const uploaded = await env.UPLOADS.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      fileName: file.name,
    },
  })
  const publicUrl = getPublicUploadUrl(env, uploaded.key)

  return {
    fileName: file.name,
    ext,
    contentType,
    publicPath: `/${uploaded.key}`,
    publicUrl,
    objectKey: uploaded.key,
  }
}

export async function getUploadFromR2(env: Env, pathname: string) {
  const objectKey = getUploadObjectKey(pathname)
  return env.UPLOADS.get(objectKey)
}

export async function deleteUploadFromR2(env: Env, pathname: string) {
  const objectKey = getUploadObjectKey(pathname)
  await env.UPLOADS.delete(objectKey)
}

export function toPublicUploadUrl(env: Env, pathname: string) {
  if (!pathname.startsWith('/uploads/'))
    return pathname

  return getPublicUploadUrl(env, pathname.replace(/^\//, '')) ?? pathname
}

export function withPublicUploadUrls<T>(env: Env, value: T): T {
  return mapNestedStrings(value, pathname => toPublicUploadUrl(env, pathname))
}

export function toStoredUploadPath(pathname: string) {
  // Keep full R2 public URLs in D1 so later reads do not need the Worker upload proxy.
  return pathname
}

export function withStoredUploadPaths<T>(value: T): T {
  return mapNestedStrings(value, toStoredUploadPath)
}

function mapNestedStrings<T>(value: T, mapper: (value: string) => string): T {
  if (typeof value === 'string')
    return mapper(value) as T

  if (Array.isArray(value))
    return value.map(item => mapNestedStrings(item, mapper)) as T

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, mapNestedStrings(item, mapper)]),
    ) as T
  }

  return value
}

function getUploadObjectKey(pathname: string) {
  try {
    pathname = new URL(pathname).pathname
  }
  catch {
    // Already a pathname.
  }

  return pathname.replace(/^\//, '')
}

function getPublicUploadUrl(env: Env, objectKey: string) {
  const baseUrl = env.R2_PUBLIC_BASE_URL?.trim()
  if (!baseUrl)
    throw new Error('R2_PUBLIC_BASE_URL is required to return a public R2 upload URL')

  return new URL(objectKey, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}
