import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Download, Pencil, ShieldCheck, Upload } from 'lucide-react'
import { api, type ClientBookRowView } from '@/api/client'
import { useClientBookAction, useClientBookImport } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { downloadText, textInput } from '@/onboarding/ui'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Filters, Notice, Page, Section, Stat, Table, Td } from '../shared/ui'

type RowFilter = 'all' | 'fix_errors' | 'needs_decision' | 'create' | 'link' | 'done' | 'failed'

const ACTION: Record<ClientBookRowView['action'], { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  create: { label: 'Will create', tone: 'info' },
  link: { label: 'Will link to existing', tone: 'info' },
  needs_decision: { label: 'Possible duplicate', tone: 'warning' },
  fix_errors: { label: 'Fix errors', tone: 'danger' },
  done: { label: 'Imported', tone: 'success' },
  skip: { label: 'Skipped', tone: 'neutral' },
}

const STEPS = ['Upload and map', 'Validate', 'Duplicates', 'Preview', 'Confirm and import', 'Summary']

export default function ClientBookImportPage() {
  const { batchId } = useParams()
  const { data: view, isLoading, error } = useClientBookImport(batchId)
  const map = useClientBookAction(api.clientBook.map)
  const correct = useClientBookAction(api.clientBook.correct)
  const resolve = useClientBookAction(api.clientBook.resolve)
  const attest = useClientBookAction(api.clientBook.attest)
  const commit = useClientBookAction(api.clientBook.commit)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<RowFilter>('all')
  const [editing, setEditing] = useState<string | null>(null)
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (view) setMapping(view.mapping)
  }, [view?.batch.id, view?.mapping])

  const rows = useMemo(
    () => (view?.rows ?? []).filter((r) => filter === 'all' || (filter === 'failed' ? r.commit_status === 'failed' : r.action === filter)),
    [view?.rows, filter],
  )
  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !view) return <div className="p-6"><ErrorState message={error?.message ?? 'Could not load the import'} /></div>

  const s = view.summary
  const mapped = view.fields.every((f) => !f.required || mapping[f.key])
  const step = view.batch.status === 'uploaded' ? 0 : s.possible_duplicates ? 2 : !view.attested ? 4 : s.committed === 0 ? 4 : 5
  const actionError = map.error?.message ?? correct.error?.message ?? resolve.error?.message ?? attest.error?.message ?? commit.error?.message
  const result = commit.data?.result
  const report = async () => {
    const r = await api.clientBook.errorReport(view.batch.id)
    downloadText(r.file_name, r.csv)
  }

  return (
    <Page wide>
      <Link to="/broker/imports/client-book" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:text-brand-600">
        <ArrowLeft className="h-3.5 w-3.5" /> Client-book imports
      </Link>
      <PageHeader
        title={view.batch.file_name ?? 'Import'}
        description={`${view.dataset === 'client_book_clients' ? 'Clients' : 'Policies'} · ${view.batch.row_count} rows · batch ${view.batch.id.slice(0, 8)}`}
        actions={
          <Button variant="outline" onClick={() => void report()}>
            <Download /> Error report
          </Button>
        }
      />
      <ol className="flex flex-wrap gap-2" aria-label="Import steps">
        {STEPS.map((label, i) => (
          <li key={label} className={cn('rounded-full px-3 py-1 text-xs font-semibold', i < step ? 'bg-emerald-50 text-emerald-800' : i === step ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-500')}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>
      {actionError && <ErrorState message={actionError} />}
      {!view.brokerage_active && <Notice tone="warning">Your brokerage is not active yet. You can map and validate now; importing opens after activation.</Notice>}
      {result && (
        <Notice>
          Import run: {result.committed} created, {result.linked} linked to existing records, {result.failed} failed. Failed rows stay here to correct and retry; rows already imported are never imported twice.
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Rows" value={s.total} />
        <Stat label="Will create" value={s.will_create} />
        <Stat label="Will link" value={s.will_link} />
        <Stat label="Possible duplicates" value={s.possible_duplicates} tone={s.possible_duplicates ? 'warning' : undefined} />
        <Stat label="Errors" value={s.errors} tone={s.errors ? 'danger' : undefined} />
        <Stat label="Imported" value={s.committed} hint={s.skipped ? `${s.skipped} skipped` : undefined} />
      </div>

      <Section title="1. Map columns" actions={<span className="text-xs text-navy-500">Suggested from your headers; change any that are wrong</span>}>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {view.fields.map((f) => (
            <label key={f.key} className="block text-xs">
              <span className="font-semibold text-navy-800">
                {f.label}
                {f.required && <span className="text-red-600"> *</span>}
              </span>
              <select className={textInput} value={mapping[f.key] ?? ''} disabled={!view.can_import} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                <option value="">Not in this file</option>
                {view.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              {f.hint && <span className="text-[11px] text-navy-500">{f.hint}</span>}
            </label>
          ))}
        </div>
        {view.can_import && (
          <Button className="mt-3" variant="accent" disabled={!mapped || map.isPending} onClick={() => map.mutate({ batch_id: view.batch.id, mapping })}>
            Apply mapping and validate
          </Button>
        )}
      </Section>

      <Section title="2–4. Validate, review duplicates and preview" actions={<Filters value={filter} onChange={setFilter} options={[
        { id: 'all', label: `All (${s.total})` },
        { id: 'fix_errors', label: `Errors (${s.errors})` },
        { id: 'needs_decision', label: `Duplicates (${s.possible_duplicates})` },
        { id: 'create', label: `Will create (${s.will_create})` },
        { id: 'link', label: `Will link (${s.will_link})` },
        { id: 'done', label: `Imported (${s.committed})` },
        { id: 'failed', label: `Failed (${s.failed})` },
      ]} />}>
        <Table head={['Row', ...view.fields.filter((f) => mapping[f.key]).map((f) => f.label), 'Outcome', '']} minWidth={980}>
          {rows.map((r) => (
            <tr key={r.id} className={cn(r.action === 'fix_errors' && 'bg-red-50/40', r.action === 'needs_decision' && 'bg-amber-50/40')}>
              <Td>{r.row_number}</Td>
              {view.fields
                .filter((f) => mapping[f.key])
                .map((f) => (
                  <Td key={f.key} className="text-xs">
                    {editing === r.id ? (
                      <input aria-label={f.label} className={textInput} value={edit[f.key] ?? r.values[f.key] ?? ''} onChange={(e) => setEdit((x) => ({ ...x, [f.key]: e.target.value }))} />
                    ) : (
                      r.values[f.key] || <span className="text-navy-300">–</span>
                    )}
                  </Td>
                ))}
              <Td className="text-xs">
                <Badge tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Badge>
                {r.commit_status === 'failed' && <span className="block text-red-700">{r.commit_error}</span>}
                {r.errors.map((e) => (
                  <span key={e} className="block text-red-700">
                    {e}
                  </span>
                ))}
                {r.match_basis && <span className="block text-navy-600">{r.match_basis}</span>}
              </Td>
              <Td className="text-right text-xs whitespace-nowrap">
                {view.can_import && r.commit_status !== 'committed' && r.commit_status !== 'skipped' && (
                  <span className="flex flex-col items-end gap-1">
                    {editing === r.id ? (
                      <>
                        <Button size="sm" variant="accent" disabled={correct.isPending} onClick={() => correct.mutate({ row_id: r.id, values: edit }, { onSuccess: () => { setEditing(null); setEdit({}) } })}>
                          Save correction
                        </Button>
                        <button type="button" className="cursor-pointer text-navy-600 underline" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button type="button" className="inline-flex cursor-pointer items-center gap-1 font-semibold text-brand-600 underline" onClick={() => { setEditing(r.id); setEdit({}) }}>
                        <Pencil className="h-3 w-3" /> Correct
                      </button>
                    )}
                    {r.action === 'needs_decision' && (
                      <>
                        <button type="button" className="cursor-pointer font-semibold text-navy-800 underline" onClick={() => resolve.mutate({ row_id: r.id, resolution: 'link' })}>
                          Link to {r.candidate?.name}
                        </button>
                        <button type="button" className="cursor-pointer font-semibold text-navy-800 underline" onClick={() => resolve.mutate({ row_id: r.id, resolution: 'create' })}>
                          Keep separate
                        </button>
                      </>
                    )}
                    <button type="button" className="cursor-pointer text-navy-500 underline" onClick={() => resolve.mutate({ row_id: r.id, resolution: 'skip' })}>
                      Skip row
                    </button>
                  </span>
                )}
                {r.commit_status === 'committed' && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" />}
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="5. Confirm and import">
        <div className="space-y-3">
          <div className="rounded-xl border border-navy-800/10 bg-mist/60 p-3 text-sm text-navy-800">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-brand-600" /> Authority to transfer
            </p>
            <p className="mt-1 text-xs">{view.transfer_statement}</p>
            {view.attested ? (
              <p className="mt-2 text-xs font-semibold text-emerald-800">Confirmed {view.batch.attested_at && new Date(view.batch.attested_at).toLocaleString('en-ZA')}</p>
            ) : (
              view.can_import && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirm this on behalf of the brokerage
                  </label>
                  <Button size="sm" variant="outline" disabled={!confirmed || attest.isPending} onClick={() => attest.mutate(view.batch.id)}>
                    Record confirmation
                  </Button>
                </div>
              )
            )}
          </div>
          {view.can_import && (
            <Button variant="accent" disabled={!view.attested || !view.brokerage_active || commit.isPending || s.will_create + s.will_link + s.failed + s.errors + s.possible_duplicates === 0} onClick={() => commit.mutate(view.batch.id)}>
              <Upload /> {s.committed ? 'Retry remaining rows' : 'Import valid rows'}
            </Button>
          )}
          <p className="text-xs text-navy-600">Valid rows import; rows with errors or undecided duplicates stay here for you to correct and retry. Download the error report to fix them in your own system.</p>
        </div>
      </Section>
    </Page>
  )
}
