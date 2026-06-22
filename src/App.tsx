import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  FilePlus2,
  Fingerprint,
  Gauge,
  Landmark,
  LogOut,
  Network,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import './App.css'

type Role = 'IMPORTER' | 'CUSTOMS_OFFICER' | 'OPS_ADMIN'

type SessionUser = {
  id: string
  email: string
  name: string
  role: Role
  organisation: {
    id: string
    name: string
    kind: string
    countryCode: string
  }
}

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
  hsCode: string
  declaredValue: number
  currency: string
  organisation: { name: string; countryCode: string }
  createdBy: { name: string; role: Role }
  documents: Array<{ id: string; type: string; filename: string; status: string }>
  risk?: {
    score: number
    band: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    factors: string[]
  }
  duty?: {
    tariffRate: number
    taxRate: number
    totalDuty: number
    currency: string
  }
  inspection?: {
    route: 'NONE' | 'DOCUMENT_REVIEW' | 'PHYSICAL'
    reason: string
    assignedTeam: string | null
    scheduledAt: string | null
  }
  partnerSyncs: PartnerSync[]
  history: Array<{
    status: string
    message: string
    at: string
    eventId: string
  }>
  createdAt: string
  updatedAt: string
}

type DashboardSummary = {
  totals: Record<string, number>
  declarationCount: number
  approvedCount: number
  heldCount: number
  averageRisk: number
  totalDuty: number
  partnerFailures: number
  openInspections: number
}

type PartnerSync = {
  id: string
  partner: string
  status: 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'PENDING'
  message: string
  latencyMs: number | null
  lastSyncedAt: string | null
  declaration?: {
    id: string
    referenceNo: string
    status: DeclarationStatus
  }
}

type AuditEvent = {
  id: string
  action: string
  status: string | null
  message: string
  createdAt: string
  user: { name: string; role: Role } | null
  declaration: { id: string; referenceNo: string; status: DeclarationStatus } | null
}

type View = 'dashboard' | 'declarations' | 'partners' | 'audit'

type ProductData = {
  summary: DashboardSummary
  declarations: Declaration[]
  partners: PartnerSync[]
  auditEvents: AuditEvent[]
}

const demoAccounts = [
  { label: 'Importer', email: 'importer@tradenet.demo', password: 'TradeNet@2026' },
  { label: 'Customs', email: 'officer@tradenet.demo', password: 'TradeNet@2026' },
  { label: 'Ops Admin', email: 'admin@tradenet.demo', password: 'TradeNet@2026' },
]

const initialForm = {
  referenceNo: `TN-2026-WEB-${Math.floor(1000 + Math.random() * 9000)}`,
  originCountry: 'SG',
  destinationCountry: 'IN',
  commodityCategory: 'electronics',
  hsCode: '8517.62',
  declaredValue: '126000',
  previousViolation: false,
  documents: ['invoice', 'packing-list', 'origin-certificate'],
}

