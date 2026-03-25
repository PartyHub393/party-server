import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getHostGroups, setGroupLock } from '../../api';
import { useSocket } from '../../useSocket';
import './dashboard.css';
import Navbar from '../Navbar/Navbar';
import { Popover } from 'react-tiny-popover'

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, isAuthenticated, authLoaded } = useAuth();
  const { socket, connected, setRoomCode } = useSocket();

  // Use the room code from localStorage if available
  const [hostRoomCode, setHostRoomCode] = useState(() => {
    try {
      return window.localStorage.getItem('host_room_code');
    } catch {
      return null;
    }
  });
  const [isLocked, setIsLocked] = useState(false);

  /** @type {Array<{ id: string, username: string, joinedAt?: string }>} */
  const [players, setPlayers] = useState([]);
  /** @type {string | null} */
  const [error, setError] = useState('');
  /** @type {boolean} */
  const [isGroupLoading, setIsGroupLoading] = useState(false);
  /** @type {boolean} */
  const [isLockSaving, setIsLockSaving] = useState(false);
  /** @type {string | null} */
  const [activePopoverKey, setActivePopoverKey] = useState(null);
  /** @type {Array<{ id: string, username: string }>} */
  const [bannedUsers, setBannedUsers] = useState([]);
  /** @type {'users' | 'banned'} */
  const [rosterTab, setRosterTab] = useState('users');
  /** @type {'assignments' | 'scores'} */
  const [groupPanelTab, setGroupPanelTab] = useState('assignments');
  const [targetSize, setTargetSize] = useState(5);
  /** @type {Record<string, number>} */
  const [assignmentScores, setAssignmentScores] = useState({});
  /** @type {Record<string, string>} */
  const [assignmentDraftByPlayer, setAssignmentDraftByPlayer] = useState({});
  /** @type {Record<string, string>} */
  const [scoreDraftByGroup, setScoreDraftByGroup] = useState({});

  const formatJoinedAt = (joinedAt) => {
    if (!joinedAt) return 'Unknown';
    const date = new Date(joinedAt);
    if (Number.isNaN(date.getTime())) return 'Unknown';

    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const kickPlayer = (playerId) => {
    socket.emit('kick_player', { roomCode: hostRoomCode, playerId });
  };

  const banPlayer = (playerId) => {
    socket.emit('ban_player', { roomCode: hostRoomCode, playerId });
  }

  const unbanPlayer = (playerId) => {
    socket.emit('unban_player', { roomCode: hostRoomCode, playerId }, () => {
      refreshBannedUsers();
    });
  }

  const togglePopover = (key) => {
    setActivePopoverKey((prev) => (prev === key ? null : key));
  };

  const mergePlayersWithAssignments = useCallback((nextPlayers = [], nextAssignments = {}) => {
    const playerIdToGroup = {};
    Object.entries(nextAssignments || {}).forEach(([groupName, playerIds]) => {
      (playerIds || []).forEach((id) => {
        playerIdToGroup[id] = groupName;
      });
    });

    return nextPlayers.map((player) => ({
      ...player,
      assignedGroup: player.assignedGroup || playerIdToGroup[player.id] || null,
    }));
  }, []);

  const groupedPlayers = useMemo(() => {
    /** @type {Record<string, Array<any>>} */
    const grouped = {};
    players.forEach((player) => {
      const groupName = (player.assignedGroup || '').trim();
      if (!groupName) return;
      if (!grouped[groupName]) grouped[groupName] = [];
      grouped[groupName].push(player);
    });
    return grouped;
  }, [players]);

  const assignmentGroupNames = useMemo(() => {
    const names = new Set([
      ...Object.keys(groupedPlayers),
      ...Object.keys(assignmentScores || {}),
    ]);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [groupedPlayers, assignmentScores]);

  const assignPlayer = (playerId) => {
    const nextGroupName = (assignmentDraftByPlayer[playerId] || '').trim();
    socket.emit('assign_player_group', {
      roomCode: hostRoomCode,
      playerId,
      groupName: nextGroupName,
    });
    setActivePopoverKey(null);
  };

  const clearAssignments = () => {
    socket.emit('clear_group_assignments', { roomCode: hostRoomCode });
  };

  const saveGroupScore = (groupName) => {
    const draftValue = scoreDraftByGroup[groupName];
    const parsed = Number(draftValue);
    const score = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;

    socket.emit('set_assignment_score', {
      roomCode: hostRoomCode,
      groupName,
      score,
    });
  };

  const deleteGroup = (groupName) => {
    socket.emit('delete_assignment_group', {
      roomCode: hostRoomCode,
      groupName,
    });
  };

  const autoAssignMembers = () => {
    socket.emit('auto_assign_members', {
      roomCode: hostRoomCode,
      targetSize,
    });
  };

  const refreshBannedUsers = useCallback(() => {
    if (!connected || !hostRoomCode) return;

    socket.emit('get_banned_users', { roomCode: hostRoomCode }, ({ bannedUsers: nextBannedUsers }) => {
      setBannedUsers(nextBannedUsers || []);
    });
  }, [connected, hostRoomCode, socket]);

  const displayedRoomCode = hostRoomCode;

  useEffect(() => {
    // Only redirect once auth has loaded.
    if (!authLoaded) return;

    if(!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }
    
    if (user?.role !== 'host') {
      navigate('/waiting-room', { replace: true });
      return;
    }

    // If we have a room code, make sure the socket joins it.
    if (connected && hostRoomCode) {
      setRoomCode(hostRoomCode);
      socket.emit('host_room', hostRoomCode);
    }

    // Host joined and room is ready
    const applyRoomSnapshot = ({ nextPlayers, nextAssignments, nextScores }) => {
      setPlayers(mergePlayersWithAssignments(nextPlayers || [], nextAssignments || {}));
      setAssignmentScores(nextScores || {});
      setScoreDraftByGroup((prev) => {
        const next = { ...prev };
        Object.entries(nextScores || {}).forEach(([groupName, score]) => {
          next[groupName] = String(score ?? 0);
        });
        return next;
      });
    };

    const handleHostJoined = ({ players: initialPlayers, assignments, assignmentScores: nextScores }) => {
      applyRoomSnapshot({
        nextPlayers: initialPlayers || [],
        nextAssignments: assignments || {},
        nextScores: nextScores || {},
      });
      refreshBannedUsers();
      setError('');
    };

    // Update player list when someone joins
    const handlePlayerJoined = ({ players: nextPlayers, assignments, assignmentScores: nextScores }) => {
      applyRoomSnapshot({
        nextPlayers: nextPlayers || [],
        nextAssignments: assignments || {},
        nextScores: nextScores || {},
      });
    };

    const handlePlayerLeft = ({ players: nextPlayers, assignments, assignmentScores: nextScores }) => {
      applyRoomSnapshot({
        nextPlayers: nextPlayers || [],
        nextAssignments: assignments || {},
        nextScores: nextScores || {},
      });
      refreshBannedUsers();
    };

    const handleAssignmentsUpdated = ({ players: nextPlayers, assignments, assignmentScores: nextScores }) => {
      applyRoomSnapshot({
        nextPlayers: nextPlayers || [],
        nextAssignments: assignments || {},
        nextScores: nextScores || {},
      });
    };

    // Handle errors related to hosting/joining
    const handleHostError = ({ message }) => {
      setError(message || 'Host error');
    };

    // Listen for real-time updates about the room and players
    socket.once('host_joined', handleHostJoined);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('host_error', handleHostError);
    socket.on('player_left', handlePlayerLeft);
    socket.on('group_assignments_updated', handleAssignmentsUpdated);

    return () => {
      // Clean up listeners when component unmounts
      socket.off('host_joined', handleHostJoined);
      socket.off('player_joined', handlePlayerJoined);
      socket.off('host_error', handleHostError);
      socket.off('player_left', handlePlayerLeft);
      socket.off('group_assignments_updated', handleAssignmentsUpdated);
    };
  }, [socket, connected, hostRoomCode, isAuthenticated, user, navigate, refreshBannedUsers, setRoomCode, mergePlayersWithAssignments]);


  // Authenticated host: load their groups and set up the dashboard
  useEffect(() => {
    // Avoid running before auth state is resolved (otherwise we may navigate away too early)
    if (!authLoaded) return;
    if (!isAuthenticated || user?.role !== 'host') return;

    const loadHostGroups = async () => {
      setIsGroupLoading(true);
      try {
        // Try to load the host's groups and pick the first one (if any) to display in the dashboard.
        const res = await getHostGroups(user.id);
        const groups = res?.groups || [];
        if (groups.length) {
          // Populate the dashboard with the locked state + room code
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
    <div className="dashboard-wrapper dashboard-view">
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

            <div className="roster-tabs" role="tablist" aria-label="Roster tabs">
              <button
                type="button"
                role="tab"
                aria-selected={rosterTab === 'users'}
                className={`roster-tab ${rosterTab === 'users' ? 'active' : ''}`}
                onClick={() => setRosterTab('users')}
              >
                Users ({players.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rosterTab === 'banned'}
                className={`roster-tab ${rosterTab === 'banned' ? 'active' : ''}`}
                onClick={() => {
                  setRosterTab('banned');
                  refreshBannedUsers();
                }}
              >
                Banned ({bannedUsers.length})
              </button>
            </div>

            <div className="orientees-list">
              {rosterTab === 'users' ? players.map((o) => {
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
                      {o.assignedGroup ? <span className="assignment-chip">{o.assignedGroup}</span> : null}
                      <div className="orientees-status">
                        <span className={`status-dot ${online ? '' : 'offline'}`} />
                        <span className="status-text">{online ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>
                    
                    <Popover
                      isOpen={activePopoverKey === `user:${o.id}`}
                      onClickOutside={() => setActivePopoverKey(null)}
                      positions={['right', 'top', 'bottom', 'left']}
                      content={
                      <div className="popover-content">
                        <span className="orientees-name">{o.username || o.name || 'Player'}</span>
                        <span className="join-time">Joined {formatJoinedAt(o.joinedAt)}</span>
                        <label className="assignment-label" htmlFor={`assign-${o.id}`}>Assignment Group</label>
                        <input
                          id={`assign-${o.id}`}
                          type="text"
                          className="assignment-input"
                          placeholder="Example: Team A"
                          value={assignmentDraftByPlayer[o.id] ?? (o.assignedGroup || '')}
                          onChange={(e) => {
                            setAssignmentDraftByPlayer((prev) => ({ ...prev, [o.id]: e.target.value }));
                          }}
                        />
                        <button
                          className="secondary-btn action-btn"
                          type="button"
                          onClick={() => assignPlayer(o.id)}
                        >
                          Save Assignment
                        </button>
                         <button className="secondary-btn action-btn" type="button" onClick={() => {
                          kickPlayer(o.id);
                          setActivePopoverKey(null)
                          }}>
                          Kick
                        </button>
                        <button className="secondary-btn action-btn" type="button" onClick={() => {
                          banPlayer(o.id);
                          setActivePopoverKey(null);
                        }}>
                          Ban
                        </button>
                      </div>}
                    >
                      <button className="actions-btn" type="button" onClick={() => togglePopover(`user:${o.id}`)}>
                        •••
                      </button>
                    </Popover>
                    
                  </div>
                )
              }) : bannedUsers.length ? bannedUsers.map((banned) => (
                <div key={banned.id} className="orientees-item">
                  <img
                    className="orientees-avatar"
                    src={`https://placehold.co/100x100/f1f5f9/475569?text=${encodeURIComponent((banned.username || 'P').charAt(0).toUpperCase())}`}
                    alt={`${banned.username || 'Player'} avatar`}
                  />
                  <div className="orientee-info">
                    <span className="orientees-name">{banned.username || 'Player'}</span>
                    <div className="orientees-status">
                      <span className="status-dot offline" />
                      <span className="status-text">Banned</span>
                    </div>
                  </div>

                  <Popover
                      isOpen={activePopoverKey === `banned:${banned.id}`}
                      onClickOutside={() => setActivePopoverKey(null)}
                      positions={['right', 'top', 'bottom', 'left']}
                      content={
                      <div className="popover-content">
                        <span className="orientees-name">{banned.username || banned.name || 'Player'}</span>
                         <button className="secondary-btn action-btn" type="button" onClick={() => {
                            unbanPlayer(banned.id);
                            setActivePopoverKey(null);
                          }}>
                          Unban
                        </button>
                      </div>}
                    >
                      <button className="actions-btn" type="button" onClick={() => togglePopover(`banned:${banned.id}`)}>
                        •••
                      </button>
                    </Popover>
                </div>
              )) : (
                <div className="status-text">No banned users.</div>
              )}
            </div>
          </div>
        </aside>

        <main className="main-content">
          <section className="row-section">
            <div className="card group-status">
              <div className="card-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 className="card-title" style={{ margin: 0 }}>Group Management</h2>
                <div className="target-control" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <span>Target Size:</span>
                  <input 
                    type="number" 
                    value={targetSize}
                    min={1}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setTargetSize(Number.isFinite(next) && next > 0 ? Math.trunc(next) : 1);
                    }}
                    style={{ width: '50px', padding: '4px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div className="group-stats-summary" style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', textAlign: 'center', marginBottom: '16px', fontSize: '14px' }}>
                <strong>{players.length}</strong> Orientees total • <strong>{assignmentGroupNames.length}</strong> Assignment groups
              </div>

              <div className="roster-tabs" role="tablist" aria-label="Group management tabs" style={{ marginBottom: '12px' }}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={groupPanelTab === 'assignments'}
                  className={`roster-tab ${groupPanelTab === 'assignments' ? 'active' : ''}`}
                  onClick={() => setGroupPanelTab('assignments')}
                >
                  Assignments
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={groupPanelTab === 'scores'}
                  className={`roster-tab ${groupPanelTab === 'scores' ? 'active' : ''}`}
                  onClick={() => setGroupPanelTab('scores')}
                >
                  Scores
                </button>
              </div>

              <div className="group-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {assignmentGroupNames.length === 0 ? (
                  <div className="status-text">No assignment groups yet. Assign players from the user popover.</div>
                ) : groupPanelTab === 'assignments' ? assignmentGroupNames.map((groupName) => {
                  const memberCount = groupedPlayers[groupName]?.length || 0;
                  const targetSize = 5;
                  const fillPct = Math.min(100, Math.round((memberCount / targetSize) * 100));
                  const statusLabel = memberCount >= targetSize ? 'Full' : memberCount > 0 ? 'Partial' : 'Empty';

                  return (
                    <div key={groupName} className="group-item" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', gap: '10px' }}>
                        <span style={{ fontWeight: 600 }}>{groupName}</span>
                        <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '10px', background: '#f1f5f9', color: '#334155', fontWeight: 700 }}>
                          {memberCount} / {targetSize} {statusLabel}
                        </span>
                      </div>

                      <div style={{ height: '6px', width: '100%', background: '#e2e8f0', borderRadius: '3px', marginBottom: '8px' }}>
                        <div style={{ height: '100%', width: `${fillPct}%`, background: '#2563eb', borderRadius: '3px' }} />
                      </div>

                      <div className="group-score-row">
                        <button
                          type="button"
                          className="secondary-btn danger-outline-btn"
                          onClick={() => deleteGroup(groupName)}
                        >
                          Delete Team
                        </button>
                      </div>
                    </div>
                  );
                }) : assignmentGroupNames.map((groupName) => (
                  <div key={groupName} className="group-item" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', gap: '10px' }}>
                      <span style={{ fontWeight: 600 }}>{groupName}</span>
                      <span style={{ fontSize: '12px', color: '#475569' }}>
                        Members: {groupedPlayers[groupName]?.length || 0}
                      </span>
                    </div>
                    <div className="group-score-row">
                      <span className="status-text">Score</span>
                      <input
                        type="number"
                        className="group-score-input"
                        value={scoreDraftByGroup[groupName] ?? String(assignmentScores[groupName] ?? 0)}
                        onChange={(e) => {
                          setScoreDraftByGroup((prev) => ({ ...prev, [groupName]: e.target.value }));
                        }}
                      />
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => saveGroupScore(groupName)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="secondary-btn danger-outline-btn"
                        onClick={() => deleteGroup(groupName)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="group-actions" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="primary-btn" style={{ flex: 2 }} onClick={autoAssignMembers}>
                  Auto-Assign Members
                </button>
                <button type="button" className="secondary-btn" style={{ flex: 1 }} onClick={clearAssignments}>
                  Clear
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}