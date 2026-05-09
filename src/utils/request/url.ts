const apiBaseUrl = (import.meta.env.VITE_GLOB_API_URL || '/api').replace(/\/+$/, '')

export function getApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${apiBaseUrl}${normalizedPath}`
}
