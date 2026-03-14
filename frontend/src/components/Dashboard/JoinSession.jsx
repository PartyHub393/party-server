import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { joinGroup, getPlayerGroups } from '../../api';
import { useSocket } from '../../useSocket';
import './dashboard.css';

export default function JoinSession() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { socket, connected } = useSocket();

  useEffect(() => {
    const message = location.state?.message;
    if (message) {
      setError(message);
    }
  }, [location.state]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    const loadJoinedGroup = async () => {
      try {
        const savedCode = localStorage.getItem('joined_group_code');
        if (savedCode) {
          navigate('/waiting-room', {
            replace: true,
            state: { groupCode: savedCode, member: { id: user?.id, username: user?.username } },
          });
          return;
        }

        localStorage.removeItem('joined_group_code');

        // If we have no stored room, try to load the first group from the server.
        if (user?.id) {
          const res = await getPlayerGroups(user.id);
          const groups = res?.groups || [];
          if (groups.length) {
            const code = groups[0].code;
            localStorage.setItem('joined_group_code', code);
            navigate('/waiting-room', {
              replace: true,
              state: { groupCode: code, member: { id: user.id, username: user.username } },
            });
          }
        }
      } catch (err) {
        // ignore, user can still join manually
      }
    };

    loadJoinedGroup();
  }, [isAuthenticated, navigate, user]);

  useEffect(() => {
    if (!connected) return;

    const handleJoinError = ({ message }) => {
      setError(message || 'Unable to join room');
    };

    socket.on('join_error', handleJoinError);

    return () => {
      socket.off('join_error', handleJoinError);
    };
  }, [connected, socket]);

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

      // Signal presence to the live socket room for the host dashboard.
      if (connected) {
        socket.emit('join_room', { roomCode: trimmed, username: result.member.username });
      }

      navigate('/waiting-room', {
        replace: true,
        state: { groupCode: trimmed, group: result.group, member: result.member },
      });
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