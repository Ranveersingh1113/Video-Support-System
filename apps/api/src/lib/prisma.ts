import { PrismaClient } from '@prisma/client'

// Single shared client. tsx watch can re-import; reuse a global to avoid pool exhaustion.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
