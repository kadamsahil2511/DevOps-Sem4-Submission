import {
  ClearanceDecision,
  DeclarationStatus,
  InspectionRoute,
  PartnerSyncStatus,
  Prisma,
  RiskBand,
  type Declaration,
  type User,
} from '@prisma/client'
import { nanoid } from 'nanoid'
import { prisma } from './db.js'
import {
  DeclarationStore,
  type AuditEvent as WorkflowAuditEvent,
  type DeclarationInput,
  processDeclaration,
} from './domain.js'
import type { AuthUser } from './auth.js'

const declarationInclude = {
  organisation: true,
  createdBy: {
    include: {
      organisation: true,
    },
  },
  documents: true,
  riskAssessment: true,
  dutyAssessment: true,
  inspection: true,
  partnerSyncs: true,
  auditEvents: {
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.DeclarationInclude

type DeclarationRecord = Prisma.DeclarationGetPayload<{ include: typeof declarationInclude }>

export async function createDeclaration(input: DeclarationInput, idempotencyKey: string, user: AuthUser) {
  const existing = await prisma.declaration.findUnique({
    where: { idempotencyKey },
    include: declarationInclude,
  })
  if (existing) {
    return serializeDeclaration(existing)
  }

  const store = new DeclarationStore()
  const workflow = store.create(input, idempotencyKey)
  if (!workflow) {
    throw new Error('Unable to create declaration workflow')
  }
  processDeclaration(workflow)

  const partnerSyncs = buildPartnerSyncs(workflow.status)
  const created = await prisma.declaration.create({
    data: {
      id: workflow.id,
      referenceNo: workflow.referenceNo,
      status: workflow.status,
      originCountry: workflow.originCountry,
      destinationCountry: workflow.destinationCountry,
      commodityCategory: workflow.commodityCategory,
      hsCode: workflow.hsCode,
      declaredValue: workflow.declaredValue,
      currency: 'USD',
      previousViolation: workflow.previousViolation,
      idempotencyKey,
      organisationId: user.organisation.id,
      createdById: user.id,
      createdAt: new Date(workflow.createdAt),
      updatedAt: new Date(workflow.updatedAt),
      documents: {
        create: workflow.documents.map((document) => ({
          id: `doc_${nanoid(12)}`,
          type: document,
          filename: `${workflow.referenceNo}-${document}.pdf`,
          status: document === 'origin-certificate' ? 'VERIFIED' : 'RECEIVED',
        })),
      },
      riskAssessment: workflow.risk
        ? {
            create: {
              id: `risk_${nanoid(12)}`,
              score: workflow.risk.score,
              band: workflow.risk.band,
              factorsJson: JSON.stringify(workflow.risk.factors),
            },
          }
        : undefined,
      dutyAssessment: workflow.duty
        ? {
            create: {
              id: `duty_${nanoid(12)}`,
              tariffRate: workflow.duty.tariffRate,
              taxRate: workflow.duty.taxRate,
              totalDuty: workflow.duty.totalDuty,
              currency: 'USD',
            },
          }
        : undefined,
      inspection: workflow.inspection
        ? {
            create: {
              id: `ins_${nanoid(12)}`,
              route: workflow.inspection.route,
              reason: workflow.inspection.reason,
              assignedTeam: workflow.inspection.route === 'PHYSICAL' ? 'Mumbai Physical Inspection' : 'Document Desk A',
              scheduledAt:
                workflow.inspection.route === 'NONE' ? null : new Date(Date.now() + 1000 * 60 * 60 * 6),
            },
          }
        : undefined,
      partnerSyncs: {
        create: partnerSyncs,
      },
      auditEvents: {
        create: workflow.history.map((event) => toAuditCreate(event, user.id)),
      },
    },
    include: declarationInclude,
  })

  return serializeDeclaration(created)
}

export async function listDeclarations(user: AuthUser) {
  const declarations = await prisma.declaration.findMany({
    where: declarationScope(user),
    include: declarationInclude,
    orderBy: { createdAt: 'desc' },
  })
  return declarations.map(serializeDeclaration)
}

export async function getDeclaration(id: string, user: AuthUser) {
  const declaration = await prisma.declaration.findFirst({
    where: {
      id,
      ...declarationScope(user),
    },
    include: declarationInclude,
  })
  return declaration ? serializeDeclaration(declaration) : null
}

export async function getDashboardSummary(user: AuthUser) {
  const declarations = await prisma.declaration.findMany({
    where: declarationScope(user),
    include: {
      riskAssessment: true,
      dutyAssessment: true,
      partnerSyncs: true,
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
  const totalDuty = declarations.reduce((total, declaration) => total + (declaration.dutyAssessment?.totalDuty ?? 0), 0)
  const partnerFailures = declarations.flatMap((declaration) => declaration.partnerSyncs).filter(
    (sync) => sync.status === PartnerSyncStatus.FAILED || sync.status === PartnerSyncStatus.DEGRADED,
  ).length
  const openInspections = declarations.filter(
    (declaration) =>
      declaration.status === DeclarationStatus.HELD || declaration.status === DeclarationStatus.INSPECTION_REQUIRED,
  ).length

  return {
    totals,
    declarationCount: declarations.length,
    approvedCount: totals.APPROVED ?? 0,
    heldCount: totals.HELD ?? 0,
    averageRisk,
    totalDuty,
    partnerFailures,
    openInspections,
  }
}

export async function listPartnerStatus(user: AuthUser) {
  const syncs = await prisma.partnerSync.findMany({
    where: {
      declaration: declarationScope(user),
    },
    include: {
      declaration: true,
    },
    orderBy: [{ partner: 'asc' }, { createdAt: 'desc' }],
  })
  return syncs.map((sync) => ({
    id: sync.id,
    partner: sync.partner,
    status: sync.status,
    message: sync.message,
    latencyMs: sync.latencyMs,
    lastSyncedAt: sync.lastSyncedAt?.toISOString() ?? null,
    declaration: {
      id: sync.declaration.id,
      referenceNo: sync.declaration.referenceNo,
      status: sync.declaration.status,
    },
  }))
}

export async function listAuditEvents(user: AuthUser) {
  const events = await prisma.auditEvent.findMany({
    where: {
      declaration: declarationScope(user),
    },
    include: {
      declaration: true,
      user: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return events.map((event) => ({
    id: event.id,
    action: event.action,
    status: event.status,
    message: event.message,
    createdAt: event.createdAt.toISOString(),
    user: event.user ? { id: event.user.id, name: event.user.name, role: event.user.role } : null,
    declaration: event.declaration
      ? { id: event.declaration.id, referenceNo: event.declaration.referenceNo, status: event.declaration.status }
      : null,
  }))
}

export function serializeDeclaration(declaration: DeclarationRecord) {
  return {
    id: declaration.id,
    referenceNo: declaration.referenceNo,
    status: declaration.status,
    originCountry: declaration.originCountry,
    destinationCountry: declaration.destinationCountry,
    commodityCategory: declaration.commodityCategory,
    hsCode: declaration.hsCode,
    declaredValue: declaration.declaredValue,
    currency: declaration.currency,
    previousViolation: declaration.previousViolation,
    organisation: declaration.organisation,
    createdBy: {
      id: declaration.createdBy.id,
      name: declaration.createdBy.name,
      email: declaration.createdBy.email,
      role: declaration.createdBy.role,
    },
    documents: declaration.documents.map((document) => ({
      id: document.id,
      type: document.type,
      filename: document.filename,
      status: document.status,
      createdAt: document.createdAt.toISOString(),
    })),
    risk: declaration.riskAssessment
      ? {
          score: declaration.riskAssessment.score,
          band: declaration.riskAssessment.band,
          factors: parseJsonArray(declaration.riskAssessment.factorsJson),
        }
      : undefined,
    duty: declaration.dutyAssessment
      ? {
          tariffRate: declaration.dutyAssessment.tariffRate,
          taxRate: declaration.dutyAssessment.taxRate,
          totalDuty: declaration.dutyAssessment.totalDuty,
          currency: declaration.dutyAssessment.currency,
        }
      : undefined,
    inspection: declaration.inspection
      ? {
          route: declaration.inspection.route,
          reason: declaration.inspection.reason,
          assignedTeam: declaration.inspection.assignedTeam,
          scheduledAt: declaration.inspection.scheduledAt?.toISOString() ?? null,
        }
      : undefined,
    partnerSyncs: declaration.partnerSyncs.map((sync) => ({
      id: sync.id,
      partner: sync.partner,
      status: sync.status,
      message: sync.message,
      latencyMs: sync.latencyMs,
      lastSyncedAt: sync.lastSyncedAt?.toISOString() ?? null,
    })),
    history: declaration.auditEvents.map((event) => ({
      eventId: event.id,
      status: event.status ?? event.action,
      message: event.message,
      at: event.createdAt.toISOString(),
    })),
    createdAt: declaration.createdAt.toISOString(),
    updatedAt: declaration.updatedAt.toISOString(),
  }
}

export async function recordAuditEvent(
  user: Pick<User, 'id'> | AuthUser,
  message: string,
  action = 'SYSTEM_EVENT',
  declaration?: Pick<Declaration, 'id'>,
) {
  await prisma.auditEvent.create({
    data: {
      id: `evt_${nanoid(12)}`,
      declarationId: declaration?.id,
      userId: user.id,
      action,
      message,
    },
  })
}

function declarationScope(user: AuthUser): Prisma.DeclarationWhereInput {
  if (user.role === 'IMPORTER') {
    return { organisationId: user.organisation.id }
  }
  return {}
}

function toAuditCreate(event: WorkflowAuditEvent, userId: string) {
  return {
    id: event.eventId,
    userId,
    action: event.status,
    status: event.status,
    message: event.message,
    createdAt: new Date(event.at),
  }
}

function buildPartnerSyncs(status: DeclarationStatus) {
  const now = new Date()
  const degraded = status === DeclarationStatus.HELD || status === DeclarationStatus.INSPECTION_REQUIRED
  return [
    {
      id: `sync_${nanoid(12)}`,
      partner: 'ICEGATE Customs Gateway',
      status: degraded ? PartnerSyncStatus.DEGRADED : PartnerSyncStatus.HEALTHY,
      lastSyncedAt: now,
      latencyMs: degraded ? 1840 : 280,
      message: degraded ? 'Manual-review packet queued for customs desk.' : 'Declaration and duty packet accepted.',
    },
    {
      id: `sync_${nanoid(12)}`,
      partner: 'Port Community System',
      status: PartnerSyncStatus.HEALTHY,
      lastSyncedAt: now,
      latencyMs: 340,
      message: 'Container and manifest state synchronized.',
    },
    {
      id: `sync_${nanoid(12)}`,
      partner: 'Bank Guarantee Network',
      status: status === DeclarationStatus.APPROVED ? PartnerSyncStatus.HEALTHY : PartnerSyncStatus.PENDING,
      lastSyncedAt: status === DeclarationStatus.APPROVED ? now : null,
      latencyMs: status === DeclarationStatus.APPROVED ? 420 : null,
      message:
        status === DeclarationStatus.APPROVED
          ? 'Duty guarantee verified.'
          : 'Awaiting final clearance before guarantee capture.',
    },
  ]
}

function parseJsonArray(value: string) {
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
}

export const enumMaps = {
  ClearanceDecision,
  DeclarationStatus,
  InspectionRoute,
  RiskBand,
}
