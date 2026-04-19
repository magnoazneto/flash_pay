export interface CsvPreviewRow {
  values: string[]
}

export interface CsvPreviewData {
  headers: string[]
  rows: CsvPreviewRow[]
  totalRows: number
}
