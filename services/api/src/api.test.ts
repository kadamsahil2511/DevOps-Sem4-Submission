import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(apiRoot, '../..')
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs')

test('authenticates, creates a declaration, and records audit events', async () => {
  const databaseUrl = `file:${path.join(mkdtempSync(path.join(tmpdir(), 'tradenet-api-')), 'test.db')}`
  const port = 18_080 + Math.floor(Math.random() * 1000)
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PORT: String(port),
    NODE_ENV: 'test',
    SEED_ON_START: 'true',
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: repoRoot,
    env,
    stdio: 'ignore',
  })

  const server = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: apiRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const serverOutput: string[] = []
  server.stdout?.on('data', (chunk) => serverOutput.push(String(chunk)))
  server.stderr?.on('data', (chunk) => serverOutput.push(String(chunk)))

  try {
    await waitForHealth(port, server, serverOutput)

    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'importer@tradenet.demo', password: 'TradeNet@2026' }),
    })
    assert.equal(login.status, 200)
    const setCookie = login.headers.getSetCookie?.() ?? [login.headers.get('set-cookie')].filter(Boolean)
    const cookie = setCookie.join('; ')
    assert.match(cookie, /tn_session=/)

    const dashboard = await authedFetch<{ declarationCount: number }>(port, '/api/dashboard', cookie)
    assert.equal(dashboard.declarationCount, 4)

    const created = await authedFetch<{ id: string; referenceNo: string }>(port, '/api/declarations', cookie, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'api-test-create' },
      body: JSON.stringify({
        referenceNo: 'TN-2026-API-9001',
        originCountry: 'SG',
        destinationCountry: 'IN',
        commodityCategory: 'electronics',
        hsCode: '8517.62',
        declaredValue: 99000,
        previousViolation: false,
        documents: ['invoice', 'packing-list', 'origin-certificate'],
      }),
    })
    assert.equal(created.referenceNo, 'TN-2026-API-9001')

    const declarations = await authedFetch<Array<{ referenceNo: string }>>(port, '/api/declarations', cookie)
    assert.ok(declarations.some((declaration) => declaration.referenceNo === 'TN-2026-API-9001'))

    const auditEvents = await authedFetch<Array<{ declaration: { referenceNo: string } | null }>>(
      port,
      '/api/audit-events',
      cookie,
    )
    assert.ok(auditEvents.some((event) => event.declaration?.referenceNo === 'TN-2026-API-9001'))
  } finally {
    await stopServer(server)
  }
})

async function authedFetch<T>(port: number, pathName: string, cookie: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...init?.headers,
    },
  })
  if (!response.ok) {
    assert.fail(`${pathName} returned ${response.status}: ${await response.text()}`)
  }
  return response.json() as Promise<T>
}

async function waitForHealth(port: number, server: ChildProcess, serverOutput: string[]) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`API exited before health check passed with code ${server.exitCode}\n${serverOutput.join('')}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (response.ok) {
        return
      }
    } catch {
      await delay(250)
    }
  }
  throw new Error(`Timed out waiting for API health\n${serverOutput.join('')}`)
}

async function stopServer(server: ChildProcess) {
  if (server.exitCode !== null) {
    return
  }
  server.kill('SIGTERM')
  await delay(250)
  if (server.exitCode === null) {
    server.kill('SIGKILL')
  }
}
