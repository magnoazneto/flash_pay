import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/store'
import { setCredentials } from '@/features/auth/store/authSlice'
import { useLoginMutation } from '@/features/auth/store/authApi'
import {
  getAuthErrorMessage,
  validateLoginForm,
  type LoginFormValues,
} from '@/features/auth/utils/forms'

const initialValues: LoginFormValues = {
  email: '',
  password: '',
}

export default function LoginPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [login, { isLoading }] = useLoginMutation()
  const [values, setValues] = useState<LoginFormValues>(initialValues)
  const [errors, setErrors] = useState<Partial<LoginFormValues>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleChange = (field: keyof LoginFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSubmitError(null)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validateLoginForm(values)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    try {
      const response = await login({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      }).unwrap()

      dispatch(setCredentials(response))
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setSubmitError(getAuthErrorMessage(error, 'Nao foi possivel entrar agora.'))
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-spotlight">
        <p className="eyebrow">Semana 2</p>
        <h1>Entrar no FlashPay</h1>
        <p className="lead">
          Acesse sua conta para acompanhar lotes, pagamentos e operacoes do
          painel.
        </p>
        <div className="spotlight-note">
          <span className="note-label">Fluxo</span>
          <p>Autenticacao via RTK Query, persistencia local e protecao de rotas.</p>
        </div>
      </section>

      <section className="auth-card">
        <div className="card-header">
          <div>
            <p className="section-kicker">Login</p>
            <h2>Informe suas credenciais</h2>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={(event) => handleChange('email', event.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
            />
            {errors.email ? (
              <small
                id="login-email-error"
                className="field-error"
                role="alert"
              >
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
              onChange={(event) => handleChange('password', event.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={
                errors.password ? 'login-password-error' : undefined
              }
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

        <p className="auth-footer">
          Ainda nao tem conta? <Link to="/register">Criar cadastro</Link>
        </p>
      </section>
    </main>
  )
}
