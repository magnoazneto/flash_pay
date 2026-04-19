import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/store'
import RegisterForm from '@/features/auth/components/RegisterForm'
import { setCredentials } from '@/features/auth/store/authSlice'
import { useRegisterMutation } from '@/features/auth/store/authApi'
import {
  getAuthErrorMessage,
  hasStatusCode,
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
      navigate('/dashboard', { replace: true })
    } catch (error) {
      if (hasStatusCode(error, 409)) {
        setErrors((current) => ({
          ...current,
          email: 'Este email ja esta em uso.',
        }))
        return
      }

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

        <RegisterForm
          errors={errors}
          isLoading={isLoading}
          submitError={submitError}
          values={values}
          onChange={handleChange}
          onSubmit={handleSubmit}
        />

        <p className="auth-footer">
          Ja possui conta? <Link to="/login">Fazer login</Link>
        </p>
      </section>
    </main>
  )
}
