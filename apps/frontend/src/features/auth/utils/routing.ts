import type { Location } from 'react-router-dom'

type RedirectState = {
  from?: Pick<Location, 'pathname' | 'search' | 'hash'>
}

export const DEFAULT_AUTH_REDIRECT = '/dashboard'

export const resolvePostLoginRedirect = (state: unknown): string => {
  if (typeof state !== 'object' || state === null) {
    return DEFAULT_AUTH_REDIRECT
  }

  const redirectState = state as RedirectState

  if (!redirectState.from || typeof redirectState.from.pathname !== 'string') {
    return DEFAULT_AUTH_REDIRECT
  }

  const pathname = redirectState.from.pathname
  const search = typeof redirectState.from.search === 'string' ? redirectState.from.search : ''
  const hash = typeof redirectState.from.hash === 'string' ? redirectState.from.hash : ''

  return `${pathname}${search}${hash}`
}
