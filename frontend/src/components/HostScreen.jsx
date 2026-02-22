import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createRoom as createRoomApi } from '../api'
import { useSocket } from '../useSocket'
import WelcomeBanner from './WelcomeBanner'
import './HostScreen.css'

export default function HostScreen() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { socket, connected, roomCode, setRoomCode} = useSocket()
  const isStartingGame = useRef(false)

  useEffect(() => {
    if (!socket || !roomCode) return
    socket.emit('host_room', roomCode)
    socket.once('host_joined', ({ players: initialPlayers }) => {
      setPlayers(initialPlayers || [])
    })
    socket.on('host_error', ({ message }) => {
      if(message == 'Room not found') {
        handleNewCode()
      } else {
        setError(message || 'Failed to host room')
      }
    })

    socket.on('player_joined', ({ players: nextPlayers }) => {
      setPlayers(nextPlayers || [])
    })

    const handleTabClose = (event) => {
      // Close the lobby
      socket.emit('host_closed')
      event.preventDefault()
      event.returnValue = '' 
    }

    window.addEventListener('beforeunload', handleTabClose)
    return () => {
      // Close the socket/connection only if the host left the page
      if (!isStartingGame.current) {
        socket.emit('host_closed')
      }

      socket.off('host_joined').off('host_error').off('player_joined')
    }
  }, [socket, roomCode])

  async function handleCreateRoom() {
    setError(null)
    setLoading(true)
    try {
      const code = await createRoomApi()
      setRoomCode(code)
    } catch (e) {
      setError('Failed to create room. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  function handleNewCode() {
    if (socket && roomCode) {
      socket.emit('host_closed');
    }

    setRoomCode(null)

    setPlayers([])
    setError(null)
  }

  const handleStartGame = () => {
    isStartingGame.current = true
    navigate('/games')
  }

  console.log(connected, roomCode);

  return (
    <div className="host-screen">
      <WelcomeBanner />
      <h1 className="host-screen__title">DiscoverCase</h1>
      <p className="host-screen__subtitle">Host</p>

      {!connected && roomCode && (
        <p className="host-screen__status host-screen__status--warn">
          Connecting…
        </p>
      )}

      {error && (
        <p className="host-screen__status host-screen__status--error">
          {error}
        </p>
      )}

      <div className="host-screen__code-section">
        {roomCode ? (
          <>
            <p className="host-screen__code-label">Room code</p>
            <p className="host-screen__code" aria-live="polite">
              {roomCode}
            </p>
          </>
        ) : (
          <p className="host-screen__code-placeholder">
            Create a room to get started
          </p>
        )}
      </div>

      <div className="host-screen__players-section">
        <p className="host-screen__players-label">Players in room</p>
        <ul className="host-screen__players-list" aria-live="polite">
          {players.length === 0 ? (
            <li className="host-screen__players-empty">
              No players yet. Share the code so others can join.
            </li>
          ) : (
            players.map((p) => (
              <li key={p.id} className="host-screen__player">
                {p.username}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="host-screen__actions">
        {roomCode && (
          <button
            type="button"
            className="host-screen__start-btn"
            onClick={handleStartGame}
            disabled={players.length < 3}
            title={players.length < 3 ? 'Waiting for more players (3+ required)' : ''}
          >
            Start Game
          </button>
        )}

        <button
          type="button"
          className="host-screen__generate-btn"
          onClick={roomCode ? handleNewCode : handleCreateRoom}
          disabled={loading}
        >
          {loading
            ? 'Creating…'
            : roomCode
              ? 'Create new room'
              : 'Create room'}
        </button>
        <Link to="/join" className="host-screen__link">
          Join as player
        </Link>
      </div>
    </div>
  )
}
