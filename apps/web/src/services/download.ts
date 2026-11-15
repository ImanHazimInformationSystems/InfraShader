import { ApiError } from './api'

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

/** Downloads an authorised API file without putting the bearer token in a URL. */
export async function downloadAuthorised(path: string, token: string, fallbackName: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError('This file is unavailable to your account.', response.status, 'file')
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return { name, sha256: response.headers.get('X-Content-SHA256') ?? '' }
}
