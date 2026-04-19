import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/store'
import { setCredentials } from '@/features/auth/store/authSlice'
import { useRegisterMutation } from '@/features/auth/store/authApi'
import {
  getAuthErrorMessage,
  validateRegisterForm,
  type RegisterFormValues,
} from '@/features/auth/utils/forms'

const initialValues: RegisterFormValues = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
}

export default function RegisterPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [register, { isLoading }] = useRegisterMutation()
  const [values, setValues] = useState<RegisterFormValues>(initialValues)
  const [errors, setErrors] = useState<Partial<RegisterFormValues>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleChange = (field: keyof RegisterFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSubmitError(null)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validateRegisterForm(values)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    try {
      const response = await register({
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      }).unwrap()

      dispatch(setCredentials(response))
      navigate('/', { replace: true })
    } catch (error) {
      setSubmitError(
        getAuthErrorMessage(error, 'Nao foi possivel concluir o cadastro.'),
      )
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-spotlight">
        <p className="eyebrow">Operador</p>
        <h1>Criar conta no FlashPay</h1>
        <p className="lead">
          O cadastro cria usuarios com perfil operador e inicia a sessao
          imediatamente apos o sucesso.
        </p>
        <div className="spotlight-note">
          <span className="note-label">Validacao</span>
          <p>Campos obrigatorios, email valido e senha alinhada ao contrato do backend.</p>
        </div>
      </section>

      <section className="auth-card">
        <div className="card-header">
          <div>
            <p className="section-kicker">Cadastro</p>
            <h2>Preencha seus dados</h2>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span>Nome</span>
            <input
              type="text"
              autoComplete="name"
              value={values.name}
              onChange={(event) => handleChange('name', event.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'register-name-error' : undefined}
            />
            {errors.name ? (
              <small id="register-name-error" className="field-error">
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
              onChange={(event) => handleChange('email', event.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={
                errors.email ? 'register-email-error' : undefined
              }
            />
            {errors.email ? (
              <small id="register-email-error" className="field-error">
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
              onChange={(event) => handleChange('password', event.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={
                errors.password ? 'register-password-error' : undefined
              }
            />
            {errors.password ? (
              <small id="register-password-error" className="field-error">
                {errors.password}
              </small>
            ) : null}
          </label>

          <label className="field">
            <span>Confirmar senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={(event) =>
                handleChange('confirmPassword', event.target.value)
              }
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={
                errors.confirmPassword
                  ? 'register-confirm-password-error'
                  : undefined
              }
            />
            {errors.confirmPassword ? (
              <small
                id="register-confirm-password-error"
                className="field-error"
              >
                {errors.confirmPassword}
              </small>
            ) : null}
          </label>

          {submitError ? <p className="submit-error">{submitError}</p> : null}

          <button className="primary-button" type="submit" disabled={isLoading}>
            {isLoading ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <p className="auth-footer">
          Ja possui conta? <Link to="/login">Fazer login</Link>
        </p>
      </section>
    </main>
  )
}
