export type Env = {
  DB: D1Database
  CACHE: KVNamespace
  UPLOADS: R2Bucket
  CORS_ORIGIN?: string
  R2_PUBLIC_BASE_URL?: string
  VERSION_NAME?: string
  VERSION_CODE?: string
}

export type Variables = {
  user: User
  visitMode: VisitMode
}

export enum VisitMode {
  Login = 0,
  Public = 1,
}

export type ApiResponse<T = unknown> = {
  code: number
  msg: string
  data?: T
}

export type UserRow = {
  id: number
  created_at: string
  updated_at: string
  username: string
  password: string
  name: string
  head_image: string
  status: number
  role: number
  mail: string
  referral_code: string
  token: string
}

export type User = {
  id: number
  userId?: number
  createTime?: string
  updateTime?: string
  username: string
  password?: string
  name: string
  headImage: string
  status: number
  role: number
  mail: string
  referralCode?: string
  token: string
}

export type ItemIconRow = {
  id: number
  created_at: string
  updated_at: string
  icon_json: string
  title: string
  url: string
  lan_url: string
  description: string
  open_method: number
  sort: number
  item_icon_group_id: number
  user_id: number
}

export type ItemIcon = {
  id?: number
  createTime?: string
  updateTime?: string
  icon?: Record<string, unknown> | null
  title: string
  url: string
  lanUrl: string
  description: string
  openMethod: number
  sort: number
  itemIconGroupId: number
  userId: number
}

export type ItemIconGroupRow = {
  id: number
  created_at: string
  updated_at: string
  icon: string
  title: string
  description: string
  sort: number
  user_id: number
}

export type ItemIconGroup = {
  id?: number
  createTime?: string
  updateTime?: string
  icon: string
  title: string
  description: string
  sort: number
  userId: number
}

export type SystemSetting = {
  emailSuffix: string
  openRegister: boolean
  loginCaptcha: boolean
  webSiteUrl: string
}

export type SortItem = {
  id: number
  sort: number
}
