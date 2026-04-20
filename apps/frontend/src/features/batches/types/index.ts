export interface CsvPreviewRow {
  values: string[]
}

export interface CsvPreviewData {
  headers: string[]
  rows: CsvPreviewRow[]
  totalRows: number
}

export interface UploadBatchResponse {
  batch_id: string
  total_payments: number
  status: string
  created_at: string
}

export interface BatchListQueryArgs {
  limit?: number
  offset?: number
  userId?: string
}

export type BatchStatusFilter =
  | 'all'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'completed_with_failures'

export type BatchPaymentStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'failed'

export interface BatchStatusCount {
  pending: number
  processing: number
  success: number
  failed: number
}

export interface BatchPayment {
  id: string
  recipient: string
  amount: string
  status: BatchPaymentStatus
  error_message?: string | null
  processed_at?: string | null
}

export interface BatchSummary {
  id: string
  file_name: string
  total_payments: number
  status_count: BatchStatusCount
  created_at: string
}

export interface AdminBatchSummary extends BatchSummary {
  user_id: string
}

export interface BatchDetail extends BatchSummary {
  user_id: string
  payments: BatchPayment[]
}

export interface BatchListResponse {
  batches: BatchSummary[]
  total: number
  limit: number
  offset: number
}

export interface AdminBatchListResponse {
  batches: AdminBatchSummary[]
  total: number
  limit: number
  offset: number
}

export interface BatchValidationErrorDetail {
  line: number
  column: string
  message: string
}

export interface BatchApiErrorResponse {
  error?: string
  errors?: BatchValidationErrorDetail[]
}

export interface BatchPaymentUpdatedEvent {
  type: 'payment_updated'
  batch_id: string
  payment_id: string
  status: BatchPaymentStatus
  error_message?: string | null
  sent_at: string
}

export interface BatchDoneEvent {
  type: 'batch_done'
  batch_id: string
  total_payments: number
  completed_payments: number
  sent_at: string
}

export type BatchStreamEvent = BatchPaymentUpdatedEvent | BatchDoneEvent
