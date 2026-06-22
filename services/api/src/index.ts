import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { DeclarationStore, declarationInputSchema, processDeclaration } from './domain.js'

const app = express()
const port = Number(process.env.PORT ?? 8080)
const environment = process.env.NODE_ENV ?? 'development'
const startedAt = Date.now()
const store = new DeclarationStore()

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => {
  response.json({
    service: 'tradenet-api',
    status: 'ok',
    environment,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  })
})

app.get('/api/ready', (_request, response) => {
  response.json({ ready: true })
})

app.post('/api/declarations', (request, response) => {
  const idempotencyKey = request.header('Idempotency-Key')
  if (!idempotencyKey) {
    response.status(400).json({ error: 'Idempotency-Key header is required' })
    return
  }

  const parsed = declarationInputSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(422).json({ error: 'Invalid declaration payload', details: parsed.error.flatten() })
    return
  }

  const declaration = store.create(parsed.data, idempotencyKey)
  if (!declaration) {
    response.status(409).json({ error: 'Idempotency conflict' })
    return
  }

  queueMicrotask(() => {
    store.update(declaration.id, processDeclaration)
  })

  response.status(202).json(declaration)
})

app.get('/api/declarations', (_request, response) => {
  response.json(store.list())
})

app.get('/api/declarations/:id', (request, response) => {
  const declaration = store.get(request.params.id)
  if (!declaration) {
    response.status(404).json({ error: 'Declaration not found' })
    return
  }
  response.json(declaration)
})

app.get('/api/metrics/domain', (_request, response) => {
  response.json(store.metrics())
})

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

app.listen(port, () => {
  console.log(JSON.stringify({ service: 'tradenet-api', port, environment, event: 'started' }))
})
