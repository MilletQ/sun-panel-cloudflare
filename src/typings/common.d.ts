declare namespace Common {
  type ListResponse<T> = {
    list: T
    count: number
  }

  type ListRequest = {
    limit: number
    page: number
    keyword?: string
  }

  type InfoBase = {
    createTime?: string
    updateTime?: string
    id?: number
  }

  // 请求-带有弹窗验证数据结构
  type VerificationRequest = {
    codeId?: string
    vCode?: string
  }

  // 响应-带有弹窗验证数据结构
  type VerificationResponse = {
    codeId?: string
    result?: boolean
    message?: string
  }

  type SortItemRequest = {
    id: number
    sort: number
  }
}
