import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken, type AgentClaims, type ParticipantClaims } from './auth.js'

export function getBearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) return null
  return h.slice(7)
}

// preHandler: requires a valid agent token; attaches req.agent.
export async function requireAgent(req: FastifyRequest, reply: FastifyReply) {
  const token = getBearer(req)
  if (!token) return reply.code(401).send({ error: 'missing token' })
  try {
    const claims = verifyToken<AgentClaims>(token)
    if (claims.kind !== 'agent') return reply.code(403).send({ error: 'agent only' })
    ;(req as FastifyRequest & { agent?: AgentClaims }).agent = claims
  } catch {
    return reply.code(401).send({ error: 'invalid token' })
  }
}

// preHandler: requires a valid participant token; attaches req.participant.
export async function requireParticipant(req: FastifyRequest, reply: FastifyReply) {
  const token = getBearer(req)
  if (!token) return reply.code(401).send({ error: 'missing token' })
  try {
    const claims = verifyToken<ParticipantClaims>(token)
    if (claims.kind !== 'participant') return reply.code(403).send({ error: 'participant only' })
    ;(req as FastifyRequest & { participant?: ParticipantClaims }).participant = claims
  } catch {
    return reply.code(401).send({ error: 'invalid token' })
  }
}
