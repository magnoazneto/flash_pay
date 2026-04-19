import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/hooks/store'
import { logout, selectCurrentUser } from '@/features/auth/store/authSlice'

export default function AdminPage() {
  const dispatch = useAppDispatch()
  const user = useAppSelector(selectCurrentUser)

  return (
    <main className="dashboard-shell">
      <section className="hero-panel">
        <p className="eyebrow">Administracao</p>
        <h1>Painel administrativo</h1>
        <p className="lead">
          Esta area fica disponivel apenas para usuarios com role
          <strong> admin</strong>.
        </p>
      </section>

      <section className="status-card">
        <div className="card-header">
          <div>
            <p className="section-kicker">Controle de acesso</p>
            <h2>{user?.name ?? 'Administrador'}</h2>
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => dispatch(logout())}
          >
            Sair
          </button>
        </div>

        <p className="lead compact-lead">
          Rotas administrativas agora exigem autenticacao e role valida no
          frontend.
        </p>

        <p className="auth-footer">
          <Link to="/dashboard">Voltar ao dashboard</Link>
        </p>
      </section>
    </main>
  )
}
