import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  GridLayout,
  ParticipantTile,
  useTracks,
} from '@livekit/components-react'
import { useEffect, useState } from 'react'
import { Track } from 'livekit-client'
import { ChatPanel } from './ChatPanel'
import { api, downloadBlob, getToken } from '../lib/api'

function VideoGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )
  return (
    <GridLayout tracks={tracks} className="call-grid">
      <ParticipantTile />
    </GridLayout>
  )
}

type Recording = {
  id: string
  status: 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED'
  fileName: string
  error?: string | null
}

function RecordingControls({ sessionId }: { sessionId: string }) {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = recordings[0]

  async function load() {
    const d = await api<{ recordings: Recording[] }>(`/sessions/${sessionId}/recordings`)
    setRecordings(d.recordings ?? [])
  }

  useEffect(() => {
    void load().catch(() => {})
    const t = window.setInterval(() => void load().catch(() => {}), 4000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const d = await api<{ recording: Recording }>(`/sessions/${sessionId}/recordings/start`, { method: 'POST' })
      setRecordings((prev) => [d.recording, ...prev.filter((r) => r.id !== d.recording.id)])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'recording failed')
      await load().catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      const d = await api<{ recording: Recording }>(`/recordings/${current.id}/stop`, { method: 'POST' })
      setRecordings((prev) => [d.recording, ...prev.filter((r) => r.id !== d.recording.id)])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'stop failed')
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    if (!current) return
    try {
      const { blob, filename } = await downloadBlob(`/recordings/${current.id}/download`, getToken() ?? '')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('download failed')
    }
  }

  return (
    <div className="recording-controls">
      {current && <span className={`badge rec-${current.status.toLowerCase()}`}>{current.status}</span>}
      {!current || current.status === 'READY' || current.status === 'FAILED' ? (
        <button className="btn secondary" disabled={busy} onClick={start}>Start recording</button>
      ) : null}
      {current?.status === 'RECORDING' && <button className="btn secondary" disabled={busy} onClick={stop}>Stop recording</button>}
      {current?.status === 'READY' && <button className="btn secondary" onClick={download}>Download recording</button>}
      {error && <span className="recording-error">{error}</span>}
      {current?.status === 'FAILED' && current.error && <span className="recording-error">{current.error}</span>}
    </div>
  )
}

export function CallRoom(props: {
  url: string
  token: string
  participantToken: string
  sessionId: string
  title: string
  role: 'agent' | 'customer'
  onLeave: () => void
  onEnd?: () => void
}) {
  const { url, token, participantToken, sessionId, title, role, onLeave, onEnd } = props
  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      connect
      video
      audio
      data-lk-theme="default"
      style={{ height: '100vh' }}
      onDisconnected={onLeave}
    >
      <div className="call-header">
        <div className="row">
          <strong>{title}</strong>
          <span className={`badge ${role}`}>{role === 'agent' ? 'Agent' : 'Customer'}</span>
        </div>
        {role === 'agent' && (
          <div className="row">
            <RecordingControls sessionId={sessionId} />
            {onEnd && (
              <button className="btn danger" onClick={onEnd}>
                End session
              </button>
            )}
          </div>
        )}
      </div>
      <div className="call-layout">
        <div className="call-main">
          <VideoGrid />
          <ControlBar controls={{ chat: false, leave: true }} />
        </div>
        <ChatPanel sessionId={sessionId} participantToken={participantToken} />
      </div>
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}
