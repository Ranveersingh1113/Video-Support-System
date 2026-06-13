import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { prisma } from '../lib/prisma.js'
import { requireAgent, requireParticipant, getBearer } from '../lib/guards.js'
import { mintAccessToken, roomService, LIVEKIT_PUBLIC_URL } from '../lib/livekit.js'
import { stopActiveRecordings } from '../lib/recordings.js'
import {
  signParticipantToken,
  verifyToken,
  type AgentClaims,
  type ParticipantClaims,
} from '../lib/auth.js'

const INVITE_TTL_MIN = Number(process.env.INVITE_TTL_MINUTES ?? 120)
const PUBLIC_WEB_URL = process.env.PUBLIC_WEB_URL ?? ''
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024)
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? resolve(process.cwd(), '../../uploads')

type AgentReq = FastifyRequest & { agent?: AgentClaims }
type PartReq = FastifyRequest & { participant?: ParticipantClaims }

function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file'
}

async function canReadSession(token: string, sessionId: string): Promise<boolean> {
  try {
    const c = verifyToken<AgentClaims | ParticipantClaims>(token)
    if (c.kind === 'agent') {
      return !!(await prisma.session.findFirst({ where: { id: sessionId, agentId: c.sub } }))
    }
    if (c.kind === 'participant') return c.sessionId === sessionId
  } catch {
    return false
  }
  return false
}

