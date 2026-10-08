import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ColorSchemeProvider } from '../contexts/ColorSchemeContext'
import ProtectedRoute from './ProtectedRoute'

vi.mock('../services/api', () => ({
  configApi: {
    getTheme: () => Promise.resolve({ data: { theme: 'dark' } }),
    setTheme: () => Promise.resolve({ data: {} }),
  },
}))

const auth = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  backendUnreachable: false,
  retryLoadUser: vi.fn(() => Promise.resolve()),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => auth,
}))

function tree() {
  return (
    <ColorSchemeProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>login-screen</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>console</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </ColorSchemeProvider>
  )
}

beforeEach(() => {
  auth.isAuthenticated = false
  auth.isLoading = false
  auth.backendUnreachable = false
  auth.retryLoadUser.mockClear()
})

describe('ProtectedRoute', () => {
  it('shows the loader while the session loads', () => {
    auth.isLoading = true
    render(tree())
    expect(screen.getByText('Loading console…')).toBeInTheDocument()
    expect(screen.queryByText('console')).not.toBeInTheDocument()
  })

  it('redirects a signed-out user to /login', () => {
    render(tree())
    expect(screen.getByText('login-screen')).toBeInTheDocument()
    expect(screen.queryByText('console')).not.toBeInTheDocument()
  })

  it('renders the children for a signed-in user', () => {
    auth.isAuthenticated = true
    render(tree())
    expect(screen.getByText('console')).toBeInTheDocument()
  })

  it('shows the unreachable state instead of /login when the backend is down', () => {
    auth.backendUnreachable = true
    render(tree())
    expect(screen.getByRole('heading', { name: /can.t reach vigil/i })).toBeInTheDocument()
    expect(
      screen.getByText("Can't reach the Vigil API. Is the backend running?"),
    ).toBeInTheDocument()
    expect(screen.queryByText('login-screen')).not.toBeInTheDocument()
    expect(screen.queryByText('console')).not.toBeInTheDocument()
  })

  it('Retry re-runs the session load and lands back on the requested page', () => {
    auth.backendUnreachable = true
    const { rerender } = render(tree())
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(auth.retryLoadUser).toHaveBeenCalledOnce()

    // the retry's /auth/me succeeded: the context flips back to signed in
    auth.backendUnreachable = false
    auth.isAuthenticated = true
    rerender(tree())
    expect(screen.getByText('console')).toBeInTheDocument()
    expect(screen.queryByText(/can.t reach vigil/i)).not.toBeInTheDocument()
  })
})
