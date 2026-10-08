import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ColorSchemeProvider } from '../../contexts/ColorSchemeContext'
import LoginScreen from './LoginScreen'

const login = vi.fn()
const navigate = vi.fn()
const bootstrapStatus = vi.fn()
const bootstrapCreate = vi.fn()

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ login }),
}))

// stubbed so the hydrate effect resolves deterministically in jsdom
vi.mock('../../services/api', () => ({
  configApi: {
    getTheme: () => Promise.resolve({ data: { theme: 'dark' } }),
    setTheme: () => Promise.resolve({ data: {} }),
  },
  // unmocked, this throws inside the mount effect and fails every test here
  bootstrapApi: {
    status: () => bootstrapStatus(),
    create: (...args: unknown[]) => bootstrapCreate(...args),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

function renderLogin() {
  return render(
    <ColorSchemeProvider>
      <MemoryRouter initialEntries={['/login']}>
        <LoginScreen />
      </MemoryRouter>
    </ColorSchemeProvider>,
  )
}

beforeEach(() => {
  login.mockReset()
  navigate.mockReset()
  bootstrapStatus.mockReset()
  bootstrapStatus.mockResolvedValue({ data: { required: false } })
  bootstrapCreate.mockReset()
  bootstrapCreate.mockResolvedValue({ data: {} })
})

function fillCredentials() {
  fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'admin' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'admin123' } })
}

function submitSignIn() {
  fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
}

describe('LoginScreen', () => {
  it('renders the credential form and brand panel', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Username or email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('signs in and routes into the console', async () => {
    login.mockResolvedValueOnce(undefined)
    renderLogin()
    fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'admin123' } })
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    await waitFor(() => expect(login).toHaveBeenCalledWith('admin', 'admin123', undefined))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'))
  })

  it('reveals the MFA step when the backend requires it', async () => {
    login.mockRejectedValueOnce(new Error('MFA_REQUIRED'))
    renderLogin()
    fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'admin123' } })
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /two-factor/i })).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Authentication code')).toBeInTheDocument()
  })

  it('shows the unreachable message on a network error, not the credentials one', async () => {
    login.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))
    renderLogin()
    fillCredentials()
    submitSignIn()
    await waitFor(() =>
      expect(
        screen.getByText("Can't reach the Vigil API. Is the backend running?"),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByText(/check your credentials/i)).not.toBeInTheDocument()
  })

  it.each([500, 502, 503])(
    'shows the unreachable message on a %i with no detail',
    async (status) => {
      login.mockRejectedValueOnce({ response: { status, data: {} } })
      renderLogin()
      fillCredentials()
      submitSignIn()
      await waitFor(() =>
        expect(
          screen.getByText("Can't reach the Vigil API. Is the backend running?"),
        ).toBeInTheDocument(),
      )
      expect(screen.queryByText(/check your credentials/i)).not.toBeInTheDocument()
    },
  )

  it('still shows the credentials message on a 401', async () => {
    login.mockRejectedValueOnce({ response: { status: 401, data: {} } })
    renderLogin()
    fillCredentials()
    submitSignIn()
    await waitFor(() =>
      expect(screen.getByText('Sign in failed. Check your credentials.')).toBeInTheDocument(),
    )
  })

  it('shows the server detail on a 401 when one is sent', async () => {
    login.mockRejectedValueOnce({
      response: { status: 401, data: { detail: 'Account is locked.' } },
    })
    renderLogin()
    fillCredentials()
    submitSignIn()
    await waitFor(() => expect(screen.getByText('Account is locked.')).toBeInTheDocument())
  })

  it('shows the server detail on a 5xx when one is sent', async () => {
    login.mockRejectedValueOnce({
      response: { status: 500, data: { detail: 'Database unavailable.' } },
    })
    renderLogin()
    fillCredentials()
    submitSignIn()
    await waitFor(() => expect(screen.getByText('Database unavailable.')).toBeInTheDocument())
    expect(screen.queryByText(/can't reach the vigil api/i)).not.toBeInTheDocument()
  })

  it('shows the unreachable message when first-account creation cannot reach the API', async () => {
    bootstrapStatus.mockResolvedValue({ data: { required: true } })
    bootstrapCreate.mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }),
    )
    renderLogin()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument(),
    )
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@company.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'admin12345678' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(
        screen.getByText("Can't reach the Vigil API. Is the backend running?"),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByText('Could not create your account.')).not.toBeInTheDocument()
  })

  it('toggles between light and dark mode', async () => {
    const { container } = renderLogin()
    const root = container.querySelector('.auth-root') as HTMLElement
    await waitFor(() => expect(root.getAttribute('data-theme')).toBe('dark'))
    expect(root).toHaveClass('vg-dark')
    fireEvent.click(screen.getByRole('button', { name: /switch to light mode/i }))
    await waitFor(() => expect(root.getAttribute('data-theme')).toBe('light'))
    expect(root).toHaveClass('vg-light')
  })
})
