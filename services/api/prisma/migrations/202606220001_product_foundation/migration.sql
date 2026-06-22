CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Declaration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referenceNo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "commodityCategory" TEXT NOT NULL,
    "hsCode" TEXT NOT NULL,
    "declaredValue" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "previousViolation" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Declaration_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Declaration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "Declaration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "factorsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskAssessment_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "Declaration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DutyAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarationId" TEXT NOT NULL,
    "tariffRate" REAL NOT NULL,
    "taxRate" REAL NOT NULL,
    "totalDuty" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DutyAssessment_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "Declaration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarationId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "assignedTeam" TEXT,
    "scheduledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Inspection_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "Declaration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PartnerSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarationId" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastSyncedAt" DATETIME,
    "latencyMs" INTEGER,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerSync_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "Declaration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarationId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT,
    "message" TEXT NOT NULL,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "Declaration" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE UNIQUE INDEX "Declaration_referenceNo_key" ON "Declaration"("referenceNo");
CREATE UNIQUE INDEX "Declaration_idempotencyKey_key" ON "Declaration"("idempotencyKey");
CREATE UNIQUE INDEX "RiskAssessment_declarationId_key" ON "RiskAssessment"("declarationId");
CREATE UNIQUE INDEX "DutyAssessment_declarationId_key" ON "DutyAssessment"("declarationId");
CREATE UNIQUE INDEX "Inspection_declarationId_key" ON "Inspection"("declarationId");
