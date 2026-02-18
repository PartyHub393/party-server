import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ScavengerHunt.css'
import ScavengerHuntGame from "./ScavengerHuntGame";

export default function ScavengerHunt() {
    const navigate = useNavigate();
    return (
        <div className="scavenger-host-screen">
            <div className="category-selection">
                <h2>Case Scavenger Hunt</h2>
                <div className="category-cards">
                    <div className="category-card" onClick={() => navigate('/scavenger-hunt/start')}>
                        <h3>Set Team Name & Start</h3>
                        <p>Explore campus, complete challenges, and compete with other teams!</p>
                    </div>
                </div>
            </div>
        </div>
    );
}