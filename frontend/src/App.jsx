import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import './App.css'
import LoginPage from './login/Login'
import Dashboard from './components/Dashboard/dashboard'
import  JoinGroup from './components/Dashboard/JoinGroup'
import UserWaitingRoom from './components/Dashboard/waiting-room'
import HostGames from './components/Dashboard/HostGames'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute allowedRoles={['host']}>
              <Dashboard />
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
        <Route path="/join-group"
          element={
            <ProtectedRoute allowedRoles={['player', 'host']}>
              <JoinGroup />
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
        <Route path="/host-games"
          element={
            <ProtectedRoute allowedRoles={['host']}>
              <HostGames />
            </ProtectedRoute>
          }
        />
      </Routes>
      
    </BrowserRouter>
  )
}

export default App
