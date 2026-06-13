import './lib/env.js' // MUST be first import: loads .env before anything reads process.env

import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { authRoutes } from './routes/auth.js'
import { sessionRoutes } from './routes/sessions.js'
import { joinRoutes } from './routes/join.js'
import { webhookRoutes } from './routes/webhooks.js'
import { adminRoutes, metricsRoutes } from './routes/admin.js'
import { recordingRoutes } from './routes/recordings.js'

const PORT = Number(process.env.PORT ?? 4000)
const app = Fastify({ logger: true, bodyLimit: Number(process.env.BODY_LIMIT_BYTES ?? 8 * 1024 * 1024) })

await app.register(cors, { origin: true })

// LiveKit webhooks arrive as application/webhook+json — keep the raw body for signature checks.
app.addContentTypeParser(
  'application/webhook+json',
  { parseAs: 'string' },
  (req: FastifyRequest & { rawBody?: string }, body, done) => {
    req.rawBody = typeof body === 'string' ? body : String(body)
    try {
      done(null, JSON.parse(req.rawBody))
    } catch {
      done(null, {})
    }
  },
)

// Tolerate empty bodies on body-less POSTs (token/end/invites) even when the client
// sets content-type: application/json — otherwise Fastify rejects them with 400.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  const s = typeof body === 'string' ? body : String(body)
  if (s.trim() === '') return done(null, {})
  try {
    done(null, JSON.parse(s))
  } catch (err) {
    done(err as Error)
  }
})

app.get('/health', async () => ({ ok: true, ts: Date.now() }))
await app.register(metricsRoutes)

// All JSON endpoints live under /api so browser routes (e.g. /join/:token) can serve the SPA.
await app.register(authRoutes, { prefix: '/api' })
await app.register(sessionRoutes, { prefix: '/api' })
await app.register(joinRoutes, { prefix: '/api' })
await app.register(webhookRoutes, { prefix: '/api' })
await app.register(adminRoutes, { prefix: '/api' })
await app.register(recordingRoutes, { prefix: '/api' })

// Production: serve the built web app from the same origin, with SPA fallback.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url))
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false })
  app.setNotFoundHandler((req, reply) => {
    const url = req.raw.url ?? ''
    if (url.startsWith('/api') || url.startsWith('/health')) {
      return reply.code(404).send({ error: 'not found' })
    }
    return reply.sendFile('index.html')
  })
  app.log.info(`serving web from ${webDist}`)
}

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`API listening on :${PORT}`))
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
