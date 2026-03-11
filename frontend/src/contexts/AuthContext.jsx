import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const storedUser = localStorage.getItem('partyhub_user')
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('partyhub_user')
      }
    }
    setLoaded(true)
  }, [])

  function login(userData) {
    setUser(userData)
    localStorage.setItem('partyhub_user', JSON.stringify(userData))
  }

  function logout() {
    setUser(null)
    localStorage.removeItem('partyhub_user')
    localStorage.removeItem('joined_group_code')
    localStorage.removeItem('dc_username')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        authLoaded: loaded,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
