import '../src/lib/env.js'
import { prisma } from '../src/lib/prisma.js'
import { hashPassword } from '../src/lib/auth.js'

async function main() {
  const email = 'agent@demo.com'
  const password = 'demo1234'
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`agent already exists: ${email}`)
    return
  }
  await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), displayName: 'Demo Agent' },
  })
  console.log(`seeded agent: ${email} / ${password}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
