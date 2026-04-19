import { describe, expect, it } from 'vitest'
import { isCsvFile, parseCsvPreview } from './csv'

describe('isCsvFile', () => {
  it('accepts csv extension case-insensitively', () => {
    expect(isCsvFile(new File(['id'], 'payments.CSV'))).toBe(true)
  })

  it('rejects non-csv files', () => {
    expect(isCsvFile(new File(['id'], 'payments.txt'))).toBe(false)
  })
})

describe('parseCsvPreview', () => {
  it('returns preview data for valid csv content', () => {
    const preview = parseCsvPreview(
      [
        'id,amount,recipient,description,payment_method,last_4_digits',
        '1,10.00,Alice,Salary,pix,1234',
        '2,20.00,Bob,Refund,card,5678',
      ].join('\n'),
    )

    expect(preview).toEqual({
      headers: [
        'id',
        'amount',
        'recipient',
        'description',
        'payment_method',
        'last_4_digits',
      ],
      rows: [
        {
          values: ['1', '10.00', 'Alice', 'Salary', 'pix', '1234'],
        },
        {
          values: ['2', '20.00', 'Bob', 'Refund', 'card', '5678'],
        },
      ],
      totalRows: 2,
    })
  })

  it('limits the preview to the first 10 rows', () => {
    const content = [
      'id,amount',
      ...Array.from({ length: 12 }, (_, index) => `${index + 1},${index + 10}`),
    ].join('\n')

    const preview = parseCsvPreview(content)

    expect(preview?.rows).toHaveLength(10)
    expect(preview?.totalRows).toBe(12)
  })

  it('returns null when there is no data row', () => {
    expect(parseCsvPreview('id,amount')).toBeNull()
    expect(parseCsvPreview('')).toBeNull()
  })
})
