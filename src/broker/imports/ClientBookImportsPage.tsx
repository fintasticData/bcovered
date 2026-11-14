import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, FileUp } from 'lucide-react'
import { api, type ClientBookDataset } from '@/api/client'
import { useClientBookAction, useClientBookImports } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateTime } from '@/lib/utils'
import { parseDelimited } from '@/server/domain/controls/parse'
import { downloadText } from '@/onboarding/ui'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Notice, Page, RowLink, Section, Table, Td } from '../shared/ui'

const LABEL: Record<ClientBookDataset, string> = { client_book_clients: 'Clients', client_book_policies: 'Policies' }

/** Reads CSV in the browser, or XLSX with a lazily loaded parser. The server validates everything again. */
async function readRows(file: File): Promise<{ headers: string[]; rows: Array<Record<string, string>> }> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser')
    const data = (await readSheet(file)) as unknown[][]
    const headers = (data[0] ?? []).map((h) => String(h ?? '').trim()).filter(Boolean)
    const rows = data
      .slice(1)
      .filter((r) => r.some((c) => c !== null && String(c).trim() !== ''))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] instanceof Date ? (r[i] as Date).toISOString().slice(0, 10) : String(r[i] ?? '').trim()])))
    return { headers, rows }
  }
  const parsed = parseDelimited(await file.text())
  return { headers: parsed.headers, rows: parsed.rows }
}

export default function ClientBookImportsPage() {
  const { data, isLoading, error } = useClientBookImports()
  const upload = useClientBookAction(api.clientBook.upload)
  const navigate = useNavigate()
  const [dataset, setDataset] = useState<ClientBookDataset>('client_book_clients')
  const [readError, setReadError] = useState<string | null>(null)

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Could not load imports'} /></div>

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setReadError(null)
    try {
      const { headers, rows } = await readRows(file)
      upload.mutate({ dataset, file_name: file.name, headers, rows }, { onSuccess: (v) => navigate(`/broker/imports/client-book/${v.batch.id}`) })
    } catch {
      setReadError('Could not read that file. Use CSV or XLSX with column headers in the first row.')
    }
  }
  const template = async (d: ClientBookDataset) => {
    const t = await api.clientBook.template(d)
    downloadText(t.file_name, t.csv)
  }

  return (
    <Page>
      <PageHeader title="Client-book import" description="Bring your existing clients and policies across. Upload, map, validate, review duplicates inside your brokerage, confirm, import, and correct failed rows." />
      <Notice>
        Matching only looks inside this brokerage. A client who is also with another brokerage on the platform stays a separate record. Original references and the import batch are kept on every record.
      </Notice>
      {!data.brokerage_active && <Notice tone="warning">Your brokerage is not active yet. Records are imported after activation.</Notice>}
      {data.can_import && (
        <Section
          title="New import"
          actions={
            <>
              <button type="button" className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-600 underline" onClick={() => void template('client_book_clients')}>
                <Download className="h-3.5 w-3.5" /> Clients template
              </button>
              <button type="button" className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-600 underline" onClick={() => void template('client_book_policies')}>
                <Download className="h-3.5 w-3.5" /> Policies template
              </button>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-xl bg-navy-50 p-1" role="radiogroup" aria-label="What are you importing?">
              {(Object.keys(LABEL) as ClientBookDataset[]).map((d) => (
                <button key={d} type="button" role="radio" aria-checked={dataset === d} onClick={() => setDataset(d)} className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold ${dataset === d ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600'}`}>
                  {LABEL[d]}
                </button>
              ))}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              <FileUp className="h-4 w-4" /> Upload CSV or XLSX
              <input type="file" accept=".csv,.txt,.xlsx" className="sr-only" disabled={upload.isPending} onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            <span className="text-xs text-navy-600">Import clients first; policies reference them by client reference.</span>
          </div>
          {(readError || upload.error) && <p className="mt-2 text-xs text-red-600">{readError ?? upload.error?.message}</p>}
        </Section>
      )}
      <div className="panel overflow-hidden">
        <Table head={['File', 'Type', 'Status', 'Rows', 'Imported', 'Needs attention', 'Uploaded']} minWidth={760}>
          {data.batches.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-xs text-navy-600">
                No client-book imports yet.
              </td>
            </tr>
          )}
          {data.batches.map((b) => (
            <tr key={b.id}>
              <Td>
                <RowLink to={`/broker/imports/client-book/${b.id}`}>{b.file_name ?? 'Import'}</RowLink>
              </Td>
              <Td>{LABEL[b.dataset]}</Td>
              <Td>
                <StatusBadge status={b.status} />
              </Td>
              <Td>{b.row_count}</Td>
              <Td>{b.committed}</Td>
              <Td className={b.failed ? 'text-amber-700' : ''}>{b.failed}</Td>
              <Td>{formatDateTime(b.created_at)}</Td>
            </tr>
          ))}
        </Table>
      </div>
    </Page>
  )
}
