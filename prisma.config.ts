import { defineConfig } from 'prisma/config'
import path from 'node:path'

export default defineConfig({
  schema: 'services/api/prisma/schema.prisma',
  migrations: {
    path: 'services/api/prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? `file:${path.resolve('services/api/prisma/dev.db')}`,
  },
})
