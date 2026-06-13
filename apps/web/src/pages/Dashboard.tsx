import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getToken, clearToken } from '../lib/api'

type SessionRow = {
  id: string
  title: string
  status: 'ACTIVE' | 'ENDED'
  createdAt: string
  _count?: { participants: number; messages: number }
}

export default function Dashboard() {
  const nav = useNavigate()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<Record<string, string>>({})

  async function load() {
    try {
      const d = await api<{ sessions: SessionRow[] }>('/sessions')
      setSessions(d.sessions ?? [])
    } catch (err) {
      const e = err as Error & { status?: number }
      if (e.status === 401 || e.status === 403) nav('/login')
      else setError(e.message)
    }
  }

  useEffect(() => {
    if (!getToken()) {
      nav('/login')
      return
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      const d = await api<{ session: { id: string } }>('/sessions', { method: 'POST', body: { title } })
      setTitle('')
      nav(`/session/${d.session.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
    }
  }

  async function makeInvite(id: string) {
    try {
      const d = await api<{ url: string }>(`/sessions/${id}/invites`, { method: 'POST' })
      setInvite((s) => ({ ...s, [id]: d.url }))
      try {
        await navigator.clipboard?.writeText(d.url)
      } catch {
        /* clipboard may be blocked on http; link is shown anyway */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
    }
  }

  async function end(id: string) {
    try {
      await api(`/sessions/${id}/end`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
    }
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Agent Dashboard</h1>
        <div className="row">
          <button className="btn ghost" onClick={() => nav('/admin')}>Admin</button>
          <button className="btn ghost" onClick={() => { clearToken(); nav('/login') }}>Log out</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={create} className="row">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New session title (e.g. Router setup help)" />
          <button className="btn" style={{ whiteSpace: 'nowrap' }}>+ New session</button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sessions.map((s) => (
          <div className="card" key={s.id}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div className="row">
                  <strong>{s.title}</strong>
                  <span className={`badge ${s.status === 'ACTIVE' ? 'active' : 'ended'}`}>{s.status}</span>
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  {new Date(s.createdAt).toLocaleString()} · {s._count?.participants ?? 0} joined · {s._count?.messages ?? 0} messages
                </div>
              </div>
              <div className="row">
                {s.status === 'ACTIVE' && <button className="btn" onClick={() => nav(`/session/${s.id}`)}>Open</button>}
                {s.status === 'ACTIVE' && <button className="btn secondary" onClick={() => makeInvite(s.id)}>Invite link</button>}
                {s.status === 'ACTIVE' && <button className="btn danger" onClick={() => end(s.id)}>End</button>}
                <button className="btn ghost" onClick={() => nav(`/history/${s.id}`)}>History</button>
              </div>
            </div>
            {invite[s.id] && (
              <div className="muted" style={{ marginTop: 10, fontSize: 13, wordBreak: 'break-all' }}>
                Invite link (copied to clipboard): <a href={invite[s.id]}>{invite[s.id]}</a>
              </div>
            )}
          </div>
        ))}
        {sessions.length === 0 && <p className="muted">No sessions yet — create one above.</p>}
      </div>
    </div>
  )
}
