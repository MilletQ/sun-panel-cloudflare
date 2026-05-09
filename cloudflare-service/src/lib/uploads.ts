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
  const objectKey = pathname.replace(/^\//, '')
  return env.UPLOADS.get(objectKey)
}

export async function deleteUploadFromR2(env: Env, pathname: string) {
  const objectKey = pathname.replace(/^\//, '')
  await env.UPLOADS.delete(objectKey)
}