function App() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [view, setView] = useState<View>('dashboard')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [declarations, setDeclarations] = useState<Declaration[]>([])
  const [partners, setPartners] = useState<PartnerSync[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(initialForm)
  const [loginEmail, setLoginEmail] = useState(demoAccounts[0].email)
  const [loginPassword, setLoginPassword] = useState(demoAccounts[0].password)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedDeclaration = useMemo(
    () => declarations.find((declaration) => declaration.id === selectedId) ?? declarations[0] ?? null,
    [declarations, selectedId],
  )

  const filteredDeclarations = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) {
      return declarations
    }
    return declarations.filter((declaration) =>
      [
        declaration.referenceNo,
        declaration.status,
        declaration.originCountry,
        declaration.destinationCountry,
        declaration.commodityCategory,
        declaration.organisation.name,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [declarations, query])

  const applyProductData = useCallback((data: ProductData) => {
    setSummary(data.summary)
    setDeclarations(data.declarations)
    setPartners(data.partners)
    setAuditEvents(data.auditEvents)
    setSelectedId((current) => current ?? data.declarations[0]?.id ?? null)
  }, [])

  const refreshData = useCallback(async () => {
    try {
      setError(null)
      applyProductData(await fetchProductData())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to refresh product data')
    }
  }, [applyProductData])

  useEffect(() => {
    let isActive = true

    api<{ user: SessionUser }>('/api/auth/session')
      .then(async (session) => {
        const data = await fetchProductData()
        if (!isActive) {
          return
        }
        setUser(session.user)
        applyProductData(data)
      })
      .catch(() => {
        if (isActive) {
          setUser(null)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })
    return () => {
      isActive = false
    }
  }, [applyProductData])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      setError(null)
      const session = await api<{ user: SessionUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      setUser(session.user)
      applyProductData(await fetchProductData())
      setView('dashboard')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Login failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
    setSummary(null)
    setDeclarations([])
    setPartners([])
    setAuditEvents([])
  }

  async function submitDeclaration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      setError(null)
      const declaration = await api<Declaration>('/api/declarations', {
        method: 'POST',
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          ...form,
          originCountry: form.originCountry.toUpperCase(),
          destinationCountry: form.destinationCountry.toUpperCase(),
          declaredValue: Number(form.declaredValue),
        }),
      })
      setSelectedId(declaration.id)
      setView('declarations')
      setForm({
        ...initialForm,
        referenceNo: `TN-2026-WEB-${Math.floor(1000 + Math.random() * 9000)}`,
      })
      await refreshData()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Declaration submission failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="boot-screen">TradeNet</div>
  }

  if (!user) {
    return (
      <main className="login-page">
        <section className="login-hero">
          <div className="brand-mark">TradeNet</div>
          <h1>Customs clearance command center</h1>
          <div className="hero-ticker" aria-label="Platform metrics">
            <MetricValue label="Declarations" value="4 seeded" />
            <MetricValue label="Partners" value="3 live" />
            <MetricValue label="Checks" value="Auth + DB" />
          </div>
        </section>

        <form className="login-panel" onSubmit={login}>
          <div>
            <p className="eyebrow">Secure access</p>
            <h2>Sign in</h2>
          </div>
          {error && <InlineAlert>{error}</InlineAlert>}
          <label>
            Email
            <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} type="email" />
          </label>
          <label>
            Password
            <input
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              type="password"
            />
          </label>
          <div className="demo-switcher">
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                className="secondary-button"
                onClick={() => {
                  setLoginEmail(account.email)
                  setLoginPassword(account.password)
                }}
              >
                {account.label}
              </button>
            ))}
          </div>
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            <ShieldCheck size={18} />
            {isSubmitting ? 'Signing in' : 'Sign in'}
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="product-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">TradeNet</div>
          <span>{user.organisation.name}</span>
        </div>
        <nav className="nav-list" aria-label="Workspace views">
          <NavButton icon={<BarChart3 />} label="Dashboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
          <NavButton
            icon={<Database />}
            label="Declarations"
            active={view === 'declarations'}
            onClick={() => setView('declarations')}
          />
          <NavButton icon={<Network />} label="Partners" active={view === 'partners'} onClick={() => setView('partners')} />
          <NavButton icon={<Fingerprint />} label="Audit" active={view === 'audit'} onClick={() => setView('audit')} />
        </nav>
        <div className="user-block">
          <UserRound size={18} />
          <div>
            <strong>{user.name}</strong>
            <span>{formatRole(user.role)}</span>
          </div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Live environment</p>
            <h1>{viewTitle(view)}</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={refreshData} aria-label="Refresh data">
              <RefreshCw size={18} />
            </button>
            <button className="secondary-button" type="button" onClick={logout}>
              <LogOut size={17} />
              Logout
            </button>
          </div>
        </header>

        {error && <InlineAlert>{error}</InlineAlert>}

        {view === 'dashboard' && (
          <DashboardView summary={summary} declarations={declarations} partners={partners} auditEvents={auditEvents} />
        )}

        {view === 'declarations' && (
          <section className="declaration-workspace">
            <form className="intake-panel" onSubmit={submitDeclaration}>
              <div>
                <p className="eyebrow">Declaration intake</p>
                <h2>New shipment</h2>
              </div>
              <label>
                Reference
                <input
                  value={form.referenceNo}
                  onChange={(event) => setForm({ ...form, referenceNo: event.target.value })}
                />
              </label>
              <div className="form-grid">
                <label>
                  Origin
                  <input
                    value={form.originCountry}
                    maxLength={2}
                    onChange={(event) => setForm({ ...form, originCountry: event.target.value })}
                  />
                </label>
                <label>
                  Destination
                  <input
                    value={form.destinationCountry}
                    maxLength={2}
                    onChange={(event) => setForm({ ...form, destinationCountry: event.target.value })}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Commodity
                  <select
                    value={form.commodityCategory}
                    onChange={(event) => setForm({ ...form, commodityCategory: event.target.value })}
                  >
                    <option value="electronics">Electronics</option>
                    <option value="machinery">Machinery</option>
                    <option value="textiles">Textiles</option>
                    <option value="chemicals">Chemicals</option>
                    <option value="dual-use">Dual use</option>
                  </select>
                </label>
                <label>
                  HS code
                  <input value={form.hsCode} onChange={(event) => setForm({ ...form, hsCode: event.target.value })} />
                </label>
              </div>
              <label>
                Declared value
                <input
                  value={form.declaredValue}
                  type="number"
                  min="1"
                  onChange={(event) => setForm({ ...form, declaredValue: event.target.value })}
                />
              </label>
              <label className="check-row">
                <input
                  checked={form.previousViolation}
                  type="checkbox"
                  onChange={(event) => setForm({ ...form, previousViolation: event.target.checked })}
                />
                Previous violation
              </label>
              <div className="document-toggles">
                {['invoice', 'packing-list', 'origin-certificate', 'insurance'].map((document) => (
                  <label key={document}>
                    <input
                      checked={form.documents.includes(document)}
                      type="checkbox"
                      onChange={(event) => {
                        const documents = event.target.checked
                          ? [...form.documents, document]
                          : form.documents.filter((item) => item !== document)
                        setForm({ ...form, documents })
                      }}
                    />
                    {document.replaceAll('-', ' ')}
                  </label>
                ))}
              </div>
              <button className="primary-button" type="submit" disabled={isSubmitting}>
                <FilePlus2 size={18} />
                {isSubmitting ? 'Submitting' : 'Submit declaration'}
              </button>
            </form>

            <div className="record-column">
              <div className="search-box">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search declarations"
                />
              </div>
              <div className="declaration-list">
                {filteredDeclarations.map((declaration) => (
                  <button
                    className={`declaration-row ${selectedDeclaration?.id === declaration.id ? 'active' : ''}`}
                    key={declaration.id}
                    type="button"
                    onClick={() => setSelectedId(declaration.id)}
                  >
                    <span>
                      <strong>{declaration.referenceNo}</strong>
                      <small>
                        {declaration.originCountry} to {declaration.destinationCountry} - {declaration.hsCode}
                      </small>
                    </span>
                    <StatusBadge status={declaration.status} />
                  </button>
                ))}
              </div>
            </div>

            <DeclarationDetail declaration={selectedDeclaration} />
          </section>
        )}

        {view === 'partners' && <PartnerView partners={partners} />}
        {view === 'audit' && <AuditView events={auditEvents} />}
      </section>
    </main>
  )
}

