import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, getToken } from '../lib/api'
import { CallRoom } from '../components/CallRoom'

type Conn = {
  url: string
  token: string
  participantToken: string
  session: { id: string; title: string }
}

export default function SessionRoom() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [conn, setConn] = useState<Conn | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!getToken()) {
      nav('/login')
      return
    }
    api<Conn>(`/sessions/${id}/token`, { method: 'POST' })
      .then(setConn)
      .catch((e) => setError(e instanceof Error ? e.message : 'failed'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function endSession() {
    try {
      await api(`/sessions/${id}/end`, { method: 'POST' })
    } catch {
      /* ignore */
    }
    nav('/dashboard')
  }

  if (error) {
    return (
      <div className="container" style={{ maxWidth: 420 }}>
        <div className="card">
          <p className="error">⚠ {error}</p>
          <button className="btn" onClick={() => nav('/dashboard')}>Back to dashboard</button>
        </div>
      </div>
    )
  }
  if (!conn) return <div className="container"><p className="muted">Connecting…</p></div>

  return (
    <CallRoom
      url={conn.url}
      token={conn.token}
      participantToken={conn.participantToken}
      sessionId={conn.session.id}
      title={conn.session.title}
      role="agent"
      onLeave={() => nav('/dashboard')}
      onEnd={endSession}
    />
  )
}
