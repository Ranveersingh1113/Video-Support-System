import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_jwt_secret_change_me_please_32chars'

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10)
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash)
}

// Agent session token (API auth). Customers never get one of these.
export type AgentClaims = { kind: 'agent'; sub: string; email: string }
// Per-call participant token (authorizes chat posting + identifies sender). Agent or customer.
export type ParticipantClaims = {
  kind: 'participant'
  sessionId: string
  identity: string
  name: string
  role: 'agent' | 'customer'
}

export function signAgentToken(c: Omit<AgentClaims, 'kind'>): string {
  return jwt.sign({ kind: 'agent', ...c }, JWT_SECRET, { expiresIn: '7d' })
}
export function signParticipantToken(c: Omit<ParticipantClaims, 'kind'>): string {
  return jwt.sign({ kind: 'participant', ...c }, JWT_SECRET, { expiresIn: '12h' })
}
export function verifyToken<T>(token: string): T {
  return jwt.verify(token, JWT_SECRET) as T
}
