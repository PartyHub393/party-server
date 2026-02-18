import React, { useState } from 'react';
import './Trivia.css'

export default function Trivia() {
    const [currentQuestion, setCurrentQuestion] = useState(0);

    return (
        <div className="trivia-host-screen">
            <div className="category-selection">
                <h2>Select a Category</h2>
                <div className="category-cards">
                    <div className="category-card full-width">
                        <h3>Case Trivia</h3>
                        <p>Test your knowledge of Case and it's history!</p>
                    </div>
                </div>
            </div>
        </div>
    );
}