import { useEffect, useMemo, useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useSocket } from '../../useSocket'
import './PlayTrivia.css'

export default function PlayTrivia() {
    const location = useLocation()
    const { socket, roomCode, connected} = useSocket()
    const username = useMemo(() => {

        return (
        location.state?.username ||
        localStorage.getItem('dc_username') ||
        'Player'
        )
    }, [location.state])
    const [status, setStatus] = useState('Game started! Waiting for first question…')
    const [question, setQuestion] = useState(null) // { text, options: [] }
    const [selected, setSelected] = useState(null)

    useEffect(() => {
        if (!socket) return

    socket.on('new_question', (payload) => {
      setQuestion(payload)
      setSelected(null)
      setStatus('')
    })

    socket.on('trivia_feedback', ({ message }) => {
      setStatus(message || '')
    })

    return () => {
      socket.off('new_question')
      socket.off('trivia_feedback')
    }
  }, [socket])

  function submitAnswer(optionIndex) {
    if (!socket || !connected || !question) return
    setSelected(optionIndex)
    socket.emit('trivia_answer', {
      roomCode: roomCode,
      username,
      answerIndex: optionIndex,
      qid: question.qid,
    })
  }

  return (
    <div className="play-trivia-screen">
      <header className="player-trivia-header">
        <div>Room: <b>{roomCode}</b></div>
        <div>You: <b>{username}</b></div>
      </header>

      {!question ? (
        <div className="play-trivia-waiting">
          <h1>DiscoverCase</h1>
          <p>{status}</p>
          {!connected && <p>(Reconnecting…)</p>}
        </div>
      ) : (
        <div className="play-trivia__question">
          <h2 className="play-trivia__qtext">{question.question}</h2>

          <div className="play-trivia__answers">
            {question.options?.map((opt, i) => (
              <button
                key={i}
                className="play-trivia__answer"
                onClick={() => submitAnswer(i)}
                disabled={selected !== null}
              >
                {opt}
              </button>
            ))}
          </div>

          {selected !== null && (
            <p className="play-trivia__submitted">Answer submitted ✅</p>
          )}
        </div>
      )}
    </div>
  )
}