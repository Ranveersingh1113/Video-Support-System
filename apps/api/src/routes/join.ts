import type { FastifyInstance } from 'fastify'
import type { Invite, Session } from '@prisma/client'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { mintAccessToken, LIVEKIT_URL } from '../lib/livekit.js'
import { signParticipantToken } from '../lib/auth.js'

type InviteLoadResult =
  | { invite: Invite & { session: Session } }
  | { error: 'invalid invite' | 'invite expired' | 'session ended'; code: 404 | 410 }

async function loadValidInvite(token: string): Promise<InviteLoadResult> {
  const invite = await prisma.invite.findUnique({ where: { token }, include: { session: true } })
  if (!invite) return { error: 'invalid invite' as const, code: 404 }
  if (invite.expiresAt < new Date()) return { error: 'invite expired' as const, code: 410 }
  if (invite.session.status === 'ENDED') return { error: 'session ended' as const, code: 410 }
  return { invite }
}

export async function joinRoutes(app: FastifyInstance) {
  // Preview: is this invite valid? (no media token yet — lets the join page show session info)
  app.get('/join/:token', async (req, reply) => {
    const { token } = req.params as { token: string }
    const res = await loadValidInvite(token)
    if ('error' in res) return reply.code(res.code).send({ error: res.error })
    return { valid: true, session: { title: res.invite.session.title } }
  })

  // Customer joins with a chosen display name -> customer-scoped (locked-down) tokens
  app.post('/join/:token', async (req, reply) => {
    const { token } = req.params as { token: string }
    const parsed = z.object({ name: z.string().min(1).max(80) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'name required' })
    const res = await loadValidInvite(token)
    if ('error' in res) return reply.code(res.code).send({ error: res.error })

    const session = res.invite.session
    const identity = 'cust_' + randomBytes(5).toString('hex')
    const name = parsed.data.name
    return {
      url: LIVEKIT_URL,
      token: await mintAccessToken({ identity, name, room: session.roomName, role: 'customer' }),
      participantToken: signParticipantToken({ sessionId: session.id, identity, name, role: 'customer' }),
      identity,
      name,
      role: 'customer',
      session: { id: session.id, title: session.title, roomName: session.roomName },
    }
  })
}
