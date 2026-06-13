import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { CallRoom } from '../components/CallRoom'

type Conn = {
  url: string
  token: string
  participantToken: string
  session: { id: string; title: string }
}

export default function CustomerJoin() {
  const { token } = useParams<{ token: string }>()
  const [preview, setPreview] = useState<{ title: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [conn, setConn] = useState<Conn | null>(null)
  const [loading, setLoading] = useState(false)
  const [left, setLeft] = useState(false)

  useEffect(() => {
    api<{ session: { title: string } }>(`/join/${token}`, { token: null })
      .then((d) => setPreview(d.session))
      .catch((e) => setError(e instanceof Error ? e.message : 'invalid invite'))
  }, [token])

  async function join(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const d = await api<Conn>(`/join/${token}`, { method: 'POST', body: { name }, token: null })
      setConn(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to join')
    } finally {
      setLoading(false)
    }
  }

  if (conn) {
    return (
      <CallRoom
        url={conn.url}
        token={conn.token}
        participantToken={conn.participantToken}
        sessionId={conn.session.id}
        title={conn.session.title}
        role="customer"
        onLeave={() => {
          setConn(null)
          setLeft(true)
        }}
      />
    )
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <h1>Join support call</h1>
      <div className="card">
        {left && <p className="muted">You left the call. You can rejoin below.</p>}
        {error && <p className="error">⚠ {error}</p>}
        {!error && preview && (
          <form onSubmit={join}>
            <p className="muted" style={{ marginTop: 0 }}>
              Session: <strong style={{ color: 'var(--text)' }}>{preview.title}</strong>
            </p>
            <label>Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Smith" required />
            <button className="btn" style={{ marginTop: 14, width: '100%' }} disabled={loading || !name.trim()}>
              {loading ? 'Joining…' : 'Join call'}
            </button>
          </form>
        )}
        {!error && !preview && <p className="muted">Checking invite…</p>}
      </div>
    </div>
  )
}
