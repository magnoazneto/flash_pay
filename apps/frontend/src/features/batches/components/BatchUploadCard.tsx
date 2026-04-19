import { useState } from 'react'
import { isCsvFile, parseCsvPreview } from '@/features/batches/utils/csv'
import type { CsvPreviewData } from '@/features/batches/types'

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
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<CsvPreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = async (file: File) => {
    if (!isCsvFile(file)) {
      setSelectedFileName(null)
      setPreview(null)
      setError('Selecione um arquivo com extensao .csv.')
      return
    }

    const content = await readFileContent(file)
    const nextPreview = parseCsvPreview(content)

    if (!nextPreview) {
      setSelectedFileName(null)
      setPreview(null)
      setError('O CSV precisa ter cabecalho e pelo menos uma linha de pagamento.')
      return
    }

    setSelectedFileName(file.name)
    setPreview(nextPreview)
    setError(null)
  }

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

      {error ? (
        <p className="submit-error" role="alert">
          {error}
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

      <button className="primary-button" type="button" disabled={!preview}>
        Enviar Lote
      </button>
    </section>
  )
}
