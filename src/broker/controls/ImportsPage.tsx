import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical, Upload } from 'lucide-react'
import { useDataSources, useImports, useLoadDemoFiles, useUploadImport } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Notice, Page, RowLink, Section, Table, Td } from '../shared/ui'

export default function ImportsPage() {
  const { data, isLoading, error } = useImports()
  const { data: sources = [] } = useDataSources()
  const upload = useUploadImport()
  const demo = useLoadDemoFiles()
  const navigate = useNavigate()
  const [form, setForm] = useState({ source: '', period: '2026-10', fileName: '', content: '' })

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setForm((f) => ({ ...f, fileName: file.name, content: '' }))
    const text = await file.text()
    setForm((f) => ({ ...f, content: text }))
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    upload.mutate(
      { data_source_id: form.source, reporting_period: form.period ? `${form.period}-01` : null, file_name: form.fileName || 'pasted.csv', content: form.content },
      { onSuccess: (r) => navigate(`/broker/controls/imports/${r.batch.id}`) },
    )
  }

  return (
    <Page>
      <PageHeader
        title="Imports"
        description="Payroll files, administrator schedules, holdings and other source data. Each file is kept as received, validated against its source mapping and matched to members. The same file is never imported twice."
        actions={
          <Button size="sm" variant="outline" disabled={demo.isPending} onClick={() => demo.mutate()}>
            <FlaskConical /> Load October demo files
          </Button>
        }
      />
      {demo.error && <ErrorState message={demo.error.message} />}
      <Section title="Upload a file">
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <label>
            <span className="field-label text-xs">Data source</span>
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="field" required>
              <option value="">Choose a source</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.customer ? ` · ${s.customer}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label text-xs">Reporting period</span>
            <input type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="field" />
          </label>
          <label>
            <span className="field-label text-xs">CSV file (save Excel sheets as CSV)</span>
            <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => void onFile(e.target.files?.[0])} className="field py-1.5" />
          </label>
          <label className="md:col-span-3">
            <span className="field-label text-xs">Or paste rows copied from Excel or a CSV</span>
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={4} className="field py-2 font-mono text-xs" placeholder="Header row first" />
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-3">
            <Button type="submit" size="sm" disabled={upload.isPending || !form.source || form.content.length < 10}>
              <Upload /> Import, validate and match
            </Button>
            {upload.error && <span className="text-xs text-red-600">{upload.error.message}</span>}
          </div>
        </form>
        <div className="mt-3">
          <Notice>Native .xlsx parsing needs a backend parser and is not in this build. Uploads stay in this browser; production stores source files in a private bucket.</Notice>
        </div>
      </Section>

      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data && !data.length && <EmptyState title="No imports yet">Upload a file or load the October demo files.</EmptyState>}
      {data && data.length > 0 && (
        <div className="panel">
          <Table head={['File', 'Source', 'Period', 'Rows', 'Errors', 'Status', 'Imported']} minWidth={880}>
            {data.map((r) => (
              <tr key={r.batch.id} className="hover:bg-mist/60">
                <Td>
                  <RowLink to={`/broker/controls/imports/${r.batch.id}`}>{r.batch.file_name ?? 'Upload'}</RowLink>
                  {r.batch.is_demo_fixture && <p className="text-[11px] text-amber-700">Synthetic demo file</p>}
                </Td>
                <Td className="text-xs">
                  {r.dataset_label}
                  <p className="text-navy-500">{r.customer ?? r.source.name}</p>
                </Td>
                <Td>{r.batch.reporting_period?.slice(0, 7) ?? '–'}</Td>
                <Td>{r.batch.row_count}</Td>
                <Td className={r.batch.error_count ? 'text-red-700' : ''}>{r.batch.error_count ?? '–'}</Td>
                <Td>
                  <StatusBadge status={r.batch.status} />
                </Td>
                <Td className="text-xs">
                  {formatDateTime(r.batch.created_at)}
                  {r.uploaded_by && <p className="text-navy-500">{r.uploaded_by}</p>}
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Page>
  )
}
