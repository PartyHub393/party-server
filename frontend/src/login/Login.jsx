import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createAccount, login as loginApi } from '../api'
import { useAuth } from '../contexts/AuthContext'
import './Login.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login: loginUser, isAuthenticated } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate])

  function switchMode() {
    setIsSignUp((prev) => !prev)
    setError('')
    setSuccess('')
    setUsername('')
    setEmail('')
    setPassword('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (isSignUp) {
        await createAccount({ username: username.trim(), email: email.trim(), password })
        setSuccess('Account created! You can log in now.')
        setPassword('')
        setEmail('')
        setUsername('')
      } else {
        const data = await loginApi({ username: username.trim(), password })
        loginUser(data.user)
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(err.message || (isSignUp ? 'Sign up failed' : 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <h1 className="login-screen__title">PartyHub</h1>
      <p className="login-screen__subtitle">
        {isSignUp ? 'Create an account' : 'Log in'}
      </p>

      <form className="login-form" onSubmit={handleSubmit}>
        {error && (
          <p className="login-form__message login-form__message--error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="login-form__message login-form__message--success">
            {success}
          </p>
        )}

        <label className="login-form__label">
          Username
          <input
            type="text"
            className="login-form__input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            required
            autoComplete={isSignUp ? 'username' : 'username'}
            disabled={loading}
          />
        </label>

        {isSignUp && (
          <label className="login-form__label">
            Email
            <input
              type="email"
              className="login-form__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              disabled={loading}
            />
          </label>
        )}

        <label className="login-form__label">
          Password
          <input
            type="password"
            className="login-form__input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSignUp ? 'Choose a password' : 'Password'}
            required
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            disabled={loading}
          />
        </label>

        <button type="submit" className="login-form__submit" disabled={loading}>
          {loading ? 'Please wait…' : isSignUp ? 'Sign up' : 'Log in'}
        </button>
      </form>

      <p className="login-screen__toggle">
        {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
        <button type="button" className="login-screen__toggle-btn" onClick={switchMode}>
          {isSignUp ? 'Log in' : 'Sign up'}
        </button>
      </p>
    </div>
  )
}
