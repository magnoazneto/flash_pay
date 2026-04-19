import type { FormEvent } from 'react'
import type { RegisterFormValues } from '../utils/forms'

type RegisterFormProps = {
  errors: Partial<RegisterFormValues>
  isLoading: boolean
  submitError: string | null
  values: RegisterFormValues
  onChange: (field: keyof RegisterFormValues, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export default function RegisterForm({
  errors,
  isLoading,
  submitError,
  values,
  onChange,
  onSubmit,
}: RegisterFormProps) {
  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <label className="field">
        <span>Nome</span>
        <input
          type="text"
          autoComplete="name"
          maxLength={100}
          value={values.name}
          onChange={(event) => onChange('name', event.target.value)}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'register-name-error' : undefined}
        />
        {errors.name ? (
          <small id="register-name-error" className="field-error" role="alert">
            {errors.name}
          </small>
        ) : null}
      </label>

      <label className="field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => onChange('email', event.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'register-email-error' : undefined}
        />
        {errors.email ? (
          <small id="register-email-error" className="field-error" role="alert">
            {errors.email}
          </small>
        ) : null}
      </label>

      <label className="field">
        <span>Senha</span>
        <input
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(event) => onChange('password', event.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby={
            errors.password ? 'register-password-error' : undefined
          }
        />
        {errors.password ? (
          <small
            id="register-password-error"
            className="field-error"
            role="alert"
          >
            {errors.password}
          </small>
        ) : null}
      </label>

      <label className="field">
        <span>Confirmar senha</span>
        <input
          type="password"
          autoComplete="off"
          value={values.confirmPassword}
          onChange={(event) => onChange('confirmPassword', event.target.value)}
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={
            errors.confirmPassword ? 'register-confirm-password-error' : undefined
          }
        />
        {errors.confirmPassword ? (
          <small
            id="register-confirm-password-error"
            className="field-error"
            role="alert"
          >
            {errors.confirmPassword}
          </small>
        ) : null}
      </label>

      {submitError ? (
        <p className="submit-error" role="alert">
          {submitError}
        </p>
      ) : null}

      <button className="primary-button" type="submit" disabled={isLoading}>
        {isLoading ? 'Criando conta...' : 'Criar conta'}
      </button>
    </form>
  )
}
