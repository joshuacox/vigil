import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('../services/api', () => ({
  default: { get: apiMock.get, post: apiMock.post },
}))

const ME = {
  user_id: 'u-1',
  username: 'analyst',
  email: 'analyst@company.com',
  full_name: 'Analyst One',
  role_id: 'role-admin',
  is_active: true,
  is_verified: true,
  mfa_enabled: false,
  last_login: null,
  login_count: 1,
  permissions: {},
}

function Probe() {
  const { user, isAuthenticated, isLoading, backendUnreachable, retryLoadUser } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="unreachable">{String(backendUnreachable)}</span>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="user">{user?.username ?? ''}</span>
      <button type="button" onClick={() => void retryLoadUser()}>
        Retry
      </button>
    </div>
  )
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

function networkError() {
  // axios network failures (and timeouts) carry no response at all
  return Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
}

function httpError(status: number, data: unknown = {}) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data } })
}

beforeEach(() => {
  apiMock.get.mockReset()
  apiMock.post.mockReset()
})

describe('AuthProvider loadUser', () => {
  it('signs the user in when /auth/me answers', async () => {
    apiMock.get.mockResolvedValueOnce({ data: ME })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'))
    expect(screen.getByTestId('user')).toHaveTextContent('analyst')
    expect(screen.getByTestId('unreachable')).toHaveTextContent('false')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('treats a 401 as signed out, not unreachable', async () => {
    apiMock.get.mockRejectedValueOnce(httpError(401))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('authed')).toHaveTextContent('false')
    expect(screen.getByTestId('unreachable')).toHaveTextContent('false')
  })

  it('marks the backend unreachable on a network error instead of signed out', async () => {
    apiMock.get.mockRejectedValueOnce(networkError())
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('true'))
    expect(screen.getByTestId('authed')).toHaveTextContent('false')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('marks the backend unreachable on a timeout', async () => {
    apiMock.get.mockRejectedValueOnce(
      Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }),
    )
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('true'))
  })

  it('marks the backend unreachable on a 5xx', async () => {
    apiMock.get.mockRejectedValueOnce(httpError(500))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('true'))
    expect(screen.getByTestId('authed')).toHaveTextContent('false')
  })

  it('retry re-runs /auth/me and recovers the session', async () => {
    apiMock.get.mockRejectedValueOnce(networkError())
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('true'))

    apiMock.get.mockResolvedValueOnce({ data: ME })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'))
    expect(screen.getByTestId('unreachable')).toHaveTextContent('false')
    expect(screen.getByTestId('user')).toHaveTextContent('analyst')
    expect(apiMock.get).toHaveBeenCalledTimes(2)
    expect(apiMock.get).toHaveBeenCalledWith('/auth/me')
  })

  it('retry that meets a 401 lands on signed out, not unreachable', async () => {
    apiMock.get.mockRejectedValueOnce(networkError())
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('true'))

    apiMock.get.mockRejectedValueOnce(httpError(401))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('false'))
    expect(screen.getByTestId('authed')).toHaveTextContent('false')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })
})
