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
    const [answerRevaled, setAnswerRevaled] = useState(false);
    const [reveal_answer, setRevealAnswer] = useState(null);
    const [score, setScore] = useState(0);
    const [isPopping, setIsPopping] = useState(false);

    useEffect(() => {
        localStorage.setItem('dc_username', username)
    }, [username])

    useEffect(() => {
        if (!socket) return

    socket.on('new_question', (payload) => {
      setQuestion(payload)
      setSelected(null)
      setAnswerRevaled(false);
      setRevealAnswer(null);
      setStatus('')
    })

    socket.on('trivia_feedback', ({ message }) => {
      setStatus(message || '')
    })

    socket.on('answer_revealed', ({ correctAnswer, playerResults }) => {
      setAnswerRevaled(true);
      setRevealAnswer(correctAnswer);
      
      /*
        results[playerId]
          username: answerData.username,
          points: pointsEarned,
          correct: isCorrect,
          totalScore: currentScore + pointsEarned,
    };
      */
      setScore(playerResults[socket.id].totalScore);
      
      if(playerResults[socket.id].correct) {
        setIsPopping(true);
        setTimeout(() => setIsPopping(false), 1000);
      }
    })

    return () => {
      socket.off('new_question')
      socket.off('trivia_feedback')
      socket.off('answer_revealed')
    }
  }, [socket])

  function submitAnswer(optionIndex) {
    if (!socket || !connected || !question) return
    setSelected(optionIndex)
    socket.emit('player_trivia_answer', {
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
        <div>Score: <b className={`score-count ${isPopping ? 'score-increase' : ''}`}>{score}</b></div>
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
            {question.options?.map((opt, i) => {
              const isSelected = selected === i;
              const isCorrect = answerRevaled && opt === reveal_answer;
              const isIncorrect = answerRevaled && isSelected && opt !== reveal_answer;
              
              return(
              <button
                key={i}
                className={`play-trivia__answer ${answerRevaled ? 'revealed' : ''} ${isCorrect ? 'correct' : ''} ${isIncorrect ? 'incorrect' : ''}`}
                onClick={() => submitAnswer(i)}
                disabled={selected !== null || answerRevaled}
              >
                {opt}
              </button>
            )})}
          </div>

          {selected !== null && (
            <p className="play-trivia__submitted">Answer submitted ✅</p>
          )}
        </div>
      )}
    </div>
  )
}