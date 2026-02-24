import React, { useState } from 'react';
import './Trivia.css'
import {fetchQuestion} from '../../api'
import { useSocket } from '../../useSocket'

export default function Trivia() {
    const [gameState, setGameState] = useState('selection');

    const [questionData, setQuestionData] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState(0);

    const { socket, roomCode } = useSocket()

    const handleStartGame = () => {
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
        fetchQuestion(questionData.seen).then(data => {
            setQuestionData(data);
            setCurrentQuestion(prev => prev + 1);
            socket.emit('broadcast_question', { roomCode: roomCode, question: data.question, options: data.options });
        });
    }

    if (gameState === 'playing' && questionData) {
        return (
            <div className="trivia-host-screen projector-mode">
                <div className="question-container">
                    <h2 className="question-number">Question {currentQuestion + 1}</h2>
                    <h2 className="projected-question">{questionData.question}</h2>
                </div>

                <div className="options-grid">
                    {questionData.options.map((option, index) => (
                        <div key={index} className="projected-option">
                            <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                            <span className="option-text">{option}</span>
                        </div>
                    ))}
                </div>

                <div className="host-controls">
                    <button className="question-button" onClick={handleNextQuestion}>Next Question</button>
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