import Papa from 'papaparse'
import type { AnalysisExportPayload } from '@/hooks/useAnalysisState'

interface DownloadableRow {
  readonly scope: string
  readonly section: string
  readonly tool: string
  readonly field: string
  readonly metric: string
  readonly value: string | number | boolean
}

function createTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}-${hour}${minute}${second}`
}

export function createAnalysisCsv(payload: AnalysisExportPayload): string {
  const rows: DownloadableRow[] = payload.rows.map((row) => ({
    scope: row.scope,
    section: row.section,
    tool: row.tool ?? '',
    field: row.field ?? '',
    metric: row.metric,
    value: row.value,
  }))

  return Papa.unparse(rows, {
    columns: ['scope', 'section', 'tool', 'field', 'metric', 'value'],
  })
}

export function downloadAnalysisCsv(payload: AnalysisExportPayload): void {
  const csv = createAnalysisCsv(payload)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `analysis-export-${createTimestamp()}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
