import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'

export interface LoginFormValues {
  email: string
  password: string
}

export interface RegisterFormValues extends LoginFormValues {
  name: string
  confirmPassword: string
}

type ValidationErrorMap<T extends object> = Partial<Record<keyof T, string>>

type ApiErrorPayload = {
  message?: string
  errors?: Record<string, string>
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const countUtf8Bytes = (value: string) => new TextEncoder().encode(value).length

const isFetchBaseQueryError = (
  error: unknown,
): error is FetchBaseQueryError & { data?: ApiErrorPayload } =>
  typeof error === 'object' && error !== null && 'status' in error

const buildFieldError = (message: string, fallback: string) =>
  message.trim() ? message : fallback

export const validateLoginForm = (
  values: LoginFormValues,
): ValidationErrorMap<LoginFormValues> => {
  const errors: ValidationErrorMap<LoginFormValues> = {}

  if (!emailPattern.test(values.email.trim().toLowerCase())) {
    errors.email = 'Informe um email valido.'
  }

  if (values.password.trim() === '') {
    errors.password = 'Informe sua senha.'
  } else if (countUtf8Bytes(values.password) > 72) {
    errors.password = 'A senha deve ter no maximo 72 bytes.'
  }

  return errors
}

export const validateRegisterForm = (
  values: RegisterFormValues,
): ValidationErrorMap<RegisterFormValues> => {
  const errors: ValidationErrorMap<RegisterFormValues> = {}
  const trimmedName = values.name.trim()

  if (trimmedName.length < 2 || trimmedName.length > 100) {
    errors.name = 'O nome deve ter entre 2 e 100 caracteres.'
  }

  if (!emailPattern.test(values.email.trim().toLowerCase())) {
    errors.email = 'Informe um email valido.'
  }

  if (values.password.length < 8) {
    errors.password = 'A senha deve ter pelo menos 8 caracteres.'
  } else if (countUtf8Bytes(values.password) > 72) {
    errors.password = 'A senha deve ter no maximo 72 bytes.'
  }

  if (values.confirmPassword === '') {
    errors.confirmPassword = 'Confirme sua senha.'
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'As senhas precisam ser iguais.'
  }

  return errors
}

export const getAuthErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (!isFetchBaseQueryError(error)) {
    return fallbackMessage
  }

  const payload = error.data

  if (payload?.errors) {
    const firstFieldMessage = Object.values(payload.errors)[0]

    if (firstFieldMessage) {
      return buildFieldError(firstFieldMessage, fallbackMessage)
    }
  }

  if (payload?.message) {
    return buildFieldError(payload.message, fallbackMessage)
  }

  return fallbackMessage
}

export const hasStatusCode = (error: unknown, statusCode: number): boolean =>
  isFetchBaseQueryError(error) && error.status === statusCode
