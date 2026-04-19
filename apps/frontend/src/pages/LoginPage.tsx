import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/store'
import LoginForm from '@/features/auth/components/LoginForm'
import { setCredentials } from '@/features/auth/store/authSlice'
import { useLoginMutation } from '@/features/auth/store/authApi'
import {
  getAuthErrorMessage,
  validateLoginForm,
  type LoginFormValues,
} from '@/features/auth/utils/forms'
import { resolvePostLoginRedirect } from '@/features/auth/utils/routing'

const initialValues: LoginFormValues = {
  email: '',
  password: '',
}

export default function LoginPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
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
      navigate(resolvePostLoginRedirect(location.state), { replace: true })
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

        <LoginForm
          errors={errors}
          isLoading={isLoading}
          submitError={submitError}
          values={values}
          onChange={handleChange}
          onSubmit={handleSubmit}
        />

        <p className="auth-footer">
          Ainda nao tem conta? <Link to="/register">Criar cadastro</Link>
        </p>
      </section>
    </main>
  )
}
