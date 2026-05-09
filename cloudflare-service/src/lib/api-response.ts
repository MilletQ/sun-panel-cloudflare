import type { Context } from 'hono'
import type { ApiResponse } from '../types'

export const errorCodeMap: Record<number, string> = {
  1000: 'Not logged in yet',
  1001: 'Login has expired',
  1003: 'Incorrect username or password',
  1004: 'Account disabled or not activated',
  1005: 'No current permission for operation',
  1006: 'Account does not exist',
  1007: 'Old password error',
  1200: 'Database error',
  1201: 'Please keep at least one',
  1202: 'No data record found',
  1300: 'Upload failed',
  1301: 'Unsupported file format',
  1400: 'Parameter format error',
}

export function apiReturn<T>(c: Context, code: number, msg: string, data?: T) {
  const payload: ApiResponse<T> = { code, msg }
  if (data !== undefined)
    payload.data = data

  return c.json(payload)
}

export function success(c: Context) {
  return apiReturn(c, 0, 'OK')
}

export function successData<T>(c: Context, data: T) {
  return apiReturn(c, 0, 'OK', data)
}

export function successListData<T>(c: Context, list: T[], count = 0) {
  return successData(c, { list, count })
}

export function error(c: Context, msg: string) {
  return apiReturn(c, -1, msg)
}

export function errorByCode(c: Context, code: number, msg = errorCodeMap[code] ?? 'Server error') {
  return apiReturn(c, code, msg)
}

export function errorParam(c: Context, msg: string) {
  return errorByCode(c, 1400, `Parameter format error[${msg}]`)
}

export function errorDatabase(c: Context, msg: string) {
  return errorByCode(c, 1200, `Database error[${msg}]`)
}
