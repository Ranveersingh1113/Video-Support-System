import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { requireAgent } from '../lib/guards.js'
import { roomService } from '../lib/livekit.js'
import { stopActiveRecordings } from '../lib/recordings.js'

export async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/sessions', { preHandler: requireAgent }, async () => {
    const sessions = await prisma.session.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        agent: { select: { id: true, email: true, displayName: true } },
        participants: { where: { leftAt: null }, orderBy: { joinedAt: 'asc' } },
        _count: { select: { participants: true, messages: true } },
      },
    })
    return { sessions }
  })

  app.get('/admin/sessions/live', { preHandler: requireAgent }, async () => {
    const sessions = await prisma.session.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { id: true, email: true, displayName: true } },
        participants: { where: { leftAt: null }, orderBy: { joinedAt: 'asc' } },
        _count: { select: { participants: true, messages: true } },
      },
    })
    return { sessions }
  })

  app.post('/admin/sessions/:id/end', { preHandler: requireAgent }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string }
    const session = await prisma.session.findUnique({ where: { id } })
    if (!session) return reply.code(404).send({ error: 'not found' })
    if (session.status === 'ENDED') return { session }
    await stopActiveRecordings(id)
    try {
      await roomService.deleteRoom(session.roomName)
    } catch (err) {
      app.log.warn({ err }, 'admin deleteRoom failed')
    }
    const now = new Date()
    const updated = await prisma.session.update({
      where: { id },
      data: { status: 'ENDED', endedAt: now },
    })
    await prisma.participant.updateMany({
      where: { sessionId: id, leftAt: null },
      data: { leftAt: now },
    })
    return { session: updated }
  })
}

export async function metricsRoutes(app: FastifyInstance) {
  app.get('/metrics', async (_req, reply) => {
    const [
      activeSessions,
      endedSessions,
      activeParticipants,
      totalParticipants,
      totalMessages,
      totalInvites,
      recording,
      processing,
      ready,
      failed,
    ] = await Promise.all([
        prisma.session.count({ where: { status: 'ACTIVE' } }),
        prisma.session.count({ where: { status: 'ENDED' } }),
        prisma.participant.count({ where: { leftAt: null } }),
        prisma.participant.count(),
        prisma.chatMessage.count(),
        prisma.invite.count(),
        prisma.recording.count({ where: { status: 'RECORDING' } }),
        prisma.recording.count({ where: { status: 'PROCESSING' } }),
        prisma.recording.count({ where: { status: 'READY' } }),
        prisma.recording.count({ where: { status: 'FAILED' } }),
      ])

    const lines = [
      '# HELP vsp_sessions_by_status Sessions by current status.',
      '# TYPE vsp_sessions_by_status gauge',
      `vsp_sessions_by_status{status="active"} ${activeSessions}`,
      `vsp_sessions_by_status{status="ended"} ${endedSessions}`,
      '# HELP vsp_participants_active Currently connected participants.',
      '# TYPE vsp_participants_active gauge',
      `vsp_participants_active ${activeParticipants}`,
      '# HELP vsp_participants_total Participant join records.',
      '# TYPE vsp_participants_total counter',
      `vsp_participants_total ${totalParticipants}`,
      '# HELP vsp_chat_messages_total Persisted chat messages.',
      '# TYPE vsp_chat_messages_total counter',
      `vsp_chat_messages_total ${totalMessages}`,
      '# HELP vsp_invites_total Invite records created.',
      '# TYPE vsp_invites_total counter',
      `vsp_invites_total ${totalInvites}`,
      '# HELP vsp_recordings_by_status Recordings by current status.',
      '# TYPE vsp_recordings_by_status gauge',
      `vsp_recordings_by_status{status="recording"} ${recording}`,
      `vsp_recordings_by_status{status="processing"} ${processing}`,
      `vsp_recordings_by_status{status="ready"} ${ready}`,
      `vsp_recordings_by_status{status="failed"} ${failed}`,
      '',
    ]
    return reply.type('text/plain; version=0.0.4').send(lines.join('\n'))
  })
}