export async function sessionRoutes(app: FastifyInstance) {
  // --- Agent: create a session ---
  app.post('/sessions', { preHandler: requireAgent }, async (req: AgentReq, reply) => {
    const parsed = z.object({ title: z.string().min(1).max(200) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'title required' })
    const roomName = 'room_' + randomBytes(6).toString('hex')
    const session = await prisma.session.create({
      data: { title: parsed.data.title, roomName, agentId: req.agent!.sub },
    })
    try {
      await roomService.createRoom({
        name: roomName,
        emptyTimeout: 60 * 30,
        metadata: JSON.stringify({ sessionId: session.id }),
      })
    } catch (err) {
      app.log.warn({ err }, 'createRoom failed (will auto-create on join)')
    }
    return { session }
  })

  // --- Agent: list own sessions ---
  app.get('/sessions', { preHandler: requireAgent }, async (req: AgentReq) => {
    const sessions = await prisma.session.findMany({
      where: { agentId: req.agent!.sub },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { participants: true, messages: true } } },
    })
    return { sessions }
  })

  // --- Agent: session detail + participants + chat history ---
  app.get('/sessions/:id', { preHandler: requireAgent }, async (req: AgentReq, reply) => {
    const { id } = req.params as { id: string }
    const session = await prisma.session.findFirst({
      where: { id, agentId: req.agent!.sub },
      include: {
        participants: { orderBy: { joinedAt: 'asc' } },
        messages: { orderBy: { createdAt: 'asc' } },
        recordings: { orderBy: { startedAt: 'desc' } },
      },
    })
    if (!session) return reply.code(404).send({ error: 'not found' })
    return { session }
  })

  // --- Agent: mint own join token for a session ---
  app.post('/sessions/:id/token', { preHandler: requireAgent }, async (req: AgentReq, reply) => {
    const { id } = req.params as { id: string }
    const session = await prisma.session.findFirst({ where: { id, agentId: req.agent!.sub } })
    if (!session) return reply.code(404).send({ error: 'not found' })
    if (session.status === 'ENDED') return reply.code(409).send({ error: 'session ended' })
    const user = await prisma.user.findUnique({ where: { id: req.agent!.sub } })
    const identity = 'agent_' + req.agent!.sub.slice(0, 8)
    const name = user?.displayName ?? 'Agent'
    return {
      url: LIVEKIT_PUBLIC_URL,
      token: await mintAccessToken({ identity, name, room: session.roomName, role: 'agent' }),
      participantToken: signParticipantToken({ sessionId: session.id, identity, name, role: 'agent' }),
      identity,
      name,
      role: 'agent',
      session: { id: session.id, title: session.title, roomName: session.roomName },
    }
  })

  // --- Agent: end the session (closes the room for everyone) ---
  app.post('/sessions/:id/end', { preHandler: requireAgent }, async (req: AgentReq, reply) => {
    const { id } = req.params as { id: string }
    const session = await prisma.session.findFirst({ where: { id, agentId: req.agent!.sub } })
    if (!session) return reply.code(404).send({ error: 'not found' })
    if (session.status === 'ENDED') return { session }
    await stopActiveRecordings(id)
    try {
      await roomService.deleteRoom(session.roomName)
    } catch (err) {
      app.log.warn({ err }, 'deleteRoom failed')
    }
    const updated = await prisma.session.update({
      where: { id },
      data: { status: 'ENDED', endedAt: new Date() },
    })
    await prisma.participant.updateMany({
      where: { sessionId: id, leftAt: null },
      data: { leftAt: new Date() },
    })
    return { session: updated }
  })

  // --- Agent: create a customer invite ---
  app.post('/sessions/:id/invites', { preHandler: requireAgent }, async (req: AgentReq, reply) => {
    const { id } = req.params as { id: string }
    const session = await prisma.session.findFirst({ where: { id, agentId: req.agent!.sub } })
    if (!session) return reply.code(404).send({ error: 'not found' })
    if (session.status === 'ENDED') return reply.code(409).send({ error: 'session ended' })
    const token = randomBytes(16).toString('hex')
    const invite = await prisma.invite.create({
      data: { token, sessionId: id, expiresAt: new Date(Date.now() + INVITE_TTL_MIN * 60_000) },
    })
    return {
      token: invite.token,
      url: PUBLIC_WEB_URL ? `${PUBLIC_WEB_URL}/join/${invite.token}` : `/join/${invite.token}`,
      expiresAt: invite.expiresAt,
    }
  })

  // --- Chat history (agent owner OR a participant of the session) ---
  app.get('/sessions/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string }
    const token = getBearer(req)
    if (!token) return reply.code(401).send({ error: 'missing token' })
    const allowed = await canReadSession(token, id)
    if (!allowed) return reply.code(403).send({ error: 'forbidden' })
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    })
    return { messages }
  })

  // --- Persist a chat message (any participant of the session) ---
  app.post('/sessions/:id/messages', { preHandler: requireParticipant }, async (req: PartReq, reply) => {
    const { id } = req.params as { id: string }
    if (req.participant!.sessionId !== id) return reply.code(403).send({ error: 'wrong session' })
    const parsed = z.object({ body: z.string().min(1).max(4000) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'empty message' })
    const message = await prisma.chatMessage.create({
      data: {
        sessionId: id,
        senderIdentity: req.participant!.identity,
        senderName: req.participant!.name,
        body: parsed.data.body,
      },
    })
    return { message }
  })

  // --- Upload and share a file as a chat message ---
  app.post('/sessions/:id/files', { preHandler: requireParticipant }, async (req: PartReq, reply) => {
    const { id } = req.params as { id: string }
    if (req.participant!.sessionId !== id) return reply.code(403).send({ error: 'wrong session' })
    const parsed = z
      .object({
        fileName: z.string().min(1).max(180),
        mimeType: z.string().min(1).max(120).default('application/octet-stream'),
        dataBase64: z.string().min(1),
      })
      .safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid file' })

    const session = await prisma.session.findUnique({ where: { id } })
    if (!session || session.status === 'ENDED') return reply.code(409).send({ error: 'session ended' })

    const buffer = Buffer.from(parsed.data.dataBase64, 'base64')
    if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
      return reply.code(413).send({ error: `file must be 1-${MAX_UPLOAD_BYTES} bytes` })
    }

    await mkdir(UPLOAD_DIR, { recursive: true })
    const cleanName = safeFileName(parsed.data.fileName)
    const storageKey = `${id}_${Date.now()}_${randomBytes(8).toString('hex')}_${cleanName}`
    await writeFile(join(UPLOAD_DIR, storageKey), buffer)

    const message = await prisma.chatMessage.create({
      data: {
        sessionId: id,
        senderIdentity: req.participant!.identity,
        senderName: req.participant!.name,
        body: `Shared file: ${cleanName}`,
        fileName: cleanName,
        fileMime: parsed.data.mimeType,
        fileSize: buffer.length,
        fileStorageKey: storageKey,
      },
    })
    return { message }
  })

  // --- Download a shared file (agent owner OR session participant) ---
  app.get('/sessions/:id/files/:messageId', async (req, reply) => {
    const { id, messageId } = req.params as { id: string; messageId: string }
    const token = getBearer(req)
    if (!token) return reply.code(401).send({ error: 'missing token' })
    if (!(await canReadSession(token, id))) return reply.code(403).send({ error: 'forbidden' })

    const message = await prisma.chatMessage.findFirst({ where: { id: messageId, sessionId: id } })
    if (!message?.fileStorageKey || !message.fileName) return reply.code(404).send({ error: 'file not found' })
    const path = join(UPLOAD_DIR, message.fileStorageKey)
    return reply
      .header('content-type', message.fileMime ?? 'application/octet-stream')
      .header('content-disposition', `attachment; filename="${message.fileName.replace(/"/g, '')}"`)
      .send(createReadStream(path))
  })
}
