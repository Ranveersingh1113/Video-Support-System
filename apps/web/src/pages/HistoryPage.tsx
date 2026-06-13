import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, downloadBlob, getToken } from '../lib/api'

type Participant = { id: string; displayName: string; role: 'AGENT' | 'CUSTOMER'; joinedAt: string; leftAt: string | null }
type Message = {
  id: string
  senderName: string
  body: string
  createdAt: string
  fileName?: string | null
  fileSize?: number | null
}
type Recording = {
  id: string
  status: 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED'
  fileName: string
  startedAt: string
  stoppedAt: string | null
  readyAt: string | null
  error?: string | null
}
type SessionDetail = {
  id: string
  title: string
  status: 'ACTIVE' | 'ENDED'
  createdAt: string
  endedAt: string | null
  participants: Participant[]
  messages: Message[]
  recordings: Recording[]
}

function duration(joinedAt: string, leftAt: string | null): string {
  const ms = (leftAt ? new Date(leftAt).getTime() : Date.now()) - new Date(joinedAt).getTime()
  const m = Math.floor(ms / 60000)
  const s = Math.floor(ms / 1000) % 60
  return `${m}m ${s}s`
}

export default function HistoryPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [s, setS] = useState<SessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!getToken()) {
      nav('/login')
      return
    }
    api<{ session: SessionDetail }>(`/sessions/${id}`)
      .then((d) => setS(d.session))
      .catch((e) => setError(e instanceof Error ? e.message : 'failed'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function download(message: Message) {
    const token = getToken()
    if (!token || !id) return
    try {
      const { blob, filename } = await downloadBlob(`/sessions/${id}/files/${message.id}`, token)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Download failed')
    }
  }

  async function downloadRecording(recording: Recording) {
    const token = getToken()
    if (!token) return
    try {
      const { blob, filename } = await downloadBlob(`/recordings/${recording.id}/download`, token)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Recording download failed')
    }
  }

  if (error) return <div className="container"><p className="error">⚠ {error}</p><button className="btn ghost" onClick={() => nav('/dashboard')}>← Back</button></div>
  if (!s) return <div className="container"><p className="muted">Loading…</p></div>

  return (
    <div className="container">
      <button className="btn ghost" onClick={() => nav('/dashboard')}>← Back to dashboard</button>
      <h1 style={{ marginTop: 16 }}>
        {s.title} <span className={`badge ${s.status === 'ACTIVE' ? 'active' : 'ended'}`}>{s.status}</span>
      </h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Started {new Date(s.createdAt).toLocaleString()}
        {s.endedAt ? ` · ended ${new Date(s.endedAt).toLocaleString()}` : ''}
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Participants</h3>
        {s.participants.length === 0 && <p className="muted">No participants recorded yet.</p>}
        {s.participants.map((p) => (
          <div className="row" key={p.id} style={{ justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
            <span>
              {p.displayName} <span className={`badge ${p.role === 'AGENT' ? 'agent' : 'customer'}`}>{p.role}</span>
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              {new Date(p.joinedAt).toLocaleTimeString()} · {duration(p.joinedAt, p.leftAt)}{p.leftAt ? '' : ' (in call)'}
            </span>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Recordings</h3>
        {s.recordings.length === 0 && <p className="muted">No recordings.</p>}
        {s.recordings.map((r) => (
          <div className="row" key={r.id} style={{ justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
            <span>
              {r.fileName} <span className={`badge rec-${r.status.toLowerCase()}`}>{r.status}</span>
              {r.error && <span className="recording-error"> {r.error}</span>}
            </span>
            {r.status === 'READY' && (
              <button className="btn secondary" onClick={() => downloadRecording(r)}>
                Download
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Chat transcript</h3>
        {s.messages.length === 0 && <p className="muted">No messages.</p>}
        {s.messages.map((m) => (
          <div key={m.id} style={{ padding: '4px 0' }}>
            <span className="muted" style={{ fontSize: 12 }}>{new Date(m.createdAt).toLocaleTimeString()} </span>
            <strong>{m.senderName}:</strong> {m.body}
            {m.fileName && (
              <button className="file-link" type="button" onClick={() => download(m)}>
                Download {m.fileName}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
