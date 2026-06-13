import { useEffect, useState } from 'react'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
const params = new URLSearchParams(location.search)

type Conn = { token: string; url: string; room: string; identity: string }

export default function App() {
  const [room, setRoom] = useState(params.get('room') ?? 'test-room')
  const [name, setName] = useState(params.get('name') ?? '')
  const [conn, setConn] = useState<Conn | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('idle')

  // Publish camera/mic by default; ?publish=0 connects subscribe-only (device-free test path).
  const publish = params.get('publish') !== '0'

  async function join(r = room, n = name) {
    setError(null)
    setLoading(true)
    setStatus('fetching-token')
    try {
      const url = new URL('/dev/token', API || window.location.origin)
      url.searchParams.set('room', r)
      if (n) url.searchParams.set('name', n)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`token request failed (${res.status})`)
      const data = (await res.json()) as Conn
      setStatus('connecting')
      setConn(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed to join'
      setError(msg)
      setStatus('error:' + msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (params.get('autojoin') === '1') void join()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (conn) {
    return (
      <div style={{ height: '100vh' }}>
        <div
          data-testid="status"
          style={{
            position: 'fixed',
            zIndex: 10,
            top: 8,
            left: 8,
            background: '#111',
            color: '#0f0',
            padding: '4px 8px',
            fontFamily: 'monospace',
            fontSize: 12,
            borderRadius: 4,
          }}
        >
          {status}
        </div>
        <LiveKitRoom
          token={conn.token}
          serverUrl={conn.url}
          connect
          video={publish}
          audio={publish}
          data-lk-theme="default"
          style={{ height: '100vh' }}
          onConnected={() => {
            setStatus('connected')
            console.log('[lk] connected to room')
          }}
          onError={(e) => {
            setStatus('lk-error:' + e.message)
            console.error('[lk] error', e)
          }}
          onDisconnected={() => {
            setStatus('disconnected')
            console.log('[lk] disconnected')
            setConn(null)
          }}
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 420, margin: '10vh auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 4 }}>Video Support Platform</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Phase 0 — SFU media path test</p>

      <label style={{ display: 'block', marginTop: 16, fontSize: 14 }}>
        Room
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>

      <label style={{ display: 'block', marginTop: 12, fontSize: 14 }}>
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Agent Jane"
          style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>

      <button
        onClick={() => join()}
        disabled={loading || !room}
        style={{ marginTop: 16, padding: '10px 20px', cursor: 'pointer', width: '100%' }}
      >
        {loading ? 'Joining…' : 'Join call'}
      </button>

      {error && <p style={{ color: 'crimson', marginTop: 12 }}>⚠ {error}</p>}
    </div>
  )
}
