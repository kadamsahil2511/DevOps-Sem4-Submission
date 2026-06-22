import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const databaseUrl = process.env.DATABASE_URL ?? `file:${path.join(apiRoot, 'prisma/dev.db')}`

if (databaseUrl.startsWith('file:')) {
  const dbPath = databaseUrl.replace(/^file:/, '')
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true })
  }
}

const adapter = new PrismaBetterSqlite3({ url: databaseUrl })

export const prisma = new PrismaClient({ adapter })