function DashboardView({
  summary,
  declarations,
  partners,
  auditEvents,
}: {
  summary: DashboardSummary | null
  declarations: Declaration[]
  partners: PartnerSync[]
  auditEvents: AuditEvent[]
}) {
  const latest = declarations.slice(0, 5)
  return (
    <section className="dashboard-grid">
      <Metric icon={<Database />} label="Declarations" value={String(summary?.declarationCount ?? 0)} />
      <Metric icon={<PackageCheck />} label="Approved" value={String(summary?.approvedCount ?? 0)} />
      <Metric icon={<Gauge />} label="Average risk" value={(summary?.averageRisk ?? 0).toFixed(0)} />
      <Metric icon={<Landmark />} label="Duty secured" value={formatMoney(summary?.totalDuty ?? 0)} />

      <article className="wide-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Operations queue</p>
            <h2>Latest declarations</h2>
          </div>
          <span>{summary?.openInspections ?? 0} inspections</span>
        </div>
        <div className="table-list">
          {latest.map((declaration) => (
            <div className="table-row" key={declaration.id}>
              <strong>{declaration.referenceNo}</strong>
              <span>{declaration.organisation.name}</span>
              <span>{formatMoney(declaration.declaredValue)}</span>
              <StatusBadge status={declaration.status} />
            </div>
          ))}
        </div>
      </article>

      <article className="side-panel">
        <div className="section-heading compact">
          <h2>Partner health</h2>
          <span>{summary?.partnerFailures ?? 0} degraded</span>
        </div>
        <div className="mini-list">
          {partners.slice(0, 5).map((partner) => (
            <div key={partner.id}>
              <strong>{partner.partner}</strong>
              <PartnerBadge status={partner.status} />
            </div>
          ))}
        </div>
      </article>

      <article className="wide-panel">
        <div className="section-heading compact">
          <h2>Audit feed</h2>
          <span>{auditEvents.length} events</span>
        </div>
        <ol className="timeline compact-timeline">
          {auditEvents.slice(0, 6).map((event) => (
            <TimelineEvent
              key={event.id}
              title={event.declaration?.referenceNo ?? event.action}
              message={event.message}
              at={event.createdAt}
            />
          ))}
        </ol>
      </article>
    </section>
  )
}

