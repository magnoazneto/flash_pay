import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BatchUploadCard from './BatchUploadCard'

afterEach(() => {
  cleanup()
})

const createCsvFile = (lines: string[], name = 'payments.csv') =>
  new File([lines.join('\n')], name, { type: 'text/csv' })

describe('BatchUploadCard', () => {
  it('keeps submit disabled until a valid csv file is loaded', () => {
    render(<BatchUploadCard />)

    expect(
      screen.getByRole('button', { name: 'Enviar Lote' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('shows an inline error for invalid file extension', async () => {
    render(<BatchUploadCard />)

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
    render(<BatchUploadCard />)

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
    render(<BatchUploadCard />)

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
})
