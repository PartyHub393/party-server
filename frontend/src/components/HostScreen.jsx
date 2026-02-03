import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { createRoom as createRoomApi } from '../api'
import { useSocket } from '../useSocket'
import './HostScreen.css'

export default function HostScreen() {
  const [roomCode, setRoomCode] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { socket, connected } = useSocket()

  useEffect(() => {
    if (!socket || !roomCode) return
    socket.emit('host_room', roomCode)
    socket.once('host_joined', ({ players: initialPlayers }) => {
      setPlayers(initialPlayers || [])
    })
    socket.on('host_error', ({ message }) => setError(message))
    socket.on('player_joined', ({ players: nextPlayers }) => {
      setPlayers(nextPlayers || [])
    })
    return () => {
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
    setRoomCode(null)
    setPlayers([])
    setError(null)
  }

  return (
    <div className="host-screen">
      <h1 className="host-screen__title">PartyHub</h1>
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
            onClick={ console.log("Game started!; TODO" )}
            disabled={players.length <= 2}
            title={players.length <= 2 ? "Waiting for more players (3+ required)" : ""}
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
