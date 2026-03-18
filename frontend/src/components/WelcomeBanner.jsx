import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './WelcomeBanner.css'
import { useNavigate } from 'react-router-dom'

export default function WelcomeBanner({ variant = 'light' }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef(null)

  if (!user?.username) return null

  const handleMenuDropdown = () => {
    setMenuOpen((prev) => !prev)
  }

  const handleClick = () => {
    setMenuOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    const onMouseDown = (e) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target)) setMenuOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <span
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
    >
      <button
        type="button"
        className={`welcome-banner ${variant}`}
        onClick={handleMenuDropdown}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        Welcome, {user.username}
      </button>

      {menuOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            minWidth: 160,
            background: '#fff',
            border: '1px solid rgba(148,163,184,0.35)',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
            padding: 6,
            zIndex: 1000,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleClick}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: '10px 10px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      )}
    </span>
  )
}