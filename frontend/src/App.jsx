import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HostScreen from './components/HostScreen'
import JoinScreen from './components/JoinScreen'
import './App.css'
import LoginPage from './login/Login'
import GameSelection from './components/GameSelection'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path = "/games" element={<GameSelection />}/>
        <Route path="/" element={<HostScreen />} />
        <Route path="/join" element={<JoinScreen />} />
        <Route path="/login" element={<LoginPage/>}/>
      </Routes>
    </BrowserRouter>
  )
}

export default App
