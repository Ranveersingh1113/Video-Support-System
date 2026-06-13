import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { hashPassword, verifyPassword, signAgentToken, type AgentClaims } from '../lib/auth.js'
import { requireAgent } from '../lib/guards.js'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).max(80).optional(),
})
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input' })
    const { email, password, displayName } = parsed.data
    if (await prisma.user.findUnique({ where: { email } })) {
      return reply.code(409).send({ error: 'email already registered' })
    }
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), displayName: displayName ?? email.split('@')[0] },
    })
    const token = signAgentToken({ sub: user.id, email: user.email })
    return { token, user: { id: user.id, email: user.email, displayName: user.displayName } }
  })

  app.post('/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input' })
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'invalid credentials' })
    }
    const token = signAgentToken({ sub: user.id, email: user.email })
    return { token, user: { id: user.id, email: user.email, displayName: user.displayName } }
  })

  app.get('/auth/me', { preHandler: requireAgent }, async (req: FastifyRequest & { agent?: AgentClaims }) => {
    const user = await prisma.user.findUnique({ where: { id: req.agent!.sub } })
    return { user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null }
  })
}
