// Side-effect module: load the repo-root .env BEFORE anything reads process.env
// (must be the first import in server.ts / seed.ts so PrismaClient sees DATABASE_URL).
// In production (Fly) there is no .env file — real env vars are used instead.
import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const envPath = resolve(process.cwd(), '../../.env')
if (existsSync(envPath)) {
  dotenv.config({ path: envPath })
}
