import React from 'react'
import useTriviaGame from './useTriviaGame'
import './PlayTrivia.css'

export default function PlayTrivia() {
  const {
    username,
    status,
    question,
    selected,
    answerRevealed,
    revealAnswer,
    score,
    isPopping,
    timeLeft,
    connected,
    submitAnswer,
  } = useTriviaGame()

  return (
    <div className="play-trivia-screen">
      <header className="player-trivia-header">
        <div>Score: <b className={`score-count ${isPopping ? 'score-increase' : ''}`}>{score}</b></div>
        <div>You: <b>{username}</b></div>
        <div>Time: <b>{timeLeft}s</b></div>
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
              const isCorrect = answerRevealed && opt === revealAnswer
              const isIncorrect = answerRevealed && selected === i && opt !== revealAnswer
              return (
                <button
                  key={i}
                  className={`play-trivia__answer ${answerRevealed ? 'revealed' : ''} ${isCorrect ? 'correct' : ''} ${isIncorrect ? 'incorrect' : ''}`}
                  onClick={() => submitAnswer(i)}
                  disabled={selected !== null || answerRevealed}
                >
                  {opt}
                </button>
              )
            })}
          </div>
          {selected !== null && (
            <p className="play-trivia__submitted">Answer submitted ✅</p>
          )}
          {answerRevealed && (
            <p className="play-trivia__waiting-next">Waiting for next question…</p>
          )}
        </div>
      )}
    </div>
  )
}