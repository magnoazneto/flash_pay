import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUploadBatchMutation } from '@/features/batches/store/batchApi'
import { isCsvFile, parseCsvPreview } from '@/features/batches/utils/csv'
import type { BatchApiErrorResponse, CsvPreviewData } from '@/features/batches/types'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'

const readFileContent = async (file: File) => {
  if (typeof file.text === 'function') {
    return file.text()
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo selecionado.'))
    reader.readAsText(file)
  })
}

export default function BatchUploadCard() {
  const navigate = useNavigate()
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CsvPreviewData | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadBatch, { error: uploadError, isLoading, reset }] = useUploadBatchMutation()

  const getUploadErrorMessage = (error: unknown) => {
    const fallbackMessage = 'Nao foi possivel enviar o lote.'

    if (!error || typeof error !== 'object' || !('status' in error)) {
      return fallbackMessage
    }

    const fetchError = error as FetchBaseQueryError

    if ('error' in fetchError && typeof fetchError.error === 'string') {
      return fetchError.error
    }

    if (!fetchError.data || typeof fetchError.data !== 'object') {
      return fallbackMessage
    }

    const apiError = fetchError.data as BatchApiErrorResponse

    if (typeof apiError.error === 'string' && apiError.error.length > 0) {
      return apiError.error
    }

    if (Array.isArray(apiError.errors) && apiError.errors.length > 0) {
      const [firstError] = apiError.errors

      return `Linha ${firstError.line} (${firstError.column}): ${firstError.message}`
    }

    return fallbackMessage
  }

  const handleFile = async (file: File) => {
    reset()

    if (!isCsvFile(file)) {
      setSelectedFileName(null)
      setSelectedFile(null)
      setPreview(null)
      setValidationError('Selecione um arquivo com extensao .csv.')
      return
    }

    const content = await readFileContent(file)
    const nextPreview = parseCsvPreview(content)

    if (!nextPreview) {
      setSelectedFileName(null)
      setSelectedFile(null)
      setPreview(null)
      setValidationError('O CSV precisa ter cabecalho e pelo menos uma linha de pagamento.')
      return
    }

    setSelectedFileName(file.name)
    setSelectedFile(file)
    setPreview(nextPreview)
    setValidationError(null)
  }

  const handleSubmit = async () => {
    if (!selectedFile) {
      return
    }

    try {
      const response = await uploadBatch(selectedFile).unwrap()
      navigate(`/batches/${response.batch_id}`)
    } catch {
      // Error state is rendered from RTK Query.
    }
  }

  const errorMessage = validationError ?? (uploadError ? getUploadErrorMessage(uploadError) : null)

  return (
    <section className="status-card">
      <div className="card-header">
        <div>
          <p className="section-kicker">Lote CSV</p>
          <h2>Upload e pre-visualizacao</h2>
        </div>
      </div>

      <label
        className={`upload-dropzone${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={() => setIsDragging(true)}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={async (event) => {
          event.preventDefault()
          setIsDragging(false)

          if (isLoading) {
            return
          }

          const droppedFile = event.dataTransfer.files[0]
          if (droppedFile) {
            await handleFile(droppedFile)
          }
        }}
      >
        <input
          className="sr-only"
          type="file"
          aria-label="Selecionar arquivo CSV"
          accept=".csv,text/csv"
          disabled={isLoading}
          onChange={async (event) => {
            const nextFile = event.target.files?.[0]
            if (nextFile) {
              await handleFile(nextFile)
            }
          }}
        />
        <span className="upload-title">Arraste um CSV aqui ou clique para selecionar</span>
        <span className="upload-subtitle">
          O preview mostra as primeiras 10 linhas antes do envio.
        </span>
      </label>

      {errorMessage ? (
        <p className="submit-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {preview ? (
        <div className="upload-summary">
          <p className="upload-meta">
            <strong>Arquivo:</strong> {selectedFileName}
          </p>
          <p className="upload-meta">
            <strong>Pagamentos no arquivo:</strong> {preview.totalRows}
          </p>

          <div className="preview-table-wrapper">
            <table className="preview-table">
              <thead>
                <tr>
                  {preview.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr key={`${row.values.join('-')}-${rowIndex}`}>
                    {preview.headers.map((header, columnIndex) => (
                      <td key={`${header}-${rowIndex}`}>{row.values[columnIndex] ?? '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <button
        className="primary-button"
        type="button"
        disabled={!preview || !selectedFile || isLoading}
        onClick={() => {
          void handleSubmit()
        }}
      >
        {isLoading ? 'Enviando lote...' : 'Enviar Lote'}
      </button>
    </section>
  )
}
