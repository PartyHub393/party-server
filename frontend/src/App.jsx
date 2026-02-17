import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import HostScreen from './components/HostScreen'
import JoinScreen from './components/JoinScreen'
import ProtectedRoute from './components/ProtectedRoute'
import './App.css'
import LoginPage from './login/Login'
import GameSelection from './components/GameSelection'
import Trivia from './components/games/Trivia' // Trivia game component

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
              <ProtectedRoute>
                <HostScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/games"
            element={
              <ProtectedRoute>
                <GameSelection />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trivia" // Trivia game route
            element={
              <ProtectedRoute>
                <Trivia />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
