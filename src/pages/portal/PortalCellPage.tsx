import { usePortalCell } from '@/api/hooks'
import { LoadingState } from '@/broker/PageHeader'
import { CellBody } from '@/broker/specialist/CellsPage'

export default function PortalCellPage() {
  const { data, isLoading, error } = usePortalCell()
  return (
    <div className="container-x space-y-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Cell captive performance</h1>
        <p className="mt-1 max-w-2xl text-sm text-navy-600">Results for your cell only, calculated from the insurer’s reported accounts and the terms of your cell agreement. Other cells are never visible here.</p>
      </div>
      {isLoading && <LoadingState />}
      {error && <p className="text-sm text-red-700">{error.message}</p>}
      {data?.map((c) => (
        <section key={c.cell.id} className="space-y-3">
          <h2 className="text-lg font-semibold text-navy-900">{c.cell.name}</h2>
          <CellBody data={c} />
        </section>
      ))}
    </div>
  )
}
