import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FilePlus2,
  Gauge,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import './App.css'

type DeclarationStatus =
  | 'RECEIVED'
  | 'VALIDATED'
  | 'PROCESSING'
  | 'AWAITING_PARTNER'
  | 'INSPECTION_REQUIRED'
  | 'READY_FOR_CLEARANCE'
  | 'APPROVED'
  | 'HELD'
  | 'REJECTED'

type Declaration = {
  id: string
  referenceNo: string
  status: DeclarationStatus
  originCountry: string
  destinationCountry: string
  commodityCategory: string
  declaredValue: number
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
  history: Array<{
    status: string
    message: string
    at: string
    eventId: string
  }>
  createdAt: string
  updatedAt: string
}

type ApiHealth = {
  service: string
  status: string
  environment: string
  uptimeSeconds: number
}

type Metrics = {
  totals: Record<string, number>
  averageRisk: number
  oldestProcessingSeconds: number
}

const samplePayload = {
  referenceNo: 'TN-2026-SEA-0417',
  originCountry: 'VN',
  destinationCountry: 'IN',
  commodityCategory: 'electronics',
  declaredValue: 184000,
  previousViolation: false,
  documents: ['invoice', 'packing-list', 'origin-certificate'],
}

function App() {
  const [health, setHealth] = useState<ApiHealth | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [declarations, setDeclarations] = useState<Declaration[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedDeclaration = useMemo(
    () => declarations.find((declaration) => declaration.id === selectedId) ?? declarations[0],
    [declarations, selectedId],
  )

  const refreshData = useCallback(async () => {
    try {
      setError(null)
      const [healthResponse, metricsResponse, declarationsResponse] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/metrics/domain'),
        fetch('/api/declarations'),
      ])

      if (!healthResponse.ok || !metricsResponse.ok || !declarationsResponse.ok) {
        throw new Error('API returned an unhealthy response')
      }

      setHealth(await healthResponse.json())
      setMetrics(await metricsResponse.json())
      const nextDeclarations = (await declarationsResponse.json()) as Declaration[]
      setDeclarations(nextDeclarations)
      setSelectedId((current) => current ?? nextDeclarations[0]?.id ?? null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to reach API')
    }
  }, [])

  async function submitDeclaration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      const response = await fetch('/api/declarations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(samplePayload),
      })

      if (!response.ok) {
        throw new Error('Declaration submission failed')
      }

      const declaration = (await response.json()) as Declaration
      setSelectedId(declaration.id)
      await refreshData()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Submission failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    const immediate = window.setTimeout(() => {
      void refreshData()
    }, 0)
    const timer = window.setInterval(() => {
      void refreshData()
    }, 3500)
    return () => {
      window.clearTimeout(immediate)
      window.clearInterval(timer)
    }
  }, [refreshData])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Project TradeNet</p>
          <h1>Customs operations console</h1>
        </div>
        <div className="topbar-actions">
          <span className={`service-pill ${health?.status === 'ok' ? 'ok' : 'warn'}`}>
            <Activity size={16} />
            {health ? `${health.service} ${health.status}` : 'API pending'}
          </span>
          <button className="icon-button" type="button" onClick={refreshData} aria-label="Refresh data">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {error && (
        <div className="alert" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className="metric-grid" aria-label="Domain metrics">
        <Metric icon={<FilePlus2 />} label="Declarations" value={String(declarations.length)} />
        <Metric icon={<PackageCheck />} label="Approved" value={String(metrics?.totals.APPROVED ?? 0)} />
        <Metric icon={<Gauge />} label="Average risk" value={metrics ? metrics.averageRisk.toFixed(0) : '0'} />
        <Metric icon={<Clock3 />} label="Oldest processing" value={`${metrics?.oldestProcessingSeconds ?? 0}s`} />
      </section>

      <section className="workspace">
        <form className="submit-panel" onSubmit={submitDeclaration}>
          <div>
            <p className="eyebrow">Declaration intake</p>
            <h2>Submit sample manifest</h2>
          </div>
          <dl>
            <div>
              <dt>Reference</dt>
              <dd>{samplePayload.referenceNo}</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>
                {samplePayload.originCountry} to {samplePayload.destinationCountry}
              </dd>
            </div>
            <div>
              <dt>Value</dt>
              <dd>{formatMoney(samplePayload.declaredValue)}</dd>
            </div>
            <div>
              <dt>Documents</dt>
              <dd>{samplePayload.documents.length} attached</dd>
            </div>
          </dl>
          <button type="submit" disabled={isSubmitting}>
            <FilePlus2 size={18} />
            {isSubmitting ? 'Submitting' : 'Submit declaration'}
          </button>
        </form>

        <div className="declaration-list">
          <div className="section-heading">
            <h2>Live declarations</h2>
            <span>{declarations.length} records</span>
          </div>
          {declarations.map((declaration) => (
            <button
              className={`declaration-row ${selectedDeclaration?.id === declaration.id ? 'active' : ''}`}
              key={declaration.id}
              type="button"
              onClick={() => setSelectedId(declaration.id)}
            >
              <span>
                <strong>{declaration.referenceNo}</strong>
                <small>
                  {declaration.originCountry} to {declaration.destinationCountry}
                </small>
              </span>
              <StatusBadge status={declaration.status} />
            </button>
          ))}
        </div>

        <article className="detail-panel">
          {selectedDeclaration ? (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Correlation ID</p>
                  <h2>{selectedDeclaration.id}</h2>
                </div>
                <StatusBadge status={selectedDeclaration.status} />
              </div>

              <div className="decision-grid">
                <DecisionItem
                  icon={<ShieldCheck />}
                  label="Risk"
                  value={
                    selectedDeclaration.risk
                      ? `${selectedDeclaration.risk.band} ${selectedDeclaration.risk.score}`
                      : 'Pending'
                  }
                />
                <DecisionItem
                  icon={<Gauge />}
                  label="Duty"
                  value={selectedDeclaration.duty ? formatMoney(selectedDeclaration.duty.totalDuty) : 'Pending'}
                />
                <DecisionItem
                  icon={<PackageCheck />}
                  label="Inspection"
                  value={selectedDeclaration.inspection?.route ?? 'Pending'}
                />
                <DecisionItem
                  icon={<CheckCircle2 />}
                  label="Clearance"
                  value={selectedDeclaration.clearance?.decision ?? 'Pending'}
                />
              </div>

              <ol className="timeline">
                {selectedDeclaration.history.map((event) => (
                  <li key={event.eventId}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{event.status}</strong>
                      <p>{event.message}</p>
                      <time>{new Date(event.at).toLocaleString()}</time>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <div className="empty-state">Submit a declaration to begin processing.</div>
          )}
        </article>
      </section>
    </main>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function DecisionItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="decision-item">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}

function StatusBadge({ status }: { status: DeclarationStatus }) {
  const group = status === 'APPROVED' ? 'ok' : status === 'HELD' || status === 'REJECTED' ? 'warn' : 'active'
  return <span className={`status-badge ${group}`}>{status.replaceAll('_', ' ')}</span>
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export default App
