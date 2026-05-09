import type { Env } from '../types'
import { randomCode } from './crypto'

const allowedImageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'])

export type StoredUpload = {
  fileName: string
  ext: string
  contentType: string
  publicPath: string
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

  await env.UPLOADS.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: {
      contentType,
    },
    customMetadata: {
      fileName: file.name,
    },
  })

  return {
    fileName: file.name,
    ext,
    contentType,
    publicPath,
    objectKey,
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

export function toPublicUploadUrl(requestUrl: string, pathname: string) {
  if (!pathname.startsWith('/uploads/'))
    return pathname

  return new URL(pathname, new URL(requestUrl).origin).toString()
}

export function withPublicUploadUrls<T>(requestUrl: string, value: T): T {
  return mapNestedStrings(value, pathname => toPublicUploadUrl(requestUrl, pathname))
}

export function toStoredUploadPath(pathname: string) {
  if (pathname.startsWith('/uploads/'))
    return pathname

  try {
    const url = new URL(pathname)
    return url.pathname.startsWith('/uploads/') ? url.pathname : pathname
  }
  catch {
    return pathname
  }
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
