import React, { useState, useEffect, useRef} from 'react';
import './Trivia.css'
import {fetchQuestion} from '../../api'
import { useSocket } from '../../useSocket'

export default function Trivia() {
    const [gameState, setGameState] = useState('selection');

    const [questionData, setQuestionData] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState(0);

    const [timeLeft, setTimeLeft] = useState(30); 
    const [answeredCount, setAnsweredCount] = useState(0);

    const [playerCount, setPlayerCount] = useState(0);

    const { socket, roomCode } = useSocket()

    const correctNumberAnswered = useRef(0);

    useEffect(() => {
        correctNumberAnswered.current = answeredCount;

        if(answeredCount >= playerCount) {
            setTimeLeft(0);
        }
    }, [answeredCount]);

    const handleStartGame = () => {
        setTimeLeft(30);
        setAnsweredCount(0);

        socket.emit('get_player_count', { roomCode: roomCode }, (response) => {
            setPlayerCount(response.count);
        });

        console.log("Starting game...");
        fetchQuestion().then(data => {
            setQuestionData(data);
            setCurrentQuestion(0);
            socket.emit('broadcast_question', { roomCode: roomCode, question: data.question, options: data.options });
        });
        setGameState('playing');
        socket.emit('host_started', { roomCode: roomCode, gameType: "trivia" });
    }

    const handleNextQuestion = () => {
        setTimeLeft(30);
        setAnsweredCount(0);

        fetchQuestion(questionData.seen).then(data => {
            setQuestionData(data);
            setCurrentQuestion(prev => prev + 1);
            socket.emit('broadcast_question', { roomCode: roomCode, question: data.question, options: data.options });
        });
    }

    useEffect(() => {
        if (!socket) return;
        
        socket.on('player_answered', () => {
            setAnsweredCount(prev => prev + 1);
        });

        return () => {
            socket.off('player_answered');
        };
    }, [socket]);

    useEffect(() => {
        if (gameState === 'playing' && timeLeft > 0) {
            const timerId = setTimeout(() => {
                setTimeLeft(timeLeft - 1);
            }, 1000);
            return () => clearTimeout(timerId);
        } else if (timeLeft === 0 && gameState === 'playing') {
            console.log("Time's up!");
        }
    }, [timeLeft, gameState]);

    if (gameState === 'playing' && questionData) {
        return (
            <div className="trivia-host-screen projector-mode">
                <div className="game-stats-header" >
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <span>Time Remaining:</span>
                        <span className="timer-display" style={{ color: timeLeft <= 5 ? 'red' : 'inherit' }}>
                            {timeLeft}s
                        </span>
                    </div>
                    <div className="answers-display">
                        Number of Players Answered: {answeredCount}/{playerCount}
                    </div>
                </div>
                <div className="question-container">
                    <h2 className="question-number">Question {currentQuestion + 1}</h2>
                    <h2 className="projected-question">{questionData.question}</h2>
                </div>

                <div className="options-grid">
                    {questionData.options.map((option, index) => {
                        const isCorrectAnswer = option === questionData.answer;
                        const showHighlight = timeLeft === 0 && isCorrectAnswer;
                        
                        return (<div key={index} className={`projected-option ${showHighlight ? 'projected-option--correct' : ''}`}>
                            <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                            <span className="option-text">{option}</span>
                        </div>)
                    })}
                </div>

                <div className="host-controls">
                    <button className="question-button" onClick={handleNextQuestion}  disabled={timeLeft > 0}>Next Question</button>
                </div>
            </div>
        );
    }

    return (
        <div className="trivia-host-screen">
            <div className="category-selection">
                <h2>Select a Category</h2>
                <div className="category-cards">
                    <button className="category-card full-width" onClick={handleStartGame}>
                        <h3>Case Trivia</h3>
                        <p>Test your knowledge of Case and it's history!</p>
                    </button>
                </div>
            </div>
        </div>
    );
}