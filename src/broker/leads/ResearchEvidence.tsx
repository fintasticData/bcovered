// What Russ found about one business, and where: the pages showing its email, location and activity, every run that
// matched it (per cover type) and what remains unknown. Nothing here is inferred.
import { Link } from 'react-router-dom'
import { ExternalLink, HelpCircle, Mail } from 'lucide-react'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { formatDateTime } from '@/lib/utils'
import type { LeadDetail } from '@/server/api'
import { SampleDataBadge } from './LeadRunViews'

const hostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function EvidenceLink({ label, url, quote }: { label: string; url?: string; quote?: string | null }) {
  if (!url) return null
  return (
    <li className="rounded-lg border border-navy-800/10 p-2.5">
      <p className="text-[11px] font-semibold text-navy-500 uppercase">{label}</p>
      <a href={url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {hostLabel(url)}
      </a>
      {quote && <p className="mt-1 text-xs text-navy-700 italic">“{quote}”</p>}
    </li>
  )
}

export function ResearchEvidence({ data }: { data: LeadDetail }) {
  const p = data.prospect
  if (!p) return null
  const current = data.matches.find((m) => m.lead_id === data.lead.id) ?? data.matches[0]
  const research = (current?.evidence.research ?? p.research ?? {}) as Record<string, string | null>
  const unknown = [
    ['Assets and sums insured', research.assets],
    ['Current insurance', research.current_insurance],
    ['Purchasing intent', research.purchasing_intent],
  ] as const
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-navy-900">Research and evidence</h2>
        <span className="flex items-center gap-1.5">
          {p.is_sample && <SampleDataBadge />}
          {p.status !== 'active' && <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold text-navy-700 uppercase">{humanise(p.status)}</span>}
        </span>
      </div>
      <p className="text-[11px] text-navy-500">Found by Russ from public pages. Outreach is left to you.</p>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[11px] text-navy-500">Published email</dt>
          <dd>
            <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 font-medium text-navy-900 hover:underline">
              <Mail className="h-3.5 w-3.5" aria-hidden /> {p.email}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-navy-500">Area</dt>
          <dd className="font-medium text-navy-900">{p.area}</dd>
        </div>
        {p.address && (
          <div className="sm:col-span-2">
            <dt className="text-[11px] text-navy-500">Published address</dt>
            <dd className="text-navy-900">{p.address}</dd>
          </div>
        )}
        <div>
          <dt className="text-[11px] text-navy-500">Business function (observed)</dt>
          <dd className="text-navy-900">{p.business_function ?? '–'}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-navy-500">Category · industry</dt>
          <dd className="text-navy-900">{[p.category, p.industry].filter(Boolean).join(' · ') || '–'}</dd>
        </div>
        {p.website && (
          <div>
            <dt className="text-[11px] text-navy-500">Website</dt>
            <dd>
              <a href={p.website} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                {hostLabel(p.website)}
              </a>
            </dd>
          </div>
        )}
        {p.phone && (
          <div>
            <dt className="text-[11px] text-navy-500">Published phone</dt>
            <dd className="text-navy-900">{p.phone}</dd>
          </div>
        )}
      </dl>

      {current && (
        <div className="mt-4 rounded-xl bg-business-50/60 p-3">
          <p className="text-xs font-semibold text-navy-800">Why {current.cover_type.toLowerCase()} fits</p>
          <p className="mt-0.5 text-sm text-navy-800">{current.cover_fit}</p>
        </div>
      )}

      {current && (
        <>
          <h3 className="mt-4 text-xs font-semibold text-navy-700">Evidence pages · retrieved {formatDateTime(current.evidence.retrieved_at ?? current.retrieved_at)}</h3>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <EvidenceLink label="Shows the email" url={current.evidence.email_source_url} />
            <EvidenceLink label="Shows the location" url={current.evidence.location_source_url} quote={research.location_quote} />
            <EvidenceLink label="Shows the activity" url={current.evidence.activity_source_url} quote={current.evidence.activity_quote ?? research.observed_activity} />
          </ul>
          {current.evidence.location_basis === 'area_named' && (
            <p className="mt-1.5 text-[11px] text-navy-500">Location basis: the page names the requested area; distance was not measured.</p>
          )}
        </>
      )}

      <h3 className="mt-4 text-xs font-semibold text-navy-700">Not known from public sources</h3>
      <ul className="mt-1 space-y-1 text-xs text-navy-700">
        {unknown.map(([label, v]) => (
          <li key={label} className="flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-navy-400" aria-hidden /> {label}: {v && v !== 'unknown' ? v : 'unknown'}
          </li>
        ))}
      </ul>

      {data.matches.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold text-navy-700">Lead searches that found this business</h3>
          <ul className="mt-1.5 space-y-1.5">
            {data.matches.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy-800/10 px-2.5 py-1.5 text-xs">
                <span className="min-w-0">
                  <Link to={`/broker/leads?run=${m.job_id}`} className="font-medium text-brand-700 hover:underline">
                    {m.run_title}
                  </Link>
                  <span className="text-navy-600"> · {m.cover_type} · {formatDateTime(m.created_at)}</span>
                </span>
                {m.lead_id && m.lead_id !== data.lead.id ? (
                  <Link to={`/broker/leads/${m.lead_id}`} className="font-semibold text-brand-700 hover:underline">
                    Open {m.cover_type} lead
                  </Link>
                ) : (
                  m.lead_status && <StatusBadge status={m.lead_status} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
