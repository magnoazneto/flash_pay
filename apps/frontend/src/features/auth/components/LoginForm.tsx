import type { FormEvent } from 'react'
import type { LoginFormValues } from '../utils/forms'

type LoginFormProps = {
  errors: Partial<LoginFormValues>
  isLoading: boolean
  submitError: string | null
  values: LoginFormValues
  onChange: (field: keyof LoginFormValues, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export default function LoginForm({
  errors,
  isLoading,
  submitError,
  values,
  onChange,
  onSubmit,
}: LoginFormProps) {
  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => onChange('email', event.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'login-email-error' : undefined}
        />
        {errors.email ? (
          <small id="login-email-error" className="field-error" role="alert">
            {errors.email}
          </small>
        ) : null}
      </label>

      <label className="field">
        <span>Senha</span>
        <input
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(event) => onChange('password', event.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'login-password-error' : undefined}
        />
        {errors.password ? (
          <small
            id="login-password-error"
            className="field-error"
            role="alert"
          >
            {errors.password}
          </small>
        ) : null}
      </label>

      {submitError ? (
        <p className="submit-error" role="alert">
          {submitError}
        </p>
      ) : null}

      <button className="primary-button" type="submit" disabled={isLoading}>
        {isLoading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
