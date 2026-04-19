import { describe, expect, it } from 'vitest'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import {
  getAuthErrorMessage,
  hasStatusCode,
  validateLoginForm,
  validateRegisterForm,
  type LoginFormValues,
  type RegisterFormValues,
} from './forms'

const validLoginValues: LoginFormValues = {
  email: 'operator@flashpay.test',
  password: 'strong-pass',
}

const validRegisterValues: RegisterFormValues = {
  name: 'Flash Pay Operator',
  email: 'operator@flashpay.test',
  password: 'strong-pass',
  confirmPassword: 'strong-pass',
}

describe('validateLoginForm', () => {
  it('returns no errors for valid values', () => {
    expect(validateLoginForm(validLoginValues)).toEqual({})
  })

  it('rejects invalid email', () => {
    expect(
      validateLoginForm({
        ...validLoginValues,
        email: 'invalid-email',
      }),
    ).toEqual({
      email: 'Informe um email valido.',
    })
  })

  it('requires password', () => {
    expect(
      validateLoginForm({
        ...validLoginValues,
        password: '   ',
      }),
    ).toEqual({
      password: 'Informe sua senha.',
    })
  })

  it('rejects passwords longer than 72 bytes', () => {
    expect(
      validateLoginForm({
        ...validLoginValues,
        password: 'a'.repeat(73),
      }),
    ).toEqual({
      password: 'A senha deve ter no maximo 72 bytes.',
    })
  })
})

describe('validateRegisterForm', () => {
  it('returns no errors for valid values', () => {
    expect(validateRegisterForm(validRegisterValues)).toEqual({})
  })

  it('rejects short names', () => {
    expect(
      validateRegisterForm({
        ...validRegisterValues,
        name: 'A',
      }),
    ).toEqual({
      name: 'O nome deve ter entre 2 e 100 caracteres.',
    })
  })

  it('rejects invalid email', () => {
    expect(
      validateRegisterForm({
        ...validRegisterValues,
        email: 'not-an-email',
      }),
    ).toEqual({
      email: 'Informe um email valido.',
    })
  })

  it('requires a minimum password length', () => {
    expect(
      validateRegisterForm({
        ...validRegisterValues,
        password: 'short',
        confirmPassword: 'short',
      }),
    ).toEqual({
      password: 'A senha deve ter pelo menos 8 caracteres.',
    })
  })

  it('rejects passwords longer than 72 bytes', () => {
    expect(
      validateRegisterForm({
        ...validRegisterValues,
        password: 'a'.repeat(73),
        confirmPassword: 'a'.repeat(73),
      }),
    ).toEqual({
      password: 'A senha deve ter no maximo 72 bytes.',
    })
  })

  it('requires password confirmation', () => {
    expect(
      validateRegisterForm({
        ...validRegisterValues,
        confirmPassword: '',
      }),
    ).toEqual({
      confirmPassword: 'Confirme sua senha.',
    })
  })

  it('requires matching passwords', () => {
    expect(
      validateRegisterForm({
        ...validRegisterValues,
        confirmPassword: 'different-pass',
      }),
    ).toEqual({
      confirmPassword: 'As senhas precisam ser iguais.',
    })
  })
})

describe('getAuthErrorMessage', () => {
  it('returns the first field error when present', () => {
    const error = {
      status: 400,
      data: {
        errors: {
          email: 'must be a valid email',
          password: 'must be at least 8 characters',
        },
      },
    } satisfies FetchBaseQueryError & {
      data: { errors: Record<string, string> }
    }

    expect(getAuthErrorMessage(error, 'fallback')).toBe('must be a valid email')
  })

  it('returns payload message when there are no field errors', () => {
    const error = {
      status: 401,
      data: {
        message: 'invalid credentials',
      },
    } satisfies FetchBaseQueryError & {
      data: { message: string }
    }

    expect(getAuthErrorMessage(error, 'fallback')).toBe('invalid credentials')
  })

  it('returns the fallback for unknown errors', () => {
    expect(getAuthErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
  })

  it('returns the fallback when the fetch error has no structured payload', () => {
    const error = {
      status: 500,
      data: null,
    } satisfies FetchBaseQueryError

    expect(getAuthErrorMessage(error, 'fallback')).toBe('fallback')
  })
})

describe('hasStatusCode', () => {
  it('returns true when the fetch error status matches', () => {
    const error = {
      status: 409,
      data: {
        message: 'email already exists',
      },
    } satisfies FetchBaseQueryError & {
      data: { message: string }
    }

    expect(hasStatusCode(error, 409)).toBe(true)
  })

  it('returns false when the status does not match or error is unknown', () => {
    const error = {
      status: 401,
      data: {
        message: 'invalid credentials',
      },
    } satisfies FetchBaseQueryError & {
      data: { message: string }
    }

    expect(hasStatusCode(error, 409)).toBe(false)
    expect(hasStatusCode(new Error('boom'), 409)).toBe(false)
  })
})
