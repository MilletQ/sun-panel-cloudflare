import type { Response } from '@/utils/request'

export function getAll<T>() {
  return removed<T>()
}

export function getCpuState<T>() {
  return removed<T>()
}

export function getDiskStateByPath<T>(path: string) {
  void path
  return removed<T>()
}

export function getMemonyState<T>() {
  return removed<T>()
}

export function getDiskMountpoints<T>() {
  return removed<T>()
}

function removed<T>(): Promise<Response<T>> {
  return Promise.resolve({
    code: -1,
    msg: 'System monitor has been removed',
    data: null as T,
  })
}
