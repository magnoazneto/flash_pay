import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import type { UploadBatchResponse } from '@/features/batches/types'
import { useUploadBatchMutation } from '@/features/batches/store/batchApi'
import BatchUploadCard from './BatchUploadCard'

vi.mock('@/features/batches/store/batchApi', () => ({
  useUploadBatchMutation: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const mockedUseUploadBatchMutation = vi.mocked(useUploadBatchMutation)

const createCsvFile = (lines: string[], name = 'payments.csv') =>
  new File([lines.join('\n')], name, { type: 'text/csv' })

const BatchDetailsRouteProbe = () => {
  const { id } = useParams()

  return <p>Navegado para lote {id}</p>
}

const renderBatchUploadCard = () =>
  render(
    <MemoryRouter
      initialEntries={['/dashboard']}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/dashboard" element={<BatchUploadCard />} />
        <Route path="/batches/:id" element={<BatchDetailsRouteProbe />} />
      </Routes>
    </MemoryRouter>,
  )

const createUploadTrigger = (response: Promise<UploadBatchResponse>) =>
  vi.fn(() => {
    const result = Promise.resolve({ data: undefined }) as Promise<unknown> & {
      unwrap: () => Promise<UploadBatchResponse>
    }

    result.unwrap = () => response

    return result
  })

beforeEach(() => {
  mockedUseUploadBatchMutation.mockReturnValue([
    createUploadTrigger(
      Promise.resolve({
        batch_id: 'batch-default',
        total_payments: 1,
        status: 'pending',
        created_at: '2026-04-20T10:00:00Z',
      }),
    ),
    {
      error: undefined,
      isLoading: false,
      reset: vi.fn(),
    },
  ] as unknown as ReturnType<typeof useUploadBatchMutation>)
})

describe('BatchUploadCard', () => {
  it('keeps submit disabled until a valid csv file is loaded', () => {
    renderBatchUploadCard()

    expect(
      screen.getByRole('button', { name: 'Enviar Lote' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('shows an inline error for invalid file extension', async () => {
    renderBatchUploadCard()

    const input = screen.getByLabelText('Selecionar arquivo CSV')

    fireEvent.change(input, {
      target: {
        files: [new File(['content'], 'payments.txt', { type: 'text/plain' })],
      },
    })

    expect(
      await screen.findByText('Selecione um arquivo com extensao .csv.'),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Enviar Lote' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('renders preview and payment count for a valid csv file', async () => {
    renderBatchUploadCard()

    const input = screen.getByLabelText('Selecionar arquivo CSV')

    fireEvent.change(input, {
      target: {
        files: [
          createCsvFile([
            'id,amount,recipient,description,payment_method,last_4_digits',
            '1,10.00,Alice,Salary,pix,1234',
            '2,20.00,Bob,Refund,card,5678',
          ]),
        ],
      },
    })

    await waitFor(() => {
      expect(screen.getByText('payments.csv')).toBeTruthy()
    })

    expect(
      screen.getByText((_, element) =>
        element?.textContent === 'Pagamentos no arquivo: 2',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Enviar Lote' }).hasAttribute('disabled'),
    ).toBe(false)
  })

  it('accepts drag and drop for valid csv files', async () => {
    renderBatchUploadCard()

    const dropzone = screen
      .getByText('Arraste um CSV aqui ou clique para selecionar')
      .closest('label')

    if (!dropzone) {
      throw new Error('dropzone not found')
    }

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [
          createCsvFile([
            'id,amount',
            '1,10.00',
          ], 'dragged.csv'),
        ],
      },
    })

    expect(await screen.findByText('dragged.csv')).toBeTruthy()
  })

  it('submits the selected csv and navigates to batch details on success', async () => {
    const uploadTrigger = createUploadTrigger(
      Promise.resolve({
        batch_id: 'batch-123',
        total_payments: 2,
        status: 'pending',
        created_at: '2026-04-20T10:00:00Z',
      }),
    )

    mockedUseUploadBatchMutation.mockReturnValue([
      uploadTrigger,
      {
        error: undefined,
        isLoading: false,
        reset: vi.fn(),
      },
    ] as unknown as ReturnType<typeof useUploadBatchMutation>)

    renderBatchUploadCard()

    const file = createCsvFile([
      'id,amount',
      '1,10.00',
      '2,20.00',
    ])

    fireEvent.change(screen.getByLabelText('Selecionar arquivo CSV'), {
      target: {
        files: [file],
      },
    })

    await screen.findByText('payments.csv')

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Lote' }))

    await waitFor(() => {
      expect(uploadTrigger).toHaveBeenCalledWith(file)
    })

    expect(await screen.findByText('Navegado para lote batch-123')).toBeTruthy()
  })

  it('shows a loading state while the upload is in flight', async () => {
    const view = renderBatchUploadCard()

    fireEvent.change(screen.getByLabelText('Selecionar arquivo CSV'), {
      target: {
        files: [
          createCsvFile([
            'id,amount',
            '1,10.00',
          ]),
        ],
      },
    })

    await screen.findByText('payments.csv')

    mockedUseUploadBatchMutation.mockReturnValue([
      createUploadTrigger(
        Promise.resolve({
          batch_id: 'batch-loading',
          total_payments: 1,
          status: 'pending',
          created_at: '2026-04-20T10:00:00Z',
        }),
      ),
      {
        error: undefined,
        isLoading: true,
        reset: vi.fn(),
      },
    ] as unknown as ReturnType<typeof useUploadBatchMutation>)

    view.rerender(
      <MemoryRouter
        initialEntries={['/dashboard']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/dashboard" element={<BatchUploadCard />} />
          <Route path="/batches/:id" element={<BatchDetailsRouteProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Enviando lote...' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Enviando lote...' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('shows the api error message when upload fails', async () => {
    const view = renderBatchUploadCard()

    fireEvent.change(screen.getByLabelText('Selecionar arquivo CSV'), {
      target: {
        files: [
          createCsvFile([
            'id,amount',
            '1,10.00',
          ]),
        ],
      },
    })

    await screen.findByText('payments.csv')

    mockedUseUploadBatchMutation.mockReturnValue([
      createUploadTrigger(
        Promise.resolve({
          batch_id: 'batch-error',
          total_payments: 1,
          status: 'pending',
          created_at: '2026-04-20T10:00:00Z',
        }),
      ),
      {
        error: {
          status: 422,
          data: {
            error: 'CSV inválido',
          },
        } as FetchBaseQueryError,
        isLoading: false,
        reset: vi.fn(),
      },
    ] as unknown as ReturnType<typeof useUploadBatchMutation>)

    view.rerender(
      <MemoryRouter
        initialEntries={['/dashboard']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/dashboard" element={<BatchUploadCard />} />
          <Route path="/batches/:id" element={<BatchDetailsRouteProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    const alert = await screen.findByRole('alert')

    expect(alert.textContent).toContain('CSV inválido')
  })
})
