import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import path from 'node:path'
import { ZodError } from 'zod'
import {
  clearSession,
  createSession,
  loginSchema,
  requireAuth,
  serializeUser,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth.js'
import { databaseUrl, prisma } from './db.js'
import { declarationInputSchema } from './domain.js'
import {
  createDeclaration,
  getDashboardSummary,
  getDeclaration,
  listAuditEvents,
  listDeclarations,
  listPartnerStatus,
} from './repository.js'
import { seedDatabase } from './seed.js'

const app = express()
const port = Number(process.env.PORT ?? 8080)
const environment = process.env.NODE_ENV ?? 'development'
const startedAt = Date.now()

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)
app.use(cookieParser())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => {
  response.json({
    service: 'tradenet-api',
    status: 'ok',
    environment,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  })
})

app.get(
  '/api/ready',
  asyncHandler(async (_request, response) => {
    await prisma.$queryRaw`SELECT 1`
    response.json({ ready: true, database: 'ok' })
  }),
)

app.get(
  '/api/metrics',
  asyncHandler(async (_request, response) => {
    const metrics = await getPublicMetrics()
    response.type('text/plain; version=0.0.4').send(toPrometheus(metrics))
  }),
)

app.get(
  '/api/metrics/domain',
  asyncHandler(async (_request, response) => {
    response.json(await getPublicMetrics())
  }),
)

app.post(
  '/api/auth/login',
  asyncHandler(async (request, response) => {
    const credentials = loginSchema.parse(request.body)
    const user = await prisma.user.findUnique({
      where: { email: credentials.email.toLowerCase() },
      include: { organisation: true },
    })

    if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) {
      response.status(401).json({ error: 'Invalid email or password' })
      return
    }

    await createSession(response, user.id)
    response.json({ user: serializeUser(user) })
  }),
)

app.post(
  '/api/auth/logout',
  asyncHandler(async (request, response) => {
    await clearSession(request, response)
    response.status(204).send()
  }),
)

app.use('/api', requireAuth)

app.get('/api/auth/session', (request, response) => {
  response.json({ user: (request as AuthenticatedRequest).user })
})

app.get(
  '/api/dashboard',
  asyncHandler(async (request, response) => {
    response.json(await getDashboardSummary((request as AuthenticatedRequest).user))
  }),
)

app.post(
  '/api/declarations',
  asyncHandler(async (request, response) => {
    const idempotencyKey = request.header('Idempotency-Key')
    if (!idempotencyKey) {
      response.status(400).json({ error: 'Idempotency-Key header is required' })
      return
    }

    const parsed = declarationInputSchema.parse(request.body)
    const declaration = await createDeclaration(parsed, idempotencyKey, (request as AuthenticatedRequest).user)
    response.status(202).json(declaration)
  }),
)

app.get(
  '/api/declarations',
  asyncHandler(async (request, response) => {
    response.json(await listDeclarations((request as AuthenticatedRequest).user))
  }),
)

app.get(
  '/api/declarations/:id',
  asyncHandler(async (request, response) => {
    const declaration = await getDeclaration(String(request.params.id), (request as AuthenticatedRequest).user)
    if (!declaration) {
      response.status(404).json({ error: 'Declaration not found' })
      return
    }
    response.json(declaration)
  }),
)

app.get(
  '/api/partners',
  asyncHandler(async (request, response) => {
    response.json(await listPartnerStatus((request as AuthenticatedRequest).user))
  }),
)

app.get(
  '/api/audit-events',
  asyncHandler(async (request, response) => {
    response.json(await listAuditEvents((request as AuthenticatedRequest).user))
  }),
)

const staticDir = process.env.STATIC_DIR
if (staticDir) {
  const indexHtml = path.join(staticDir, 'index.html')
  app.use(express.static(staticDir))
  app.use((request, response, next) => {
    if (request.path.startsWith('/api/')) {
      next()
      return
    }
    response.sendFile(indexHtml)
  })
}

app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  void next
  if (error instanceof ZodError) {
    response.status(422).json({ error: 'Invalid request payload', details: error.flatten() })
    return
  }

  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002'
  ) {
    response.status(409).json({ error: 'Record already exists' })
    return
  }

  console.error(error)
  response.status(500).json({ error: 'Internal server error' })
})

if (process.env.SEED_ON_START === 'true') {
  await seedDatabase()
}

app.listen(port, () => {
  console.log(
    JSON.stringify({
      service: 'tradenet-api',
      port,
      environment,
      databaseUrl,
      event: 'started',
    }),
  )
})

function asyncHandler(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next)
  }
}

async function getPublicMetrics() {
  const declarations = await prisma.declaration.findMany({
    include: {
      riskAssessment: true,
    },
  })
  const totals = declarations.reduce<Record<string, number>>((summary, declaration) => {
    summary[declaration.status] = (summary[declaration.status] ?? 0) + 1
    return summary
  }, {})
  const averageRisk =
    declarations.length === 0
      ? 0
      : declarations.reduce((total, declaration) => total + (declaration.riskAssessment?.score ?? 0), 0) /
        declarations.length
  const processing = declarations.filter((declaration) =>
    ['RECEIVED', 'VALIDATED', 'PROCESSING', 'AWAITING_PARTNER', 'INSPECTION_REQUIRED'].includes(declaration.status),
  )
  const oldestProcessingSeconds = processing.length
    ? Math.round((Date.now() - Math.min(...processing.map((declaration) => declaration.createdAt.getTime()))) / 1000)
    : 0

  return { totals, averageRisk, oldestProcessingSeconds }
}

function toPrometheus(metrics: Awaited<ReturnType<typeof getPublicMetrics>>) {
  const lines = [
    '# HELP tradenet_declarations_total Declarations by status.',
    '# TYPE tradenet_declarations_total gauge',
    ...Object.entries(metrics.totals).map(([status, count]) => `tradenet_declarations_total{status="${status}"} ${count}`),
    '# HELP tradenet_average_risk Average declaration risk score.',
    '# TYPE tradenet_average_risk gauge',
    `tradenet_average_risk ${metrics.averageRisk}`,
    '# HELP tradenet_oldest_processing_seconds Oldest open processing age in seconds.',
    '# TYPE tradenet_oldest_processing_seconds gauge',
    `tradenet_oldest_processing_seconds ${metrics.oldestProcessingSeconds}`,
  ]
  return `${lines.join('\n')}\n`
}
