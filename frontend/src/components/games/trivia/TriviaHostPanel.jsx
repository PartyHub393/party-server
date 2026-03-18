import React, { useEffect, useMemo, useState } from 'react';
import { fetchQuestion } from '../../../api';
import './TriviaHostPanel.css';

const TOTAL_QUESTIONS = 15;

export default function TriviaHostPanel({ socket, roomCode, connected, onEnd }) {
  const [questionData, setQuestionData] = useState(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [questionLimit, setQuestionLimit] = useState(TOTAL_QUESTIONS);
  const [timeLimit, setTimeLimit] = useState(30); //Way to set the time limit and the # of questions
  const [answeredCount, setAnsweredCount] = useState(0);
  const [playerCount, setPlayerCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const canStart = !!socket && !!roomCode && connected;

  useEffect(() => {
    if (!socket) return;

    const handlePlayerAnswered = () => {
      setAnsweredCount((prev) => prev + 1);
    };

    socket.on('player_answered', handlePlayerAnswered);
    return () => {
      socket.off('player_answered', handlePlayerAnswered);
    };
  }, [socket]);

  useEffect(() => {
    if (playerCount > 0 && answeredCount >= playerCount) {
      setTimeLeft(0);
    }
  }, [answeredCount, playerCount]);

  useEffect(() => {
    if (!questionData || timeLeft <= 0) return;
    const timerId = setTimeout(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);
    return () => clearTimeout(timerId);
  }, [timeLeft, questionData]);

  useEffect(() => {
    if (!socket || !roomCode || !questionData || timeLeft !== 0) return;
    socket.emit('reveal_answer', {
      roomCode,
      question: questionData.question,
      options: questionData.options,
      answer: questionData.answer,
    });
  }, [socket, roomCode, questionData, timeLeft]);

  const progressLabel = useMemo(() => {
    if (!questionNumber) return `0 / ${questionLimit}`;
    return `${questionNumber} / ${questionLimit}`;
  }, [questionNumber]);

  const refreshPlayerCount = () => {
    if (!socket || !roomCode) return;
    socket.emit('get_player_count', { roomCode }, (response) => {
      setPlayerCount(response?.count || 0);
    });
  };

  const broadcastQuestion = (data) => {
    if (!socket || !roomCode) return;
    socket.emit('broadcast_question', {
      roomCode,
      question: data.question,
      options: data.options,
      questionLimit,
      timeLimit,
    });
  };

  const handleStartTrivia = async () => {
    if (!canStart) return;
    setLoading(true);
    setError('');
    try {
      refreshPlayerCount();
      const data = await fetchQuestion();
      setQuestionData(data);
      setQuestionNumber(1);
      setAnsweredCount(0);
      setTimeLeft(timeLimit);
      broadcastQuestion(data);
    } catch (err) {
      setError(err?.message || 'Failed to start trivia');
    } finally {
      setLoading(false);
    }
  };

  const handleNextQuestion = async () => {
    if (!canStart || !questionData) return;

    if (questionNumber >= questionLimit) {
      socket.emit('end_trivia', { roomCode });
      onEnd?.();
      return;
    }

    setLoading(true);
    setError('');
    try {
      refreshPlayerCount();
      const data = await fetchQuestion(questionData.seen || []);
      setQuestionData(data);
      setQuestionNumber((prev) => prev + 1);
      setAnsweredCount(0);
      setTimeLeft(timeLimit);
      broadcastQuestion(data);
    } catch (err) {
      setError(err?.message || 'Failed to fetch next question');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="th-panel">
      <div className="th-panel__stats">
        <div className="th-stat">
          <span className="th-stat__val">{progressLabel}</span>
          <span className="th-stat__lbl">Question</span>
        </div>
        <div className="th-stat">
          <span className="th-stat__val">{answeredCount} / {playerCount}</span>
          <span className="th-stat__lbl">Answered</span>
        </div>
        <div className="th-stat">
          <span className="th-stat__val">{timeLeft}s</span>
          <span className="th-stat__lbl">Time left</span>
        </div>
      </div>

      {error && <p className="th-panel__error">{error}</p>}

      {!questionData ? (
        <div className="th-start">
          <h4>CWRU Trivia</h4>
          <label className="th-label">
            <span className="th-label__text">Number of Questions:</span>
          <input className="th-input" type="number" value={questionLimit} onChange={(e) => setQuestionLimit(Math.max(1,Number(e.target.value)))} />
          </label>
          <label className="th-label">
            <span className="th-label__text">Time Limit:</span>
          <input className="th-input" type="number" value={timeLimit} onChange={(e) => setTimeLimit(Math.max(5,Number(e.target.value)))} />
          </label>
          <p>Start the round when your players are ready.</p>
          <button
            type="button"
            className="th-btn th-btn--primary"
            onClick={handleStartTrivia}
            disabled={!canStart || loading}
          >
            {loading ? 'Starting…' : 'Start Trivia'}
          </button>
        </div>
      ) : (
        <div className="th-question">
          <h4 className="th-question__title">{questionData.question}</h4>

          <div className="th-options">
            {questionData.options.map((option, index) => {
              const isRevealed = timeLeft === 0;
              const isCorrect = option === questionData.answer;
              return (
                <div key={index} className={`th-option ${isRevealed && isCorrect ? 'th-option--correct' : ''}`}>
                  <span className="th-option__letter">{String.fromCharCode(65 + index)}</span>
                  <span>{option}</span>
                </div>
              );
            })}
          </div>

          <div className="th-actions">
            <button
              type="button"
              className="th-btn th-btn--primary"
              onClick={handleNextQuestion}
              disabled={loading || timeLeft > 0}
            >
              {loading ? 'Loading…' : questionNumber >= questionLimit ? 'End Trivia' : 'Next Question'}
            </button>
            <button
              type="button"
              className="th-btn th-btn--secondary"
              onClick={() => {
                socket?.emit('end_trivia', { roomCode });
                onEnd?.();
              }}
            >
              End Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
