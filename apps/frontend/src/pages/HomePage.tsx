import { useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/store'
import {
  logout,
  selectCurrentUser,
  selectIsAdmin,
  selectToken,
} from '@/features/auth/store/authSlice'

export default function HomePage() {
  const dispatch = useAppDispatch()
  const user = useAppSelector(selectCurrentUser)
  const token = useAppSelector(selectToken)
  const isAdmin = useAppSelector(selectIsAdmin)

  const tokenPreview = useMemo(() => {
    if (!token) {
      return 'Nao autenticado'
    }

    if (token.length <= 24) {
      return token
    }

    return `${token.slice(0, 16)}...${token.slice(-8)}`
  }, [token])

  return (
    <main className="dashboard-shell">
      <section className="hero-panel">
        <p className="eyebrow">FlashPay</p>
        <h1>Painel autenticado</h1>
        <p className="lead">
          Login e registro estao ligados ao backend e persistem a sessao no
          Redux com hidratacao segura.
        </p>
      </section>

      <section className="status-card">
        <div className="card-header">
          <div>
            <p className="section-kicker">Sessao atual</p>
            <h2>{user?.name ?? 'Usuario sem nome'}</h2>
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => dispatch(logout())}
          >
            Sair
          </button>
        </div>

        <dl className="details-grid">
          <div>
            <dt>Email</dt>
            <dd>{user?.email ?? '-'}</dd>
          </div>
          <div>
            <dt>Perfil</dt>
            <dd>{user?.role ?? '-'}</dd>
          </div>
          <div>
            <dt>Acesso admin</dt>
            <dd>{isAdmin ? 'Sim' : 'Nao'}</dd>
          </div>
          <div>
            <dt>Token</dt>
            <dd className="token-preview">{tokenPreview}</dd>
          </div>
        </dl>
      </section>
    </main>
  )
}
