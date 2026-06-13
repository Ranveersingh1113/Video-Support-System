import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { prisma } from '../lib/prisma.js'
import { requireAgent } from '../lib/guards.js'
import { egressClient, recordingOutput } from '../lib/livekit.js'
import { reconcileRecording } from '../lib/recordings.js'
import type { AgentClaims } from '../lib/auth.js'

type AgentReq = FastifyRequest & { agent?: AgentClaims }

const RECORDING_DIR = process.env.RECORDING_DIR ?? resolve(process.cwd(), '../../recordings')
const EGRESS_RECORDING_DIR = process.env.EGRESS_RECORDING_DIR ?? RECORDING_DIR
const EGRESS_REQUEST_TIMEOUT_MS = Number(process.env.EGRESS_REQUEST_TIMEOUT_MS ?? 8000)

function recordingFileName(sessionId: string): string {
  return `${sessionId}_${Date.now()}.mp4`
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`egress request timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function publicRecording(r: {
  id: string
  status: string
  fileName: string
  startedAt: Date
  stoppedAt: Date | null
  readyAt: Date | null
  error: string | null
}) {
  return {
    id: r.id,
    status: r.status,
    fileName: r.fileName,
    startedAt: r.startedAt,
    stoppedAt: r.stoppedAt,
    readyAt: r.readyAt,
    error: r.error,
    downloadUrl: r.status === 'READY' ? `/api/recordings/${r.id}/download` : null,
  }
}

export async function recordingRoutes(app: FastifyInstance) {
  app.get('/sessions/:id/recordings', { preHandler: requireAgent }, async (req: AgentReq, reply) => {
    const { id } = req.params as { id: string }
    const session = await prisma.session.findFirst({ where: { id, agentId: req.agent!.sub } })
    if (!session) return reply.code(404).send({ error: 'not found' })
    const recordings = await prisma.recording.findMany({
      where: { sessionId: id },
      orderBy: { startedAt: 'desc' },
    })
    const reconciled = await Promise.all(recordings.map(reconcileRecording))
    return { recordings: reconciled.map(publicRecording) }
  })

  app.post('/sessions/:id/recordings/start', { preHandler: requireAgent }, async (req: AgentReq, reply) => {
    const { id } = req.params as { id: string }
    const session = await prisma.session.findFirst({ where: { id, agentId: req.agent!.sub } })
    if (!session) return reply.code(404).send({ error: 'not found' })
    if (session.status === 'ENDED') return reply.code(409).send({ error: 'session ended' })

    const active = await prisma.recording.findFirst({
      where: { sessionId: id, status: { in: ['RECORDING', 'PROCESSING'] } },
      orderBy: { startedAt: 'desc' },
    })
    if (active) return reply.code(409).send({ error: 'recording already active', recording: publicRecording(active) })

    await mkdir(RECORDING_DIR, { recursive: true })
    const fileName = recordingFileName(id)
    const localPath = join(RECORDING_DIR, fileName)
    const egressPath = join(EGRESS_RECORDING_DIR, fileName).replace(/\\/g, '/')
    const recording = await prisma.recording.create({
      data: { sessionId: id, fileName, filePath: localPath, status: 'RECORDING' },
    })

    const startPromise = egressClient.startRoomCompositeEgress(
      session.roomName,
      recordingOutput(egressPath),
      { layout: 'grid' },
    )
    try {
      const info = await withTimeout(startPromise, EGRESS_REQUEST_TIMEOUT_MS)
      const updated = await prisma.recording.update({
        where: { id: recording.id },
        data: { egressId: info.egressId, status: 'RECORDING' },
      })
      return { recording: publicRecording(updated) }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'egress start failed'
      const failed = await prisma.recording.update({
        where: { id: recording.id },
        data: { status: 'FAILED', stoppedAt: new Date(), error: message },
      })
      void startPromise
        .then((info) =>
          prisma.recording.update({
            where: { id: recording.id },
            data: { egressId: info.egressId, status: 'RECORDING', stoppedAt: null, error: null },
          }),
        )
        .catch(() => {})
      return reply.code(503).send({
        error: 'egress unavailable',
        detail: message,
        recording: publicRecording(failed),
      })
    }
  })

  app.post('/recordings/:id/stop', { preHandler: requireAgent }, async (req: AgentReq, reply) => {
    const { id } = req.params as { id: string }
    const recording = await prisma.recording.findUnique({ where: { id }, include: { session: true } })
    if (!recording || recording.session.agentId !== req.agent!.sub) return reply.code(404).send({ error: 'not found' })
    if (recording.status !== 'RECORDING') return { recording: publicRecording(recording) }

    const processing = await prisma.recording.update({
      where: { id },
      data: { status: 'PROCESSING', stoppedAt: new Date() },
    })
    if (recording.egressId) {
      try {
        await egressClient.stopEgress(recording.egressId)
      } catch (err) {
        app.log.warn({ err }, 'stopEgress failed')
      }
    }
    return { recording: publicRecording(processing) }
  })

  app.get('/recordings/:id/download', { preHandler: requireAgent }, async (req: AgentReq, reply) => {
    const { id } = req.params as { id: string }
    const recording = await prisma.recording.findUnique({ where: { id }, include: { session: true } })
    if (!recording || recording.session.agentId !== req.agent!.sub) return reply.code(404).send({ error: 'not found' })
    if (recording.status !== 'READY' || !recording.filePath || !existsSync(recording.filePath)) {
      return reply.code(409).send({ error: 'recording not ready' })
    }
    return reply
      .header('content-type', 'video/mp4')
      .header('content-disposition', `attachment; filename="${recording.fileName}"`)
      .send(createReadStream(recording.filePath))
  })
}
