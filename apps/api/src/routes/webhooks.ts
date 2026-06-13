import type { FastifyInstance, FastifyRequest } from 'fastify'
import { webhookReceiver } from '../lib/livekit.js'
import { prisma } from '../lib/prisma.js'
import { recordingStatusFromEgress } from '../lib/recordings.js'

function parseRole(metadata?: string): 'AGENT' | 'CUSTOMER' {
  try {
    return JSON.parse(metadata || '{}').role === 'agent' ? 'AGENT' : 'CUSTOMER'
  } catch {
    return 'CUSTOMER'
  }
}

// LiveKit posts signed events (application/webhook+json). The raw body is captured
// by a content-type parser in server.ts and verified here. This is the authoritative
// source for session history (who joined/left, durations) — clients can't spoof it.
export async function webhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/livekit', async (req: FastifyRequest & { rawBody?: string }, reply) => {
    try {
      const event = await webhookReceiver.receive(req.rawBody ?? '', req.headers.authorization ?? '')
      const egress = event.egressInfo
      const roomName = event.room?.name ?? egress?.roomName
      const p = event.participant
      if (!roomName) return reply.send({ ok: true })

      const session = await prisma.session.findUnique({ where: { roomName } })
      if (!session) return reply.send({ ok: true })

      if (event.event === 'participant_joined' && p) {
        await prisma.participant.create({
          data: {
            sessionId: session.id,
            identity: p.identity,
            displayName: p.name || p.identity,
            role: parseRole(p.metadata),
          },
        })
      } else if (event.event === 'participant_left' && p) {
        const open = await prisma.participant.findFirst({
          where: { sessionId: session.id, identity: p.identity, leftAt: null },
          orderBy: { joinedAt: 'desc' },
        })
        if (open) await prisma.participant.update({ where: { id: open.id }, data: { leftAt: new Date() } })
      } else if (event.event === 'room_finished') {
        if (session.status !== 'ENDED') {
          await prisma.session.update({ where: { id: session.id }, data: { status: 'ENDED', endedAt: new Date() } })
        }
        await prisma.participant.updateMany({
          where: { sessionId: session.id, leftAt: null },
          data: { leftAt: new Date() },
        })
      } else if ((event.event === 'egress_started' || event.event === 'egress_updated' || event.event === 'egress_ended') && egress?.egressId) {
        const status = recordingStatusFromEgress(egress.status)
        await prisma.recording.updateMany({
          where: { egressId: egress.egressId },
          data: {
            status,
            stoppedAt: status === 'PROCESSING' || status === 'READY' || status === 'FAILED' ? new Date() : undefined,
            readyAt: status === 'READY' ? new Date() : undefined,
            error: status === 'FAILED'
              ? egress.error || egress.details || 'LiveKit egress failed or aborted'
              : null,
          },
        })
      }
      return reply.send({ ok: true })
    } catch (err) {
      // Return 200 so LiveKit doesn't retry-storm; log for diagnosis.
      app.log.warn({ err }, 'livekit webhook handling failed')
      return reply.code(200).send({ ok: false })
    }
  })
}
