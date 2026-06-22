import bcrypt from 'bcryptjs'
import { prisma } from './db.js'
import { createDeclaration } from './repository.js'
import type { AuthUser } from './auth.js'

const demoPassword = 'TradeNet@2026'

const organisations = [
  { id: 'org_global_imports', name: 'Global Importers Pvt Ltd', kind: 'Importer', countryCode: 'IN' },
  { id: 'org_customs_west', name: 'India Customs West Zone', kind: 'Regulator', countryCode: 'IN' },
  { id: 'org_tradenet_ops', name: 'TradeNet Operations', kind: 'Platform', countryCode: 'IN' },
]

const users = [
  {
    id: 'usr_importer_demo',
    email: 'importer@tradenet.demo',
    name: 'Anaya Rao',
    role: 'IMPORTER' as const,
    organisationId: 'org_global_imports',
  },
  {
    id: 'usr_customs_demo',
    email: 'officer@tradenet.demo',
    name: 'Vikram Menon',
    role: 'CUSTOMS_OFFICER' as const,
    organisationId: 'org_customs_west',
  },
  {
    id: 'usr_admin_demo',
    email: 'admin@tradenet.demo',
    name: 'Mira Shah',
    role: 'OPS_ADMIN' as const,
    organisationId: 'org_tradenet_ops',
  },
]

const seedDeclarations = [
  {
    referenceNo: 'TN-2026-SEA-0417',
    originCountry: 'VN',
    destinationCountry: 'IN',
    commodityCategory: 'electronics',
    hsCode: '8517.62',
    declaredValue: 184000,
    previousViolation: false,
    documents: ['invoice', 'packing-list', 'origin-certificate'],
  },
  {
    referenceNo: 'TN-2026-AIR-0982',
    originCountry: 'DE',
    destinationCountry: 'IN',
    commodityCategory: 'machinery',
    hsCode: '8479.89',
    declaredValue: 76000,
    previousViolation: false,
    documents: ['invoice', 'packing-list', 'origin-certificate', 'insurance'],
  },
  {
    referenceNo: 'TN-2026-RED-2204',
    originCountry: 'IR',
    destinationCountry: 'IN',
    commodityCategory: 'dual-use',
    hsCode: '8543.70',
    declaredValue: 275000,
    previousViolation: true,
    documents: ['invoice'],
  },
  {
    referenceNo: 'TN-2026-SEA-1120',
    originCountry: 'TH',
    destinationCountry: 'IN',
    commodityCategory: 'textiles',
    hsCode: '6204.43',
    declaredValue: 48000,
    previousViolation: false,
    documents: ['invoice', 'packing-list', 'origin-certificate'],
  },
]

export async function seedDatabase() {
  const passwordHash = await bcrypt.hash(demoPassword, 12)

  for (const organisation of organisations) {
    await prisma.organisation.upsert({
      where: { id: organisation.id },
      update: organisation,
      create: organisation,
    })
  }

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        organisationId: user.organisationId,
      },
      create: {
        ...user,
        passwordHash,
      },
    })
  }

  const declarationCount = await prisma.declaration.count()
  if (declarationCount > 0) {
    return { seeded: false, users: users.length, declarations: declarationCount }
  }

  const importer = await prisma.user.findUniqueOrThrow({
    where: { email: 'importer@tradenet.demo' },
    include: { organisation: true },
  })
  const authUser: AuthUser = {
    id: importer.id,
    email: importer.email,
    name: importer.name,
    role: importer.role,
    organisation: importer.organisation,
  }

  for (const declaration of seedDeclarations) {
    await createDeclaration(declaration, `seed-${declaration.referenceNo}`, authUser)
  }

  return { seeded: true, users: users.length, declarations: seedDeclarations.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then((result) => {
      console.log(JSON.stringify({ service: 'tradenet-api', event: 'seed-complete', ...result }))
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
