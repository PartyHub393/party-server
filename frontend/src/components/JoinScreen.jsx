import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSocket } from '../useSocket'
import './JoinScreen.css'
export default function JoinScreen() {
  const [username, setUsername] = useState('')
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState(null)
  const [joining, setJoining] = useState(false)
  const { socket, connected, setRoomCode } = useSocket()
  const [inputCode, setInputCode] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    if (!socket) return
    socket.on('join_success', () => {
      setJoined(true)
      setJoining(false)
      setError(null)
      setRoomCode(inputCode)
    })
    socket.on('join_error', ({ message }) => {
      setError(message || 'Could not join room')
      setJoining(false)
    })
    socket.on('room_closed', ({ message }) => {
      setError(message || 'Host closed the room!')
      setJoined(false)
      setJoining(false)
    })
    socket.on('game_started', ({ roomCode, gameType } = {}) => {
      const code = (roomCode || '').toUpperCase();
      
      if (!code) return;
      console.log(gameType);
      if(gameType === "trivia"){
        navigate(`/play-trivia`)
      } else if (gameType === "scavenger"){
        navigate('/scavengerplay/')
      }
    })

    return () => {
      socket.off('join_success')
      socket.off('join_error')  
      socket.off('room_closed')
    }
  }, [socket])

  function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const code = inputCode.trim().toUpperCase()
    const name = username.trim() || 'Player'
    if (!code || code.length !== 6) {
      setError('Enter a 6-letter room code')
      return
    }
    if (!socket) {
      setError('Not connected. Please wait and try again.')
      return
    }
    setJoining(true)
    socket.emit('join_room', { roomCode: code, username: name })
  }

  if (joined) {
    return (
      <div className="join-screen">
        <h1 className="join-screen__title">DiscoverCase</h1>
        <div className="join-screen__success">
          <p className="join-screen__success-title">You're in!</p>
          <p className="join-screen__success-text">
            Wait for the host to start the game. Your name will appear on their
            screen.
          </p>
          <Link to="/join" className="join-screen__link" onClick={() => setJoined(false)}>
            Join a different room
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="join-screen">
      <h1 className="join-screen__title">DiscoverCase</h1>
      <p className="join-screen__subtitle">Join a room</p>

      {!connected && (
        <p className="join-screen__status join-screen__status--warn">
          Connecting…
        </p>
      )}

      <form className="join-screen__form" onSubmit={handleSubmit}>
        {error && (
          <p className="join-screen__error" role="alert">
            {error}
          </p>
        )}
        <label className="join-screen__label">
          Room code
          <input
            type="text"
            className="join-screen__input"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABCDEF"
            maxLength={6}
            autoComplete="off"
            disabled={joining}
          />
        </label>
        <label className="join-screen__label">
          Your name
          <input
            type="text"
            className="join-screen__input"
            value={username}
            onChange={(e) => setUsername(e.target.value.slice(0, 20))}
            placeholder="Player"
            maxLength={20}
            autoComplete="username"
            disabled={joining}
          />
        </label>
        <button
          type="submit"
          className="join-screen__submit"
          disabled={!connected || joining}
        >
          {joining ? 'Joining…' : 'Join room'}
        </button>
      </form>

      <Link to="/" className="join-screen__link">
        Host a game instead
      </Link>
    </div>
  )
}
