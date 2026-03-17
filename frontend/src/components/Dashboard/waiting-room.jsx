import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSocket } from '../../useSocket';
import { useAuth } from '../../contexts/AuthContext';
import { getPlayerGroups } from '../../api';
import GameSlot from '../games/GameSlot';
import './waiting-room.css'

export default function UserWaitingRoom({ roomCode, orientees: initialOrientees, currentUser }) {
  const { socket, connected, setRoomCode } = useSocket();
  const { user, isAuthenticated } = useAuth();
  const [orientees, setOrientees] = useState(initialOrientees || []);
  const [validGroup, setValidGroup] = useState(false);
  const [activeGame, setActiveGame] = useState(null);
  const location = useLocation();
  const locationState = location.state || {};

  const groupCode = useMemo(() => {
    return (
      locationState.groupCode ||
      roomCode ||
      localStorage.getItem('joined_group_code') ||
      null
    );
  }, [locationState.groupCode, roomCode]);

  const member = locationState.member;

  const effectiveCurrentUser = currentUser || member || { id: 'temp-id', name: 'Spartan', avatarUrl: 'https://placehold.co/150x150/e2e8f0/475569?text=S' };
  const effectiveRoomCode = groupCode;

  const navigate = useNavigate();

  const lastJoinedRoomRef = useRef(null);

  // Verify that the user is actually a member of the group before trying to join the socket room.
  useEffect(() => {
    if (!user?.id || !effectiveRoomCode) {
      setValidGroup(false);
      return;
    }

    let canceled = false;
    const validate = async () => {
      try {
        const res = await getPlayerGroups(user.id);
        const groupCodes = (res.groups || []).map((g) => g.code);
        const isValid = groupCodes.includes(effectiveRoomCode);
        if (!canceled) {
          setValidGroup(isValid);
          if (!isValid) {
            localStorage.removeItem('joined_group_code');
            navigate('/user-dashboard', { replace: true });
          }
        }
      } catch (err) {
        // if validation fails, don't block the experience; we'll still attempt a join.
        if (!canceled) setValidGroup(true);
      }
    };

    validate();

    return () => {
      canceled = true;
    };
  }, [user?.id, effectiveRoomCode, navigate]);

  useEffect(() => {
    if (!connected || !effectiveRoomCode) return;

    const handlePlayerJoined = ({ players }) => {
      setOrientees(players || []);
    };

    const handleJoinSuccess = ({ players }) => {
      setOrientees(players || []);
    };

    const handleJoinError = ({ message }) => {
      localStorage.removeItem('joined_group_code');
      setRoomCode(null);
      navigate('/user-dashboard', {
        replace: true,
        state: { message: message || 'Unable to join room.' },
      });
    };

    const handleGameStarted = ({ gameType }) => {
      setActiveGame(gameType);
    };

    const handleGameEnded = () => {
      setActiveGame(null);
    };

    const handleForcedLeave = ({ message }) => {
      localStorage.removeItem('joined_group_code');
      setRoomCode(null);
      navigate('/user-dashboard', {
        replace: true,
        state: { message: message || 'You have been banned from the room.' },
      });
    };

    socket.on('player_joined', handlePlayerJoined);
    socket.on('join_success', handleJoinSuccess);
    socket.on('join_error', handleJoinError);
    socket.on('game_started', handleGameStarted);
    socket.on('trivia_ended', handleGameEnded);
    socket.on('kicked', handleForcedLeave);
    socket.on('banned', handleForcedLeave);

    return () => {
      socket.off('player_joined', handlePlayerJoined);
      socket.off('join_success', handleJoinSuccess);
      socket.off('join_error', handleJoinError);
      socket.off('game_started', handleGameStarted);
      socket.off('trivia_ended', handleGameEnded);
      socket.off('kicked', handleForcedLeave);
      socket.off('banned', handleForcedLeave);
    };
  }, [connected, socket, effectiveRoomCode, navigate, setRoomCode]);

  useEffect(() => {
    if (!connected) {
      lastJoinedRoomRef.current = null;
      return;
    }

    if (!effectiveRoomCode) {
      navigate('/dashboard', { replace: true });
      return;
    }

    if (!validGroup) return;
    if (lastJoinedRoomRef.current === effectiveRoomCode) return;

    const username =
      user?.username ||
      effectiveCurrentUser?.username ||
      effectiveCurrentUser?.name ||
      localStorage.getItem('dc_username') ||
      'Player';

    // Persist the last joined room for faster reconnection
    localStorage.setItem('joined_group_code', effectiveRoomCode);
    localStorage.setItem('dc_username', username);
    setRoomCode(effectiveRoomCode);

    socket.emit('join_room', { roomCode: effectiveRoomCode, username });
    lastJoinedRoomRef.current = effectiveRoomCode;
  }, [connected, socket, effectiveRoomCode, effectiveCurrentUser, user, validGroup, navigate, setRoomCode]);

  const displayedRoomCode = effectiveRoomCode || 'No group selected';
  const displayedCurrentUser = effectiveCurrentUser;

  return (
    <div className="dashboard-wrapper waiting-room-view">
      <div className="dashboard-bg" />
      
      <div className="dashboard-container">
        <aside className="sidebar">
          <div className="sidebar-section">
            <span className="sidebar-section-title">Your Group</span>
            <div className="room-code">{displayedRoomCode}</div>
          </div>

      <div className="sidebar-section">
        <span className="sidebar-section-title">Teammates</span>
        <div className="orientees-list">
          {orientees.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No teammates yet.</div>
          ) : (
            orientees.map((o) => {
              const isMe = o.id === displayedCurrentUser.id;
              const displayName = o.username || o.name || 'Player';
              const online = o.online !== false;
              return (
                <div key={o.id} className={`orientees-item ${isMe ? 'is-me' : ''}`}>
                  <img
                    className="orientees-avatar"
                    src={o.avatarUrl || `https://placehold.co/100x100/e2e8f0/475569?text=${encodeURIComponent((displayName || 'P').charAt(0).toUpperCase())}`}
                    alt=""
                  />
                  <div className="orientee-info">
                    <span className="orientees-name">
                      {isMe ? 'You' : displayName}
                      {isMe && displayName ? ` (${displayName})` : ''}
                    </span>
                    <div className="orientees-status" style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`status-dot ${online ? '' : 'offline'}`} />
                      <span className="status-text">{online ? 'Online' : 'Offline'}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </aside>

    <main className="main-content">

  {activeGame ? (
    <div className="game-slot">
      <GameSlot gameType={activeGame} />
    </div>
  ) : (
    <div className="waiting-hint">
      <p className="waiting-hint-title">
        Waiting for the host to start a game...
      </p>
      <p className="waiting-hint-subtitle">
        Relax and watch the countertop while you wait.
      </p>
    </div>
  )}
</main>
  </div>
</div>
  );
}