import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getHostGroups } from '../../api';
import { useSocket } from '../../useSocket';
import Navbar from '../Navbar/Navbar';
import ScavengerHostPanel from '../games/scavenger/ScavengerHostPanel';
import TriviaHostPanel from '../games/trivia/TriviaHostPanel';
import './dashboard.css';

export default function HostGames() {
  const navigate = useNavigate();
  const { user, isAuthenticated, authLoaded } = useAuth();
  const { socket, connected, setRoomCode } = useSocket();

  const [hostRoomCode, setHostRoomCode] = useState(() => {
    try {
      return window.localStorage.getItem('host_room_code');
    } catch {
      return null;
    }
  });
  const [selectedGame, setSelectedGame] = useState(null);
  const [activeHostPanel, setActiveHostPanel] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoaded) return;

    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    if (user?.role !== 'host') {
      navigate('/waiting-room', { replace: true });
      return;
    }

    const loadHostCode = async () => {
      if (hostRoomCode) return;

      try {
        const res = await getHostGroups(user.id);
        const groups = res?.groups || [];
        const code = groups[0]?.code;
        if (code) {
          setHostRoomCode(code);
          try {
            localStorage.setItem('host_room_code', code);
          } catch {
            // ignore storage failures
          }
          return;
        }
      } catch (err) {
        // handled below as fallback error
      }

      setError('No host group found. Create or join a room from Lobby first.');
    };

    loadHostCode();
  }, [authLoaded, isAuthenticated, user, navigate, hostRoomCode]);

  useEffect(() => {
    if (!connected || !hostRoomCode) return;

    setRoomCode(hostRoomCode);
    socket.emit('host_room', hostRoomCode);

    const handleHostError = ({ message }) => {
      setError(message || 'Host error');
    };

    const handleGameEnded = () => {
      setActiveHostPanel(null);
      setSelectedGame(null);
    };

    socket.on('host_error', handleHostError);
    socket.on('game_ended', handleGameEnded);

    return () => {
      socket.off('host_error', handleHostError);
      socket.off('game_ended', handleGameEnded);
    };
  }, [connected, hostRoomCode, setRoomCode, socket]);

  const startGame = () => {
    if (!selectedGame || !hostRoomCode) return;

    socket.emit('host_started', { roomCode: hostRoomCode, gameType: selectedGame });
    setActiveHostPanel(selectedGame);
  };

  const endGame = () => {
    if (!hostRoomCode) return;
    socket.emit('end_game', { roomCode: hostRoomCode });
    setActiveHostPanel(null);
    setSelectedGame(null);
  };

  return (
    <div className="dashboard-wrapper dashboard-view">
      <Navbar />
      <div className="dashboard-container">
        <div className="dashboard-bg" />

        <aside className="sidebar" style={{ height: 'fit-content' }}>
          <div className="sidebar-section" style={{ flex: '0 0 auto' }}>
            <span className="sidebar-section-title">Room code</span>
            <div className="room-code">{hostRoomCode || '-'}</div>
            {error ? <div className="status-msg error">{error}</div> : null}
          </div>
        </aside>

        <main className="main-content">
          {!activeHostPanel ? (
            <section className="row-section">
              <div className="card game-selection">
                <h2 className="card-title">Game Selection</h2>
                <div className="row-inner">
                  <div
                    className={`game-card ${selectedGame === 'trivia' ? 'selected' : ''}`}
                    onClick={() => setSelectedGame('trivia')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedGame('trivia');
                    }}
                  >
                    <div className="game-card__header trivia">
                      <h3>CWRU Trivia</h3>
                      <p>Test your knowledge about campus history and fun facts.</p>
                    </div>
                    <div className="game-card__body">
                      <ul className="game-features">
                        <li>Multiple choice questions</li>
                        <li>Learn campus facts and history</li>
                        <li>Beat your high score</li>
                      </ul>
                    </div>
                  </div>

                  <div
                    className={`game-card ${selectedGame === 'scavenger' ? 'selected' : ''}`}
                    onClick={() => setSelectedGame('scavenger')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedGame('scavenger');
                    }}
                  >
                    <div className="game-card__header scavenger">
                      <h3>Scavenger Hunt</h3>
                      <p>Explore campus and complete photo challenges with your team.</p>
                    </div>
                    <div className="game-card__body">
                      <ul className="game-features">
                        <li>Upload photos for each challenge</li>
                        <li>Earn points for your team</li>
                        <li>Compete on the leaderboard</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '18px', textAlign: 'center' }}>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={startGame}
                    disabled={!selectedGame || !hostRoomCode}
                    style={{ width: '100%', maxWidth: '300px' }}
                  >
                    Start Game
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="row-section">
              <div className="card moderation-queue">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 className="card-title" style={{ margin: 0 }}>
                    {activeHostPanel === 'scavenger' ? 'Scavenger Hunt - Host Panel' : 'CWRU Trivia - Host Controls'}
                  </h2>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ fontSize: '13px' }}
                    onClick={endGame}
                  >
                    End Session
                  </button>
                </div>

                {activeHostPanel === 'scavenger' ? (
                  <ScavengerHostPanel />
                ) : (
                  <TriviaHostPanel
                    socket={socket}
                    roomCode={hostRoomCode}
                    connected={connected}
                    onEnd={() => setActiveHostPanel(null)}
                  />
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
