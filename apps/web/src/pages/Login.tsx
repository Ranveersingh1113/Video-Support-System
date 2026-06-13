import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../lib/api'

export default function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('agent@demo.com')
  const [password, setPassword] = useState('demo1234')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { token } = await api<{ token: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
        token: null,
      })
      setToken(token)
      nav('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ maxWidth: 380 }}>
      <h1>Agent sign in</h1>
      <p className="muted" style={{ marginTop: -8 }}>Video Support Platform</p>
      <div className="card">
        <form onSubmit={submit}>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          <label style={{ marginTop: 12 }}>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          <button className="btn" style={{ marginTop: 16, width: '100%' }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          {error && <p className="error" style={{ marginBottom: 0 }}>⚠ {error}</p>}
        </form>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Demo: agent@demo.com / demo1234</p>
    </div>
  )
}
