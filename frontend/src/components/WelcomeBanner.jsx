import { useAuth } from '../contexts/AuthContext'
import './WelcomeBanner.css'

export default function WelcomeBanner({ variant = 'light' }) {
  const { user } = useAuth()
  if (!user?.username) return null

  return (
    <div className={`welcome-banner ${variant}`} aria-live="polite">
      Welcome, {user.username}
    </div>
  )
}