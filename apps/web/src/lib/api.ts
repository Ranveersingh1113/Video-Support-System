// Thin API client. VITE_API_URL is the API origin (LAN IP in dev, empty = same origin in prod).
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const TOKEN_KEY = 'vsp_agent_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

type ApiOpts = { method?: string; body?: unknown; token?: string | null }

export async function api<T = any>(path: string, opts: ApiOpts = {}): Promise<T> {
  // token: undefined -> use stored agent token; null -> send none; string -> use it
  const token = opts.token !== undefined ? opts.token : getToken()
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : `request failed (${res.status})`
    const err = new Error(msg) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return data as T
}

export async function downloadBlob(path: string, token: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`download failed (${res.status})`)
  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') ?? ''
  const match = disposition.match(/filename="([^"]+)"/)
  return { blob, filename: match?.[1] ?? 'download' }
}
