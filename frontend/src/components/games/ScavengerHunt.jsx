import React from 'react';
import { useNavigate } from 'react-router-dom';
import './ScavengerHunt.css'
import { useSocket } from '../../useSocket';

export default function ScavengerHunt() {
    const navigate = useNavigate();
    const { socket, roomCode } = useSocket();

    const handleStart = () => {
        if (socket && roomCode) {
            socket.emit('host_started', { roomCode, gameType: 'scavenger' });
        }
        navigate('/scavenger-hunt/start');
    };

    return (
        <div className="scavenger-host-screen">
            <div className="category-selection">
                <h2>Case Scavenger Hunt</h2>
                <div className="category-cards">
                    <div className="category-card full-width" onClick={handleStart}>
                        <h3>Set Team Name & Start</h3>
                        <p>Explore campus, complete challenges, and compete with other teams!</p>
                    </div>
                </div>
            </div>
        </div>
    );
}