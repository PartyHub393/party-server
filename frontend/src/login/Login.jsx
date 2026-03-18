import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createAccount, login as loginApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login: loginUser, isAuthenticated, authLoaded } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const isFormDisabled = loading || !authLoaded;

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/join-group', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const switchMode = () => {
    setIsSignUp((prev) => !prev);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isSignUp) {
        await createAccount({
          username: username.trim(),
          email: email.trim(),
          password,
          role: isHost ? 'host' : 'player',
        });
        setSuccess('Account created! You can log in now.');
        setIsSignUp(false);
      } else {
        const data = await loginApi({ username: username.trim(), password });
        loginUser(data.user);

        // Direct hosts to the host dashboard, other users to the join screen
        navigate('/join-group', { replace: true });
      }
    } catch (err) {
      setError(err.message || (isSignUp ? 'Sign up failed' : 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="dashboard-bg" />

      <div className="card login-card" style={{ maxWidth: '420px', width: '90%', padding: '40px' }}>
        <div className="login-header" style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', color: 'var(--primary)', marginBottom: '8px' }}>DiscoverCase</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
            {isSignUp ? 'Join the community today' : 'Welcome back, please log in'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && <div className="status-msg error">{error}</div>}
          {success && <div className="status-msg success">{success}</div>}

          <div className="input-group">
            <label className="input-label">Username</label>
            <input
              type="text"
              className="standard-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              disabled={isFormDisabled}
              required
            />
          </div>

          {isSignUp && (
            <>
              <div className="input-group">
                <label className="input-label">Email</label>
                <input
                  type="email"
                  className="standard-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={isFormDisabled}
                  required
                />
              </div>

              <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  id="role-host"
                  type="checkbox"
                  checked={isHost}
                  onChange={(e) => setIsHost(e.target.checked)}
                  disabled={isFormDisabled}
                />
                <label htmlFor="role-host" style={{ fontSize: '14px', margin: 0 }}>
                  Create account as host
                </label>
              </div>
            </>
          )}

          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              type="password"
              className="standard-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isFormDisabled}
              required
            />
          </div>

          <button type="submit" className="primary-btn" disabled={isFormDisabled} style={{ padding: '14px', marginTop: '10px' }}>
            {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={switchMode} className="text-link-btn" disabled={isFormDisabled}>
              {isSignUp ? 'Log in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}