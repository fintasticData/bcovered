import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Minus, Plus, ScanSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Mermaid = typeof import('mermaid').default

let mermaidPromise: Promise<Mermaid> | null = null

/** Mermaid is large, so it loads only when an ERD is first shown. */
function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import('mermaid').then(({ default: m }) => {
    m.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      er: { useMaxWidth: false, layoutDirection: 'TB', diagramPadding: 16 },
      themeVariables: {
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontSize: '13px',
        primaryColor: '#eef7f6',
        primaryBorderColor: '#1f7a74',
        primaryTextColor: '#0c172a',
        lineColor: '#3d5a85',
        textColor: '#0c172a',
        attributeBackgroundColorOdd: '#ffffff',
        attributeBackgroundColorEven: '#f5f7fa',
      },
    })
    return m
  })
  return mermaidPromise
}

interface Props {
  source: string
  /** Table names in the diagram, used to map a clicked entity back to its table. */
  names: string[]
  onSelect?: (table: string) => void
  label: string
}

const MIN_SCALE = 0.15

export function ErdDiagram({ source, names, onSelect, label }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const select = useRef(onSelect)
  select.current = onSelect
  const namesRef = useRef(names)
  namesRef.current = names
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)

  /** The first fit keeps text readable (at least 60%); the Fit button shows the whole diagram. */
  const fit = (w = dims?.w, floor = MIN_SCALE) => {
    const room = viewport.current ? viewport.current.clientWidth - 24 : 0
    setScale(w && room ? Math.max(floor, Math.min(1, +(room / w).toFixed(2))) : 1)
    viewport.current?.scrollTo({ top: 0, left: 0 })
  }

  useEffect(() => {
    let cancelled = false
    setState('loading')
    loadMermaid()
      .then((m) => m.render(`erd-${uid}-${Date.now()}`, source))
      .then(({ svg }) => {
        if (cancelled || !host.current) return
        host.current.innerHTML = svg
        const byLength = [...namesRef.current].sort((a, b) => b.length - a.length)
        host.current.querySelectorAll<SVGGElement>('g[id*="entity-"]').forEach((g) => {
          const name = byLength.find((n) => g.id.includes(`entity-${n}`))
          if (!name) return
          g.style.cursor = 'pointer'
          g.setAttribute('role', 'button')
          g.setAttribute('aria-label', `Open table ${name}`)
          g.addEventListener('click', () => select.current?.(name))
        })
        const drawn = host.current.querySelector('svg')
        const box = drawn?.viewBox.baseVal
        if (drawn && box?.width) {
          drawn.setAttribute('width', String(box.width))
          drawn.setAttribute('height', String(box.height))
          drawn.style.maxWidth = 'none'
          setDims({ w: box.width, h: box.height })
          fit(box.width, 0.6)
        } else {
          setDims(null)
          setScale(1)
        }
        setState('ready')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'The diagram could not be drawn.')
        setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [source, uid])

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-navy-800/10 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-navy-800/10 px-3 py-2">
        <p className="truncate text-xs font-semibold text-navy-800">{label}</p>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - 0.1).toFixed(2)))} aria-label="Zoom out">
            <Minus />
          </Button>
          <span className="w-10 text-center text-[11px] text-navy-600 tabular-nums">{Math.round(scale * 100)}%</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))} aria-label="Zoom in">
            <Plus />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => fit()} aria-label="Fit to view" title="Fit to view">
            <ScanSearch /> Fit
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setScale(1)} title="Actual size">
            100%
          </Button>
        </div>
      </div>
      <div ref={viewport} className="relative max-h-[70vh] min-h-64 overflow-auto p-3" aria-label={label} role="region">
        {state === 'loading' && (
          <div className="absolute inset-0 grid place-items-center text-xs text-navy-600">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Drawing the diagram…
            </span>
          </div>
        )}
        {state === 'error' && <p className="text-xs text-red-700">{error}</p>}
        <div className="relative" style={dims ? { width: dims.w * scale, height: dims.h * scale } : undefined}>
          <div ref={host} style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }} className={dims ? 'absolute top-0 left-0' : 'w-max'} />
        </div>
      </div>
    </div>
  )
}
