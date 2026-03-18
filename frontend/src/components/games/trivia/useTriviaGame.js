import { useEffect, useMemo, useRef, useState } from 'react'
import { useSocket } from '../../../useSocket'
import { fetchQuestion } from '../../../api'

export default function useTriviaGame({ username: initialUsername } = {}) {
  const { socket, roomCode, connected } = useSocket()
  const username = useMemo(() => {
    return (
      initialUsername ||
      localStorage.getItem('dc_username') ||
      'Player'
    )
  }, [initialUsername])

  const [status, setStatus] = useState('Game started! Waiting for first question…')
  const [question, setQuestion] = useState(null)
  const [selected, setSelected] = useState(null)
  const [answerRevealed, setAnswerRevealed] = useState(false)
  const [revealAnswer, setRevealAnswer] = useState(null)
  const [score, setScore] = useState(0)
  const [isPopping, setIsPopping] = useState(false)
  const [playerCount, setPlayerCount] = useState(0)
  const [timeLeft, setTimeLeft] = useState(30)

  const correctNumberAnswered = useRef(0)

  useEffect(() => {
    localStorage.setItem('dc_username', username)
  }, [username])

  useEffect(() => {
    correctNumberAnswered.current = selected !== null ? correctNumberAnswered.current : 0
  }, [selected, playerCount])

  useEffect(() => {
    if (!socket) return

    const handleNewQuestion = (payload) => {
      setQuestion(payload)
      setSelected(null)
      setAnswerRevealed(false)
      setRevealAnswer(null)
      setTimeLeft(payload.timeLimit ?? 30)
      setStatus('')
    }

    const handleTriviaFeedback = ({ message }) => {
      setStatus(message || '')
    }

    const handleTriviaEnded = () => {
      // waiting-room.jsx handles clearing the game slot via its own trivia_ended listener
    }

    const handleAnswerRevealed = ({ correctAnswer, playerResults }) => {
      setAnswerRevealed(true)
      setRevealAnswer(correctAnswer)

      const self = playerResults?.[socket.id]
      if (self) {
        setScore(self.totalScore)
        if (self.correct) {
          setIsPopping(true)
          setTimeout(() => setIsPopping(false), 1000)
        }
      }
    }

    const handlePlayerAnswered = () => {
      setPlayerCount((prev) => prev)
      setSelected((prevSelected) => prevSelected)
    }

    socket.on('new_question', handleNewQuestion)
    socket.on('trivia_feedback', handleTriviaFeedback)
    socket.on('answer_revealed', handleAnswerRevealed)
    socket.on('player_answered', handlePlayerAnswered)
    socket.on('trivia_ended', handleTriviaEnded)

    return () => {
      socket.off('new_question', handleNewQuestion)
      socket.off('trivia_feedback', handleTriviaFeedback)
      socket.off('answer_revealed', handleAnswerRevealed)
      socket.off('player_answered', handlePlayerAnswered)
      socket.off('trivia_ended', handleTriviaEnded)
    }
  }, [socket])

  useEffect(() => {
    if (!question || answerRevealed) return
    if (timeLeft <= 0) return
    const timerId = setTimeout(() => {
      setTimeLeft((t) => t - 1)
    }, 1000)
    return () => clearTimeout(timerId)
  }, [timeLeft, question, answerRevealed])

  const gameIsPlaying = () => {
    return !!question
  }

  const startGame = async () => {
    if (!socket || !connected || !roomCode) return

    setTimeLeft(30)
    setSelected(null)
    setAnswerRevealed(false)

    socket.emit('get_player_count', { roomCode }, (response) => {
      setPlayerCount(response.count)
    })

    const data = await fetchQuestion()
    setQuestion(data)

    socket.emit('broadcast_question', {
      roomCode,
      question: data.question,
      options: data.options,
    })

    socket.emit('host_started', { roomCode, gameType: 'trivia' })
  }

  const submitAnswer = (optionIndex) => {
    if (!socket || !connected || !question) return
    setSelected(optionIndex)

    socket.emit('player_trivia_answer', {
      roomCode,
      username,
      answerIndex: optionIndex,
      qid: question.qid,
    })
  }

  const nextQuestion = async () => {
    if (!socket || !connected || !question) return
    setTimeLeft(30)
    setSelected(null)

    const data = await fetchQuestion(question.seen)
    setQuestion(data)

    socket.emit('broadcast_question', {
      roomCode,
      question: data.question,
      options: data.options,
    })
  }

  return {
    username,
    status,
    question,
    selected,
    answerRevealed,
    revealAnswer,
    score,
    isPopping,
    timeLeft,
    playerCount,
    connected,
    setTimeLeft,
    startGame,
    submitAnswer,
    nextQuestion,
    gameIsPlaying,
  }
}
