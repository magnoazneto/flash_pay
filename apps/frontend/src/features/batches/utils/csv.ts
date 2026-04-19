import type { CsvPreviewData, CsvPreviewRow } from '../types'

const PREVIEW_LIMIT = 10

const normalizeLine = (line: string) =>
  line
    .split(',')
    .map((value) => value.trim())

export const isCsvFile = (file: File): boolean =>
  file.name.toLowerCase().endsWith('.csv')

export const parseCsvPreview = (content: string): CsvPreviewData | null => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    return null
  }

  const headers = normalizeLine(lines[0])
  const rows: CsvPreviewRow[] = lines
    .slice(1, PREVIEW_LIMIT + 1)
    .map((line) => ({ values: normalizeLine(line) }))

  return {
    headers,
    rows,
    totalRows: lines.length - 1,
  }
}
