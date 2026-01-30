import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HostScreen from './components/HostScreen'
import JoinScreen from './components/JoinScreen'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HostScreen />} />
        <Route path="/join" element={<JoinScreen />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