function DeclarationDetail({ declaration }: { declaration: Declaration | null }) {
  if (!declaration) {
    return <article className="detail-panel empty-state">No declaration selected</article>
  }

  return (
    <article className="detail-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Declaration detail</p>
          <h2>{declaration.referenceNo}</h2>
        </div>
        <StatusBadge status={declaration.status} />
      </div>

      <div className="decision-grid">
        <DecisionItem
          icon={<ShieldCheck />}
          label="Risk"
          value={declaration.risk ? `${declaration.risk.band} ${declaration.risk.score}` : 'Pending'}
        />
        <DecisionItem
          icon={<Landmark />}
          label="Duty"
          value={declaration.duty ? formatMoney(declaration.duty.totalDuty) : 'Pending'}
        />
        <DecisionItem icon={<PackageCheck />} label="Inspection" value={declaration.inspection?.route ?? 'Pending'} />
        <DecisionItem icon={<CheckCircle2 />} label="Clearance" value={declaration.status} />
      </div>

      <div className="detail-grid">
        <InfoBlock label="Route" value={`${declaration.originCountry} to ${declaration.destinationCountry}`} />
        <InfoBlock label="Commodity" value={`${declaration.commodityCategory} / ${declaration.hsCode}`} />
        <InfoBlock label="Importer" value={declaration.organisation.name} />
        <InfoBlock label="Declared value" value={formatMoney(declaration.declaredValue)} />
      </div>

      <div className="section-heading compact">
        <h3>Documents</h3>
        <span>{declaration.documents.length} files</span>
      </div>
      <div className="document-list">
        {declaration.documents.map((document) => (
          <div key={document.id}>
            <strong>{document.type.replaceAll('-', ' ')}</strong>
            <span>{document.status}</span>
          </div>
        ))}
      </div>

      <div className="section-heading compact">
        <h3>Audit trail</h3>
        <span>{declaration.history.length} events</span>
      </div>
      <ol className="timeline">
        {declaration.history.map((event) => (
          <TimelineEvent key={event.eventId} title={event.status} message={event.message} at={event.at} />
        ))}
      </ol>
    </article>
  )
}

function PartnerView({ partners }: { partners: PartnerSync[] }) {
  return (
    <section className="full-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Partner operations</p>
          <h2>Integration status</h2>
        </div>
        <span>{partners.length} checks</span>
      </div>
      <div className="partner-grid">
        {partners.map((partner) => (
          <article className="partner-row" key={partner.id}>
            <div>
              <strong>{partner.partner}</strong>
              <span>{partner.declaration?.referenceNo}</span>
            </div>
            <PartnerBadge status={partner.status} />
            <span>{partner.latencyMs ? `${partner.latencyMs} ms` : 'Pending'}</span>
            <p>{partner.message}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function AuditView({ events }: { events: AuditEvent[] }) {
  return (
    <section className="full-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Governance</p>
          <h2>Audit timeline</h2>
        </div>
        <span>{events.length} events</span>
      </div>
      <ol className="timeline audit-timeline">
        {events.map((event) => (
          <TimelineEvent
            key={event.id}
            title={`${event.declaration?.referenceNo ?? 'System'} - ${event.status ?? event.action}`}
            message={`${event.message}${event.user ? ` by ${event.user.name}` : ''}`}
            at={event.createdAt}
          />
        ))}
      </ol>
    </section>
  )
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button className={`nav-button ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
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

function MetricValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function DecisionItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="decision-item">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value.replaceAll('_', ' ')}</strong>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-block">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}

function TimelineEvent({ title, message, at }: { title: string; message: string; at: string }) {
  return (
    <li>
      <span className="timeline-dot" />
      <div>
        <strong>{title.replaceAll('_', ' ')}</strong>
        <p>{message}</p>
        <time>{new Date(at).toLocaleString()}</time>
      </div>
    </li>
  )
}

function StatusBadge({ status }: { status: DeclarationStatus }) {
  const group = status === 'APPROVED' ? 'ok' : status === 'HELD' || status === 'REJECTED' ? 'warn' : 'active'
  return <span className={`status-badge ${group}`}>{status.replaceAll('_', ' ')}</span>
}

function PartnerBadge({ status }: { status: PartnerSync['status'] }) {
  const group = status === 'HEALTHY' ? 'ok' : status === 'PENDING' ? 'active' : 'warn'
  return <span className={`status-badge ${group}`}>{status}</span>
}

function InlineAlert({ children }: { children: ReactNode }) {
  return (
    <div className="alert" role="alert">
      <AlertTriangle size={18} />
      <span>{children}</span>
    </div>
  )
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? `Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function fetchProductData(): Promise<ProductData> {
  const [summary, declarations, partners, auditEvents] = await Promise.all([
    api<DashboardSummary>('/api/dashboard'),
    api<Declaration[]>('/api/declarations'),
    api<PartnerSync[]>('/api/partners'),
    api<AuditEvent[]>('/api/audit-events'),
  ])
  return { summary, declarations, partners, auditEvents }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatRole(role: Role) {
  return role.replaceAll('_', ' ').toLowerCase()
}

function viewTitle(view: View) {
  const titles: Record<View, string> = {
    dashboard: 'Operations dashboard',
    declarations: 'Declaration workspace',
    partners: 'Partner operations',
    audit: 'Audit timeline',
  }
  return titles[view]
}

export default App
