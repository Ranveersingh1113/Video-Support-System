import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getToken } from '../lib/api'

type Participant = {
  id: string
  displayName: string
  role: 'AGENT' | 'CUSTOMER'
  joinedAt: string
}
type AdminSession = {
  id: string
  title: string
  status: 'ACTIVE' | 'ENDED'
  createdAt: string
  agent: { email: string; displayName: string }
  participants: Participant[]
  _count: { participants: number; messages: number }
}

function age(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime()
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

export default function AdminPage() {
  const nav = useNavigate()
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const d = await api<{ sessions: AdminSession[] }>('/admin/sessions/live')
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
    const t = window.setInterval(load, 5000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function end(id: string) {
    await api(`/admin/sessions/${id}/end`, { method: 'POST' })
    await load()
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Admin Dashboard</h1>
        <button className="btn ghost" onClick={() => nav('/dashboard')}>Back</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginBottom: 16 }}>
        <strong>{sessions.length}</strong> live sessions
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sessions.map((s) => (
          <div className="card" key={s.id}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div className="row">
                  <strong>{s.title}</strong>
                  <span className="badge active">{s.status}</span>
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  Agent {s.agent.displayName} · running {age(s.createdAt)} · {s._count.messages} messages
                </div>
              </div>
              <button className="btn danger" onClick={() => end(s.id)}>End session</button>
            </div>

            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>Connected now</strong>
              {s.participants.length === 0 && <p className="muted" style={{ margin: '6px 0 0' }}>No active participants.</p>}
              {s.participants.map((p) => (
                <div className="row" key={p.id} style={{ justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <span>{p.displayName} <span className={`badge ${p.role === 'AGENT' ? 'agent' : 'customer'}`}>{p.role}</span></span>
                  <span className="muted" style={{ fontSize: 13 }}>joined {new Date(p.joinedAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {sessions.length === 0 && <p className="muted">No live sessions.</p>}
      </div>
    </div>
  )
}
