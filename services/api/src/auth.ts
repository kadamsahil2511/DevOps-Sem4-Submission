import bcrypt from 'bcryptjs'
import type { NextFunction, Request, Response } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from './db.js'

const sessionCookie = 'tn_session'
const sessionTtlMs = 1000 * 60 * 60 * 8

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export type AuthUser = {
  id: string
  email: string
  name: string
  role: 'IMPORTER' | 'CUSTOMS_OFFICER' | 'OPS_ADMIN'
  organisation: {
    id: string
    name: string
    kind: string
    countryCode: string
  }
}

export type AuthenticatedRequest = Request & {
  user: AuthUser
  sessionTokenHash?: string
}

export async function createSession(response: Response, userId: string) {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashSessionToken(token)
  const expiresAt = new Date(Date.now() + sessionTtlMs)

  await prisma.session.create({
    data: {
      id: `ses_${randomBytes(10).toString('hex')}`,
      tokenHash,
      userId,
      expiresAt,
    },
  })

  response.cookie(sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionTtlMs,
    path: '/',
  })
}

export async function clearSession(request: Request, response: Response) {
  const token = request.cookies?.[sessionCookie]
  if (typeof token === 'string') {
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } })
  }
  response.clearCookie(sessionCookie, { path: '/' })
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash)
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const token = request.cookies?.[sessionCookie]
  if (typeof token !== 'string') {
    response.status(401).json({ error: 'Authentication required' })
    return
  }

  const tokenHash = hashSessionToken(token)
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          organisation: true,
        },
      },
    },
  })

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } })
    }
    response.status(401).json({ error: 'Authentication required' })
    return
  }

  const authenticated = request as AuthenticatedRequest
  authenticated.sessionTokenHash = tokenHash
  authenticated.user = serializeUser(session.user)
  next()
}

export function serializeUser(user: {
  id: string
  email: string
  name: string
  role: AuthUser['role']
  organisation: AuthUser['organisation']
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organisation: user.organisation,
  }
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
