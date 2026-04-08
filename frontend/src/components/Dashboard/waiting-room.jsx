import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSocket } from '../../useSocket';
import { useAuth } from '../../contexts/AuthContext';
import { getPlayerGroups, getScavengerState } from '../../api';
import GameSlot from '../games/GameSlot';
import Navbar from '../Navbar/Navbar';
import './waiting-room.css'

export default function UserWaitingRoom({ roomCode, orientees: initialOrientees, currentUser }) {
  const { socket, connected, setRoomCode } = useSocket();
  const { user } = useAuth();
  const [orientees, setOrientees] = useState(initialOrientees || []);
  const [assignmentScores, setAssignmentScores] = useState({});
  const [scavengerTotalPoints, setScavengerTotalPoints] = useState(null);
  const [roomTab, setRoomTab] = useState('teammates');
  const [validGroup, setValidGroup] = useState(false);
  const [activeGame, setActiveGame] = useState(null);
  const [isLeaving, setIsLeaving] = useState(false);
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
            navigate('/join-group', { replace: true });
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

    const applyRoomSnapshot = ({ players = [], assignments = {}, scores = {} }) => {
      const playerIdToGroup = {};
      Object.entries(assignments || {}).forEach(([groupName, ids]) => {
        (ids || []).forEach((id) => {
          playerIdToGroup[id] = groupName;
        });
      });

      setOrientees(
        (players || []).map((p) => ({
          ...p,
          assignedGroup: p.assignedGroup || playerIdToGroup[p.id] || null,
        }))
      );
      setAssignmentScores(scores || {});
    };

    const handlePlayerJoined = ({ players, assignments, assignmentScores: scores }) => {
      applyRoomSnapshot({ players, assignments, scores: scores || {} });
    };

    const handlePlayerLeft = ({ players, assignments, assignmentScores: scores }) => {
      applyRoomSnapshot({ players, assignments, scores: scores || {} });
    };

    const handleJoinSuccess = ({ players, assignments, assignmentScores: scores }) => {
      applyRoomSnapshot({ players, assignments, scores: scores || {} });
    };

    const handleAssignmentsUpdated = ({ players, assignments, assignmentScores: scores }) => {
      applyRoomSnapshot({ players, assignments, scores: scores || {} });
    };

    const handleJoinError = ({ message }) => {
      localStorage.removeItem('joined_group_code');
      setRoomCode(null);
      navigate('/join-group', {
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
      navigate('/join-group', {
        replace: true,
        state: { message: message || 'You have been banned from the room.' },
      });
    };

    socket.on('player_joined', handlePlayerJoined);
    socket.on('player_left', handlePlayerLeft);
    socket.on('join_success', handleJoinSuccess);
    socket.on('join_error', handleJoinError);
    socket.on('game_started', handleGameStarted);
    socket.on('game_ended', handleGameEnded);
    socket.on('kicked', handleForcedLeave);
    socket.on('banned', handleForcedLeave);
    socket.on('group_assignments_updated', handleAssignmentsUpdated);

    return () => {
      socket.off('player_joined', handlePlayerJoined);
      socket.off('player_left', handlePlayerLeft);
      socket.off('join_success', handleJoinSuccess);
      socket.off('join_error', handleJoinError);
      socket.off('game_started', handleGameStarted);
      socket.off('game_ended', handleGameEnded);
      socket.off('kicked', handleForcedLeave);
      socket.off('banned', handleForcedLeave);
      socket.off('group_assignments_updated', handleAssignmentsUpdated);
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

  // Keep scavenger score in sync so the Scores tab reflects scavenger hunt points.
  useEffect(() => {
    if (!effectiveRoomCode) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const state = await getScavengerState();
        if (!cancelled) setScavengerTotalPoints(state?.totalPoints ?? 0);
      } catch {
        // ignore; keep last-known value
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [effectiveRoomCode]);

  const handleLeaveRoom = () => {
    if (isLeaving) return;
    setIsLeaving(true);

    if (effectiveRoomCode) {
      // Tell server this client is leaving voluntarily (if backend handles it).
      socket.emit('leave_room', { roomCode: effectiveRoomCode, userId: user?.id });
    }
  
    // Clear local room/session markers used by waiting-room and rejoin flow.
    localStorage.removeItem('joined_group_code');
    localStorage.removeItem('dc_username');
    localStorage.setItem('just_left_room', '1');
  
    setRoomCode(null);
    lastJoinedRoomRef.current = null;
  
    navigate('/join-group', {
      replace: true,
      state: { message: 'You left the room.' },
    });
  };

  const displayedRoomCode = effectiveRoomCode || 'No group selected';
  const displayedCurrentUser = effectiveCurrentUser;
  const myTeamName = useMemo(() => {
    const myUserId = user?.id || displayedCurrentUser?.id;
    if (!myUserId) return null;

    const me = orientees.find(
      (entry) => entry.userId === myUserId || entry.id === myUserId
    );

    return me?.assignedGroup || null;
  }, [orientees, user?.id, displayedCurrentUser?.id]);

  const scoreGroupNames = useMemo(() => {
    const names = new Set(Object.keys(assignmentScores || {}));
    (orientees || []).forEach((o) => {
      if (o?.assignedGroup) names.add(o.assignedGroup);
    });
    if (names.size === 0 && myTeamName) names.add(myTeamName);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [assignmentScores, orientees, myTeamName]);

  return (
    <div className="dashboard-wrapper waiting-room-view">
      <div className="dashboard-bg" />
      <Navbar />
      <div className="dashboard-container">
        <aside className="sidebar">
          <div className="sidebar-section">
            <span className="sidebar-section-title">Your Group</span>
            <div className="room-code">{displayedRoomCode}</div>
            <button
              type="button"
              role="tab"
              className="roster-tab leave-room-btn"
              disabled={isLeaving}
              onClick={() => handleLeaveRoom()}
            >
              {isLeaving ? 'Leaving...' : 'Leave Room'}
            </button>
          </div>

      <div className="sidebar-section">
        <div className="roster-tabs" role="tablist" aria-label="Waiting room tabs" style={{ marginTop: '8px' }}>
          <button
            type="button"
            role="tab"
            aria-selected={roomTab === 'teammates'}
            className={`roster-tab ${roomTab === 'teammates' ? 'active' : ''}`}
            onClick={() => setRoomTab('teammates')}
          >
            Teammates
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={roomTab === 'scores'}
            className={`roster-tab ${roomTab === 'scores' ? 'active' : ''}`}
            onClick={() => setRoomTab('scores')}
          >
            Scores
          </button>
        </div>
        <div className="orientees-list">
          {roomTab === 'teammates' ? (
            orientees.length === 0 ? (
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
                      {o.assignedGroup ? <span className="assignment-chip">{o.assignedGroup}</span> : null}
                      <div className="orientees-status" style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`status-dot ${online ? '' : 'offline'}`} />
                        <span className="status-text">{online ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )
          ) : (
            scoreGroupNames.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>
                {activeGame === 'scavenger' ? 'No team scores yet.' : 'No assignment scores yet.'}
              </div>
            ) : (
              scoreGroupNames.map((groupName) => {
                const score =
                  activeGame === 'scavenger'
                    ? (groupName === myTeamName ? (scavengerTotalPoints ?? 0) : 0)
                    : (assignmentScores?.[groupName] ?? 0);
                return (
                  <div key={groupName} className={`orientees-item ${myTeamName === groupName ? 'is-my-team' : ''}`}>
                    <div className="orientee-info" style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="orientees-name">
                        {groupName}
                        {myTeamName === groupName ? ' (Your Team)' : ''}
                      </span>
                      <span className="assignment-score">{score}</span>
                    </div>
                  </div>
                );
              })
            )
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