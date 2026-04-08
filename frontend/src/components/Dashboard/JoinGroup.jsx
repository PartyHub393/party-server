import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { joinGroup, getHostGroups, getPlayerGroups } from '../../api';
import { useSocket } from '../../useSocket';
import './dashboard.css';

export default function JoinGroup() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingRedirect, setCheckingRedirect] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, authLoaded } = useAuth();
  const { socket, connected } = useSocket();

  useEffect(() => {
    const message = location.state?.message;
    if (message) {
      setError(message);
    }
  }, [location.state]);

  useEffect(() => {
    if (!authLoaded) return;

    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    let canceled = false;

    const loadJoinedGroup = async () => {
      setCheckingRedirect(true);
      try {
        // If the user intentionally left a room, skip one auto-redirect cycle.
        const justLeftRoom = localStorage.getItem('just_left_room') === '1';
        if (justLeftRoom) {
          localStorage.removeItem('just_left_room');
          return;
        }

        // If the user is a host, check if they have any groups before showing the join screen.
        if (user?.role === 'host' && user?.id) {
          const hostRes = await getHostGroups(user.id);
          const hostGroups = hostRes?.groups || [];
          if (!canceled && hostGroups.length) {
            const hostCode = hostGroups[0]?.code;
            if (hostCode) {
              try {
                localStorage.setItem('host_room_code', hostCode);
              } catch {
                // ignore storage issues
              }
            }
            navigate('/dashboard', { replace: true });
            return;
          }
        }

        const savedCode = (localStorage.getItem('joined_group_code') || '').trim().toUpperCase();

        // If we have no stored room, try to load the first group from the server.
        if (user?.id) {
          const res = await getPlayerGroups(user.id);
          const groups = res?.groups || [];

          const playerCodes = groups
            .map((g) => (g?.code || '').trim().toUpperCase())
            .filter(Boolean);

          let redirectCode = null;
          if (savedCode && playerCodes.includes(savedCode)) {
            redirectCode = savedCode;
          } else if (playerCodes.length) {
            redirectCode = playerCodes[0];
          }

          if (!canceled && redirectCode) {
            localStorage.setItem('joined_group_code', redirectCode);
            navigate('/waiting-room', {
              replace: true,
              state: { groupCode: redirectCode, member: { id: user.id, username: user.username } },
            });
            return;
          }

          if (!redirectCode && savedCode) {
            localStorage.removeItem('joined_group_code');
          }
        } else if (savedCode && !canceled) {
          navigate('/waiting-room', {
            replace: true,
            state: { groupCode: savedCode, member: { id: user?.id, username: user?.username } },
          });
          return;
        }
      } catch (err) {
        // Fall back to saved local group code if available.
        const savedCode = (localStorage.getItem('joined_group_code') || '').trim().toUpperCase();
        if (!canceled && savedCode) {
          navigate('/waiting-room', {
            replace: true,
            state: { groupCode: savedCode, member: { id: user?.id, username: user?.username } },
          });
          return;
        }
      } finally {
        if (!canceled) setCheckingRedirect(false);
      }
    };

    loadJoinedGroup();

    return () => {
      canceled = true;
    };
  }, [authLoaded, isAuthenticated, navigate, user?.id, user?.role, user?.username]);

  const handleJoin = async (e) => {
    e.preventDefault();
    setError('');

    const trimmed = (code || '').trim().toUpperCase();
    if (!trimmed) {
      setError('Enter a valid group code.');
      return;
    }

    if (!user?.id) {
      setError('You must be logged in to join a group.');
      return;
    }

    setLoading(true);
    try {
      const result = await joinGroup({ groupCode: trimmed, userId: user.id });

      if (connected) {
        socket.emit('join_room', { roomCode: trimmed, username: result?.member?.username || user.username || 'Player' });
      }

      if(user?.role === 'host') {
        localStorage.setItem('host_room_code', trimmed);
        navigate('/dashboard', { replace: true });
        return;
      }

      localStorage.setItem('joined_group_code', trimmed);

      navigate('/waiting-room', {
        replace: true,
        state: { groupCode: trimmed, group: result.group, member: result.member },
      });
      return;
    } catch (err) {
      setError(err.message || 'Unable to join group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="dashboard-bg" />
      
      <div className="card join-card" style={{ maxWidth: '400px', width: '90%', textAlign: 'center', padding: '40px' }}>
        <div className="join-header" style={{ marginBottom: '32px' }}>
          <div className="logo-placeholder" style={{ fontSize: '32px', marginBottom: '12px' }}>🏫</div>
          <h1 style={{ fontSize: '24px', margin: '0 0 8px 0', color: 'var(--text-main)' }}>Welcome, Spartan!</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
            Enter your group code to join the orientation session.
          </p>
        </div>

        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div className="status-msg error" style={{ textAlign: 'left' }}>
              {error}
            </div>
          )}

          <div className="code-input-wrapper">
            <input
              type="text"
              placeholder="Room Code Here"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={9}
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '20px',
                fontWeight: '800',
                textAlign: 'center',
                letterSpacing: '0.1em',
                borderRadius: '12px',
                border: '2px solid #e2e8f0',
                background: '#f8fafc',
                color: 'var(--primary)',
                textTransform: 'uppercase'
              }}
            />
          </div>

          <button 
            type="submit" 
            className="primary-btn" 
            style={{ padding: '16px', fontSize: '16px', width: '100%' }}
            disabled={!code || loading}
          >
            {loading ? 'Joining…' : 'Enter Lobby'}
          </button>
        </form>

        <div className="join-footer" style={{ marginTop: '24px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Need help? Ask your orientation leader for the code displayed on the main screen.
          </p>
        </div>
      </div>
    </div>
  );
}