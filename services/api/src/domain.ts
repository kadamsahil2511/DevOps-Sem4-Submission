import { nanoid } from 'nanoid'
import { z } from 'zod'

export const declarationInputSchema = z.object({
  referenceNo: z.string().min(4),
  originCountry: z.string().length(2),
  destinationCountry: z.string().length(2),
  commodityCategory: z.string().min(2),
  hsCode: z.string().min(4).default('0000.00'),
  declaredValue: z.number().positive(),
  previousViolation: z.boolean().default(false),
  documents: z.array(z.string()).default([]),
})

export type DeclarationInput = z.input<typeof declarationInputSchema>

export type DeclarationStatus =
  | 'RECEIVED'
  | 'VALIDATED'
  | 'PROCESSING'
  | 'AWAITING_PARTNER'
  | 'INSPECTION_REQUIRED'
  | 'READY_FOR_CLEARANCE'
  | 'APPROVED'
  | 'HELD'
  | 'REJECTED'

export type Declaration = {
  id: string
  referenceNo: string
  status: DeclarationStatus
  originCountry: string
  destinationCountry: string
  commodityCategory: string
  hsCode: string
  declaredValue: number
  previousViolation: boolean
  documents: string[]
  risk?: {
    score: number
    band: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    factors: string[]
  }
  duty?: {
    tariffRate: number
    taxRate: number
    totalDuty: number
  }
  inspection?: {
    route: 'NONE' | 'DOCUMENT_REVIEW' | 'PHYSICAL'
    reason: string
  }
  clearance?: {
    decision: 'APPROVED' | 'HELD' | 'REJECTED'
    reason: string
  }
  history: AuditEvent[]
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

export type AuditEvent = {
  status: DeclarationStatus | 'RISK_ASSESSED' | 'DUTY_CALCULATED' | 'INSPECTION_DECIDED' | 'CLEARANCE_DECIDED'
  message: string
  at: string
  eventId: string
}

export class DeclarationStore {
  private declarations = new Map<string, Declaration>()
  private idempotency = new Map<string, string>()

  create(input: DeclarationInput, idempotencyKey: string) {
    const existingId = this.idempotency.get(idempotencyKey)
    if (existingId) {
      return this.declarations.get(existingId)
    }

    const now = new Date().toISOString()
    const declaration: Declaration = {
      id: `dec_${nanoid(12)}`,
      referenceNo: input.referenceNo,
      status: 'RECEIVED',
      originCountry: input.originCountry.toUpperCase(),
      destinationCountry: input.destinationCountry.toUpperCase(),
      commodityCategory: input.commodityCategory.toLowerCase(),
      hsCode: input.hsCode ?? '0000.00',
      declaredValue: input.declaredValue,
      previousViolation: input.previousViolation ?? false,
      documents: input.documents ?? [],
      history: [],
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    }

    addEvent(declaration, 'RECEIVED', 'Declaration accepted and persisted with outbox event.')
    this.declarations.set(declaration.id, declaration)
    this.idempotency.set(idempotencyKey, declaration.id)
    return declaration
  }

  list() {
    return [...this.declarations.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  get(id: string) {
    return this.declarations.get(id)
  }

  update(id: string, updater: (declaration: Declaration) => void) {
    const declaration = this.declarations.get(id)
    if (!declaration) {
      return undefined
    }

    updater(declaration)
    declaration.updatedAt = new Date().toISOString()
    return declaration
  }

  metrics() {
    const declarations = this.list()
    const totals = declarations.reduce<Record<string, number>>((summary, declaration) => {
      summary[declaration.status] = (summary[declaration.status] ?? 0) + 1
      return summary
    }, {})

    const riskScores = declarations.map((declaration) => declaration.risk?.score ?? 0)
    const averageRisk = riskScores.length
      ? riskScores.reduce((total, score) => total + score, 0) / riskScores.length
      : 0

    const processing = declarations.filter((declaration) =>
      ['RECEIVED', 'VALIDATED', 'PROCESSING', 'AWAITING_PARTNER', 'INSPECTION_REQUIRED'].includes(declaration.status),
    )

    const oldestProcessingSeconds = processing.length
      ? Math.round((Date.now() - Math.min(...processing.map((declaration) => Date.parse(declaration.createdAt)))) / 1000)
      : 0

    return {
      totals,
      averageRisk,
      oldestProcessingSeconds,
    }
  }
}

export function processDeclaration(declaration: Declaration) {
  setStatus(declaration, 'VALIDATED', 'Schema, ownership, and idempotency checks passed.')
  setStatus(declaration, 'PROCESSING', 'Asynchronous risk, tariff, and partner checks started.')
  const risk = assessRisk(declaration)
  declaration.risk = risk
  addEvent(declaration, 'RISK_ASSESSED', `Risk assessed as ${risk.band} with score ${risk.score}.`)
  const duty = calculateDuty(declaration)
  declaration.duty = duty
  addEvent(declaration, 'DUTY_CALCULATED', `Duty calculated at ${duty.totalDuty.toFixed(2)}.`)
  const inspection = decideInspection(declaration)
  declaration.inspection = inspection
  setStatus(
    declaration,
    inspection.route === 'NONE' ? 'READY_FOR_CLEARANCE' : 'INSPECTION_REQUIRED',
    `Inspection route selected: ${inspection.route}.`,
  )
  const clearance = decideClearance(declaration)
  declaration.clearance = clearance
  setStatus(
    declaration,
    clearance.decision,
    `Clearance decision: ${clearance.decision}. ${clearance.reason}`,
  )
  return declaration
}

export function assessRisk(declaration: Declaration): NonNullable<Declaration['risk']> {
  const factors: string[] = []
  let score = 0

  if (['IR', 'KP', 'SY'].includes(declaration.originCountry) || ['IR', 'KP', 'SY'].includes(declaration.destinationCountry)) {
    score += 40
    factors.push('Restricted origin or destination')
  }
  if (declaration.previousViolation) {
    score += 25
    factors.push('Previous compliance violation')
  }
  if (['weapons', 'chemicals', 'dual-use'].includes(declaration.commodityCategory)) {
    score += 20
    factors.push('High-risk commodity category')
  }
  if (declaration.declaredValue > 150000) {
    score += 15
    factors.push('Declared-value anomaly')
  }
  if (!declaration.documents.includes('origin-certificate')) {
    score += 20
    factors.push('Missing mandatory document')
  }

  const cappedScore = Math.min(score, 100)
  const band = cappedScore >= 80 ? 'CRITICAL' : cappedScore >= 60 ? 'HIGH' : cappedScore >= 30 ? 'MEDIUM' : 'LOW'

  return {
    score: cappedScore,
    band,
    factors,
  }
}

export function calculateDuty(declaration: Declaration): NonNullable<Declaration['duty']> {
  const tariffRate = declaration.commodityCategory === 'electronics' ? 0.08 : 0.05
  const taxRate = 0.12
  const totalDuty = Math.round(declaration.declaredValue * (tariffRate + taxRate) * 100) / 100
  return { tariffRate, taxRate, totalDuty }
}

export function decideInspection(declaration: Declaration): NonNullable<Declaration['inspection']> {
  if (!declaration.risk) {
    throw new Error('Risk must be assessed before inspection routing')
  }

  if (declaration.risk.score >= 80) {
    return { route: 'PHYSICAL', reason: 'Critical risk score requires physical inspection.' }
  }
  if (declaration.risk.score >= 30 || !declaration.documents.includes('origin-certificate')) {
    return { route: 'DOCUMENT_REVIEW', reason: 'Moderate risk or document gap requires review.' }
  }
  return { route: 'NONE', reason: 'Low-risk shipment can proceed to clearance.' }
}

export function decideClearance(declaration: Declaration): NonNullable<Declaration['clearance']> {
  if (!declaration.risk || !declaration.inspection) {
    throw new Error('Risk and inspection must complete before clearance')
  }

  if (declaration.risk.score >= 80) {
    return { decision: 'HELD', reason: 'Shipment held for manual customs review.' }
  }
  if (declaration.inspection.route === 'PHYSICAL') {
    return { decision: 'HELD', reason: 'Physical inspection required before release.' }
  }
  return { decision: 'APPROVED', reason: 'All required checks completed.' }
}

function setStatus(declaration: Declaration, status: DeclarationStatus, message: string) {
  declaration.status = status
  addEvent(declaration, status, message)
}

function addEvent(declaration: Declaration, status: AuditEvent['status'], message: string) {
  const now = new Date().toISOString()
  declaration.history.push({
    status,
    message,
    at: now,
    eventId: `evt_${nanoid(10)}`,
  })
  declaration.updatedAt = now
}
