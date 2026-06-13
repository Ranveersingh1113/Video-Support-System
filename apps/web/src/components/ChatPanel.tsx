import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useChat } from '@livekit/components-react'
import { api, downloadBlob } from '../lib/api'

type HistMsg = {
  id: string
  senderIdentity: string
  senderName: string
  body: string
  createdAt: string
  fileName?: string | null
  fileMime?: string | null
  fileSize?: number | null
}

type FileNotice = {
  type: 'vsp:file'
  id: string
  fileName: string
  fileSize?: number | null
}

const FILE_NOTICE_PREFIX = '__VSP_FILE__:'

function decodeIdentity(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))
    return typeof json.identity === 'string' ? json.identity : null
  } catch {
    return null
  }
}

function parseFileNotice(message: string): FileNotice | null {
  if (!message.startsWith(FILE_NOTICE_PREFIX)) return null
  try {
    const parsed = JSON.parse(message.slice(FILE_NOTICE_PREFIX.length))
    if (parsed?.type === 'vsp:file' && typeof parsed.id === 'string' && typeof parsed.fileName === 'string') {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      resolve(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl)
    }
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'))
    reader.readAsDataURL(file)
  })
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ChatPanel({ sessionId, participantToken }: { sessionId: string; participantToken: string }) {
  const { chatMessages, send } = useChat()
  const ownIdentity = decodeIdentity(participantToken)
  const [history, setHistory] = useState<HistMsg[]>([])
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api<{ messages: HistMsg[] }>(`/sessions/${sessionId}/messages`, { token: participantToken })
      .then((d) => setHistory(d.messages ?? []))
      .catch(() => {})
  }, [sessionId, participantToken])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, history])

  async function onSend(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || !send) return
    setText('')
    setError(null)
    try {
      await send(body)
      await api(`/sessions/${sessionId}/messages`, { method: 'POST', body: { body }, token: participantToken })
    } catch {
      setError('Message failed')
    }
  }

  async function onFile(file: File | null) {
    if (!file || !send) return
    setUploading(true)
    setError(null)
    try {
      const dataBase64 = await toBase64(file)
      const d = await api<{ message: HistMsg }>(`/sessions/${sessionId}/files`, {
        method: 'POST',
        body: { fileName: file.name, mimeType: file.type || 'application/octet-stream', dataBase64 },
        token: participantToken,
      })
      setHistory((prev) => [...prev, d.message])
      await send(
        FILE_NOTICE_PREFIX +
          JSON.stringify({
            type: 'vsp:file',
            id: d.message.id,
            fileName: d.message.fileName ?? file.name,
            fileSize: d.message.fileSize,
          } satisfies FileNotice),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function download(message: HistMsg) {
    try {
      const { blob, filename } = await downloadBlob(`/sessions/${sessionId}/files/${message.id}`, participantToken)
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

  return (
    <div className="chat-panel">
      <div className="chat-title">Chat</div>
      <div className="chat-messages">
        {history.map((m) => (
          <div className="chat-msg" key={m.id}>
            <div className="who">{m.senderName}</div>
            {m.body}
            {m.fileName && m.senderIdentity !== ownIdentity && (
              <button className="file-link" type="button" onClick={() => download(m)}>
                Download {m.fileName} {formatFileSize(m.fileSize)}
              </button>
            )}
          </div>
        ))}
        {chatMessages.map((m, i) => {
          const notice = parseFileNotice(m.message)
          const fromIdentity = m.from?.identity
          const fromName = m.from?.name ?? fromIdentity ?? 'Unknown'
          if (notice) {
            return (
              <div className="chat-msg" key={`live-${i}`}>
                <div className="who">{fromName}</div>
                Shared file: {notice.fileName}
                {fromIdentity !== ownIdentity && (
                  <button className="file-link" type="button" onClick={() => download({ ...notice, senderIdentity: fromIdentity ?? '', senderName: fromName, body: '', createdAt: new Date().toISOString() })}>
                    Download {notice.fileName} {formatFileSize(notice.fileSize)}
                  </button>
                )}
              </div>
            )
          }
          return (
            <div className="chat-msg" key={`live-${i}`}>
              <div className="who">{fromName}</div>
              {m.message}
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={onSend}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message..." />
        <label className="btn secondary file-picker">
          File
          <input type="file" disabled={uploading} onChange={(e) => void onFile(e.currentTarget.files?.[0] ?? null)} />
        </label>
        <button className="btn" type="submit">Send</button>
      </form>
      {error && <div className="chat-error">{error}</div>}
    </div>
  )
}
