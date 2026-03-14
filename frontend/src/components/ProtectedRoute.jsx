import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, allowedRoles, redirectTo }) {
  const { isAuthenticated, authLoaded, user } = useAuth()

  if (!authLoaded) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles?.length && !allowedRoles.includes(user?.role)) {
    const fallbackRoute = redirectTo || (user?.role === 'host' ? '/dashboard' : '/user-dashboard')
    return <Navigate to={fallbackRoute} replace />
  }

  return children
}
