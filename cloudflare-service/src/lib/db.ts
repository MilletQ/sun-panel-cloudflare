import type { Env, ItemIcon, ItemIconGroup, ItemIconGroupRow, ItemIconRow, SystemSetting, User, UserRow } from '../types'
import { cacheKey, deleteCache, getJson, putJson } from './cache'

const defaultSystemApplication: SystemSetting = {
  emailSuffix: '',
  openRegister: false,
  loginCaptcha: false,
  webSiteUrl: '',
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    userId: row.id,
    createTime: row.created_at,
    updateTime: row.updated_at,
    username: row.username,
    password: row.password,
    name: row.name,
    headImage: row.head_image,
    status: row.status,
    role: row.role,
    mail: row.mail,
    referralCode: row.referral_code,
    token: row.token,
  }
}

export function sanitizeUser(user: User): User {
  return {
    ...user,
    password: '',
    referralCode: '',
  }
}

export function mapItemIcon(row: ItemIconRow): ItemIcon {
  let icon: Record<string, unknown> | null = null
  try {
    icon = JSON.parse(row.icon_json || 'null')
  }
  catch {
    icon = null
  }

  return {
    id: row.id,
    createTime: row.created_at,
    updateTime: row.updated_at,
    icon,
    title: row.title,
    url: row.url,
    lanUrl: row.lan_url,
    description: row.description,
    openMethod: row.open_method,
    sort: row.sort,
    itemIconGroupId: row.item_icon_group_id,
    userId: row.user_id,
  }
}

export function mapItemIconGroup(row: ItemIconGroupRow): ItemIconGroup {
  return {
    id: row.id,
    createTime: row.created_at,
    updateTime: row.updated_at,
    icon: row.icon,
    title: row.title,
    description: row.description,
    sort: row.sort,
    userId: row.user_id,
  }
}

export function placeholders(values: unknown[]) {
  return values.map(() => '?').join(',')
}

export async function firstUserById(env: Env, id: number) {
  const row = await env.DB.prepare('SELECT * FROM user WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<UserRow>()

  return row ? mapUser(row) : null
}

export async function firstUserByToken(env: Env, token: string) {
  const row = await env.DB.prepare('SELECT * FROM user WHERE token = ? AND deleted_at IS NULL')
    .bind(token)
    .first<UserRow>()

  return row ? mapUser(row) : null
}

export async function firstUserByUsername(env: Env, username: string) {
  const row = await env.DB.prepare('SELECT * FROM user WHERE username = ? AND deleted_at IS NULL')
    .bind(username)
    .first<UserRow>()

  return row ? mapUser(row) : null
}

export async function getSystemSettingString(env: Env, name: string, fallback = '') {
  const cached = await getJson<string>(env, cacheKey.setting(name))
  if (cached !== null)
    return cached

  const row = await env.DB.prepare('SELECT config_value FROM system_setting WHERE config_name = ?')
    .bind(name)
    .first<{ config_value: string }>()

  const value = row?.config_value ?? fallback
  await putJson(env, cacheKey.setting(name), value, 60 * 60 * 5)
  return value
}

export async function getSystemSettingJson<T>(env: Env, name: string, fallback: T) {
  const value = await getSystemSettingString(env, name, JSON.stringify(fallback))
  try {
    return JSON.parse(value) as T
  }
  catch {
    return fallback
  }
}

export async function setSystemSetting(env: Env, name: string, value: unknown) {
  const persistedValue = typeof value === 'string' ? value : JSON.stringify(value)

  await env.DB.prepare(`
    INSERT INTO system_setting (config_name, config_value)
    VALUES (?, ?)
    ON CONFLICT(config_name) DO UPDATE SET config_value = excluded.config_value
  `)
    .bind(name, persistedValue)
    .run()

  await deleteCache(env, cacheKey.setting(name))
}

export async function getApplicationSetting(env: Env) {
  return getSystemSettingJson<SystemSetting>(env, 'system_application', defaultSystemApplication)
}
