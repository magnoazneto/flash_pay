import { describe, expect, it } from 'vitest'
import { DEFAULT_AUTH_REDIRECT, resolvePostLoginRedirect } from './routing'

describe('resolvePostLoginRedirect', () => {
  it('returns dashboard by default for unknown state', () => {
    expect(resolvePostLoginRedirect(undefined)).toBe(DEFAULT_AUTH_REDIRECT)
    expect(resolvePostLoginRedirect(null)).toBe(DEFAULT_AUTH_REDIRECT)
    expect(resolvePostLoginRedirect('invalid')).toBe(DEFAULT_AUTH_REDIRECT)
  })

  it('returns the original path when state.from is present', () => {
    expect(
      resolvePostLoginRedirect({
        from: {
          pathname: '/batches/123',
          search: '?tab=payments',
          hash: '#details',
        },
      }),
    ).toBe('/batches/123?tab=payments#details')
  })

  it('falls back when state.from has no pathname', () => {
    expect(
      resolvePostLoginRedirect({
        from: {
          search: '?tab=payments',
        },
      }),
    ).toBe(DEFAULT_AUTH_REDIRECT)
  })
})
