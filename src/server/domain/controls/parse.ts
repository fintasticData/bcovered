// CSV and Excel-copy (tab-separated) parsing. Native .xlsx files need a parser library on the backend; until then Excel
// files are saved as CSV or pasted from the sheet.

export interface ParsedFile {
  headers: string[]
  rows: Array<Record<string, string>>
  delimiter: ',' | ';' | '\t'
}

function detectDelimiter(firstLine: string): ParsedFile['delimiter'] {
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<ParsedFile['delimiter'], number>
  let quoted = false
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch in counts) counts[ch as ParsedFile['delimiter']]++
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as ParsedFile['delimiter']) ?? ','
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

export function parseDelimited(text: string): ParsedFile {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (!lines.length) return { headers: [], rows: [], delimiter: ',' }
  const delimiter = detectDelimiter(lines[0])
  const headers = splitLine(lines[0], delimiter)
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line, delimiter)
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']))
  })
  return { headers, rows, delimiter }
}

/** Renames source columns to target fields using a data source's mapping. Missing columns come back empty. */
export function applyMapping(row: Record<string, string>, mapping: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mapping).map(([target, source]) => [target, row[source] ?? '']))
}

export function missingColumns(headers: string[], mapping: Record<string, string>): string[] {
  return Object.values(mapping).filter((h) => !headers.includes(h))
}

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const cell = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n')
}
