import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import HostScreen from './components/HostScreen'
import JoinScreen from './components/JoinScreen'
import ProtectedRoute from './components/ProtectedRoute'
import './App.css'
import LoginPage from './login/Login'
import Dashboard from './components/Dashboard/dashboard'
import  JoinSession from './components/Dashboard/JoinSession'
import UserWaitingRoom from './components/Dashboard/waiting-room'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/join" element={<JoinScreen />} />
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={['host']}>
                <HostScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['host']}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/user-dashboard"
            element={
              <ProtectedRoute allowedRoles={['player']}>
                <JoinSession />
              </ProtectedRoute>
            }
          />
          <Route path="/waiting-room"
            element={
              <ProtectedRoute allowedRoles={['player']}>
                <UserWaitingRoom />
              </ProtectedRoute>
            }
          />
        </Routes>
        
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
