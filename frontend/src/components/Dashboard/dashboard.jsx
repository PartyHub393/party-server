import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getHostGroups, setGroupLock } from '../../api';
import { useSocket } from '../../useSocket';
import './dashboard.css';
import Navbar from '../Navbar/navbar';
import ScavengerHostPanel from '../games/scavenger/ScavengerHostPanel';
import TriviaHostPanel from '../games/trivia/TriviaHostPanel';

export default function Dashboard() {
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
  const [isLocked, setIsLocked] = useState(false);
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState('');
  const [isGroupLoading, setIsGroupLoading] = useState(false);
  const [isLockSaving, setIsLockSaving] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [activeHostPanel, setActiveHostPanel] = useState(null);

  const startGame = () => {
    if (!selectedGame || !hostRoomCode) return;
    if (selectedGame === 'trivia') {
      socket.emit('host_started', { roomCode: hostRoomCode, gameType: 'trivia' });
      setActiveHostPanel('trivia');
    } else if (selectedGame === 'scavenger') {
      // Scavenger: stay on dashboard, emit start so players get game_started
      socket.emit('host_started', { roomCode: hostRoomCode, gameType: 'scavenger' });
      setActiveHostPanel('scavenger');
    }
  };

  const displayedRoomCode = hostRoomCode;
  const orientees = players;

  useEffect(() => {
    // Only redirect once auth has loaded.
    if (!authLoaded) return;

    if (!isAuthenticated || user?.role !== 'host') {
      navigate('/join', { replace: true });
      return;
    }

    // If we have a room code, make sure the socket joins it.
    if (connected && hostRoomCode) {
      setRoomCode(hostRoomCode);
      socket.emit('host_room', hostRoomCode);
    }

    const handleHostJoined = ({ players: initialPlayers }) => {
      setPlayers(initialPlayers || []);
      setError('');
    };

    const handlePlayerJoined = ({ players: nextPlayers }) => {
      setPlayers(nextPlayers || []);
    };

    const handleHostError = ({ message }) => {
      setError(message || 'Host error');
    };

    socket.once('host_joined', handleHostJoined);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('host_error', handleHostError);

    return () => {
      socket.off('host_joined', handleHostJoined);
      socket.off('player_joined', handlePlayerJoined);
      socket.off('host_error', handleHostError);
    };
  }, [socket, connected, hostRoomCode, isAuthenticated, user, navigate]);


  useEffect(() => {
    // Avoid running before auth state is resolved (otherwise we may navigate away too early)
    if (!authLoaded) return;
    if (!isAuthenticated || user?.role !== 'host') return;

    const loadHostGroups = async () => {
      setIsGroupLoading(true);
      try {
        const res = await getHostGroups(user.id);
        const groups = res?.groups || [];
        if (groups.length) {
          setIsLocked(!!groups[0]?.is_locked);
          const code = groups[0]?.code;
          if (code) {
            setHostRoomCode(code);
            try {
              window.localStorage.setItem('host_room_code', code);
            } catch {
              // ignore
            }
          }
          return;
        }

        // No groups yet: show a message and do not auto-create rooms from this dashboard.
        setError('No host groups found. Create a room from the host screen.');
      } catch (err) {
        setError(err?.message || 'Failed to load host groups');
      } finally {
        setIsGroupLoading(false);
      }
    };

    loadHostGroups();
  }, [authLoaded, isAuthenticated, user]);

  const handleLockToggle = async (nextLocked) => {
    if (!hostRoomCode || !user?.id || isLockSaving) return;

    const previous = isLocked;
    setIsLocked(nextLocked);
    setIsLockSaving(true);
    setError('');

    try {
      await setGroupLock({ groupCode: hostRoomCode, userId: user.id, isLocked: nextLocked });
    } catch (err) {
      setIsLocked(previous);
      setError(err?.message || 'Failed to update lobby lock');
    } finally {
      setIsLockSaving(false);
    }
  };

  return (
    <div className="dashboard-wrapper">
      <Navbar />
      <div className="dashboard-container">
        <div className="dashboard-bg" />

        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span className="sidebar-section-title">Group code</span>
            </div>
            <div className="room-code">{displayedRoomCode || '—'}</div>
            {error && <div className="status-msg error" style={{ marginTop: '12px' }}>{error}</div>}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span className="sidebar-section-title">Session control</span>
              <label className="lock-toggle">
                <input
                  type="checkbox"
                  checked={isLocked}
                  disabled={!hostRoomCode || isLockSaving}
                  onChange={(e) => handleLockToggle(e.target.checked)}
                />
                <span className="lock-label">{isLockSaving ? 'Saving…' : 'Lock lobby'}</span>
              </label>
            </div>

            <div className="orientees-list">
              {orientees.map((o) => {
                const online = o.online !== false;
                return (
                  <div key={o.id} className="orientees-item">
                    <img
                      className="orientees-avatar"
                      src={o.avatarUrl || `https://placehold.co/100x100/e2e8f0/475569?text=${encodeURIComponent((o.username || o.name || 'P').charAt(0).toUpperCase())}`}
                      alt={`${o.username || o.name || 'Player'} avatar`}
                    />
                    <div className="orientee-info">
                      <span className="orientees-name">{o.username || o.name || 'Player'}</span>
                      <div className="orientees-status">
                        <span className={`status-dot ${online ? '' : 'offline'}`} />
                        <span className="status-text">{online ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>
                    <button className="actions-btn" type="button">
                      •••
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        <main className="main-content">
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
                    if (e.key === 'Enter' || e.key === ' ') setSelectedGame('trivia')
                  }}
                >
                  <div className="game-card__header trivia">
                    <h3>CWRU Trivia</h3>
                    <p>Test your knowledge about campus history and fun facts.</p>
                  </div>
                  <div className="game-card__body">
                    <ul className="game-features">
                      <li>Multiple choice questions</li>
                      <li>Learn campus facts & history</li>
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
                    if (e.key === 'Enter' || e.key === ' ') setSelectedGame('scavenger')
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
                  disabled={!selectedGame}
                  style={{ width: '100%', maxWidth: '300px' }}
                >
                  Start Next Game
                </button>
              </div>
            </div>

            <div className="card group-status">
              <div className="card-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 className="card-title" style={{ margin: 0 }}>Group Management</h2>
                <div className="target-control" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <span>Target Size:</span>
                  <input 
                    type="number" 
                    defaultValue={5} 
                    style={{ width: '50px', padding: '4px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div className="group-stats-summary" style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', textAlign: 'center', marginBottom: '16px', fontSize: '14px' }}>
                <strong>{orientees.length}</strong> Orientees total
              </div>

              <div className="group-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Example Group 1: Full */}
                <div className="group-item" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Group 1</span>
                    <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '10px', background: '#dcfce7', color: '#166534', fontWeight: 700 }}>5 / 5 Full</span>
                  </div>
                  <div style={{ height: '6px', width: '100%', background: '#e2e8f0', borderRadius: '3px' }}>
                    <div style={{ height: '100%', width: '100%', background: '#16a34a', borderRadius: '3px' }}></div>
                  </div>
                </div>

                {/* Example Group 2: Partial */}
                <div className="group-item" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Group 2</span>
                    <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '10px', background: '#fef9c3', color: '#854d0e', fontWeight: 700 }}>3 / 5 Partial</span>
                  </div>
                  <div style={{ height: '6px', width: '100%', background: '#e2e8f0', borderRadius: '3px' }}>
                    <div style={{ height: '100%', width: '60%', background: '#2563eb', borderRadius: '3px' }}></div>
                  </div>
                </div>
              </div>

              <div className="group-actions" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="primary-btn" style={{ flex: 2 }}>
                  Auto-Balance
                </button>
                <button type="button" className="secondary-btn" style={{ flex: 1 }}>
                  Export
                </button>
              </div>
            </div>
          </section>

          <section className="row-section">
            <div className="card moderation-queue">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 className="card-title" style={{ margin: 0 }}>
                  {activeHostPanel === 'scavenger'
                    ? 'Scavenger Hunt — Submissions'
                    : activeHostPanel === 'trivia'
                      ? 'CWRU Trivia — Host Controls'
                      : 'Moderation Panel'}
                </h2>
                {activeHostPanel && (
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ fontSize: '13px' }}
                    onClick={() => setActiveHostPanel(null)}
                  >
                    End Session
                  </button>
                )}
              </div>

              {activeHostPanel === 'scavenger' ? (
                <ScavengerHostPanel />
              ) : activeHostPanel === 'trivia' ? (
                <TriviaHostPanel
                  socket={socket}
                  roomCode={hostRoomCode}
                  connected={connected}
                  onEnd={() => setActiveHostPanel(null)}
                />
              ) : (
                <div style={{ padding: '20px', border: '1px dashed #cbd5e1', borderRadius: '12px', color: '#64748b', textAlign: 'center' }}>
                  Select and start a game to open the live host panel.
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}