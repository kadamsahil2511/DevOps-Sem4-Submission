import assert from 'node:assert/strict'
import test from 'node:test'
import { DeclarationStore, processDeclaration } from './domain.js'

test('processes a low-risk declaration through approval', () => {
  const store = new DeclarationStore()
  const declaration = store.create(
    {
      referenceNo: 'TN-TEST-001',
      originCountry: 'VN',
      destinationCountry: 'IN',
      commodityCategory: 'textiles',
      declaredValue: 48000,
      previousViolation: false,
      documents: ['invoice', 'packing-list', 'origin-certificate'],
    },
    'test-key-1',
  )

  assert.ok(declaration)
  processDeclaration(declaration)

  assert.equal(declaration.status, 'APPROVED')
  assert.equal(declaration.risk?.band, 'LOW')
  assert.equal(declaration.inspection?.route, 'NONE')
  assert.ok(declaration.history.length >= 6)
})

test('holds a critical-risk declaration for review', () => {
  const store = new DeclarationStore()
  const declaration = store.create(
    {
      referenceNo: 'TN-TEST-002',
      originCountry: 'IR',
      destinationCountry: 'IN',
      commodityCategory: 'dual-use',
      declaredValue: 275000,
      previousViolation: true,
      documents: ['invoice'],
    },
    'test-key-2',
  )

  assert.ok(declaration)
  processDeclaration(declaration)

  assert.equal(declaration.status, 'HELD')
  assert.equal(declaration.risk?.band, 'CRITICAL')
  assert.equal(declaration.inspection?.route, 'PHYSICAL')
})

test('deduplicates repeated idempotency keys', () => {
  const store = new DeclarationStore()
  const first = store.create(
    {
      referenceNo: 'TN-TEST-003',
      originCountry: 'US',
      destinationCountry: 'IN',
      commodityCategory: 'electronics',
      declaredValue: 99000,
      previousViolation: false,
      documents: ['invoice', 'origin-certificate'],
    },
    'same-key',
  )
  const second = store.create(
    {
      referenceNo: 'TN-TEST-004',
      originCountry: 'US',
      destinationCountry: 'IN',
      commodityCategory: 'electronics',
      declaredValue: 99000,
      previousViolation: false,
      documents: ['invoice', 'origin-certificate'],
    },
    'same-key',
  )

  assert.equal(first?.id, second?.id)
})
