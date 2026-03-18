const {
  createRoomWithCode,
  getRoom,
  setHost,
  addPlayer,
  removePlayer,
  getPlayers,
  removeRoom,
} = require('../../rooms');
const { pool } = require('../../db');
const { removePlayerFromTrivia } = require('../../games/trivia');

function normalizeCode(roomCode) {
  return (roomCode || '').toUpperCase();
}

function registerRoomHandlers(io, socket) {
  socket.on('host_room', async (roomCode) => {
    const code = normalizeCode(roomCode);
    const userId = socket.handshake.auth?.userId;

    let room = getRoom(code);
    if (!room) {
      try {
        const res = await pool.query('SELECT created_by FROM groups WHERE code = $1', [code]);
        if (res.rows.length === 0) {
          socket.emit('host_error', { message: 'Room not found' });
          return;
        }

        const createdBy = res.rows[0].created_by;
        if (userId && createdBy && userId !== createdBy) {
          socket.emit('host_error', { message: 'You are not the owner of this room.' });
          return;
        }

        await createRoomWithCode(code, { hostSocketId: socket.id, hostUserId: userId });
        room = getRoom(code);
      } catch (err) {
        socket.emit('host_error', { message: 'Room not found' });
        return;
      }
    }

    socket.join(code);
    setHost(code, socket.id);
    socket.emit('host_joined', { roomCode: code, players: getPlayers(code) });
  });

  socket.on('join_room', async ({ roomCode, username }) => {
    const code = normalizeCode(roomCode);
    const userId = socket.handshake.auth?.userId;

    if (!userId) {
      socket.emit('join_error', { message: 'You must be signed in to join a room.' });
      return;
    }

    let isHostUser = false;
    try {
      const userRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length === 0) {
        socket.emit('join_error', { message: 'User not found.' });
        return;
      }
      isHostUser = userRes.rows[0].role === 'host';
    } catch (err) {
      socket.emit('join_error', { message: 'Could not validate user.' });
      return;
    }

    let room = getRoom(code);

    if (!room) {
      try {
        const res = await pool.query(
          `SELECT id, is_locked,
                  ($2::uuid = ANY(COALESCE(banned_users, '{}'::uuid[]))) AS is_banned
           FROM groups
           WHERE code = $1`,
          [code, userId]
        );

        if (res.rows.length === 0) {
          socket.emit('join_error', { message: 'Room not found. Check the code.' });
          return;
        }

        const groupId = res.rows[0].id;
        const isLocked = res.rows[0].is_locked;
        const isBanned = res.rows[0].is_banned;

        if (isBanned) {
          socket.emit('join_error', { message: 'You have been banned from this lobby.' });
          return;
        }

        if (isLocked) {
          const memberRes = await pool.query(
            'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
            [groupId, userId]
          );
          if (memberRes.rows.length === 0) {
            socket.emit('join_error', { message: 'This lobby is locked. New members cannot join right now.' });
            return;
          }
        }

        if (!isHostUser) {
          await pool.query(
            `INSERT INTO group_members (group_id, user_id)
              VALUES ($1, $2)
              ON CONFLICT (group_id, user_id) DO NOTHING`,
            [groupId, userId]
          );
        }

        await createRoomWithCode(code);
        room = getRoom(code);
      } catch (err) {
        socket.emit('join_error', { message: 'Room not found. Check the code.' });
        return;
      }
    } else {
      try {
        const groupRes = await pool.query(
          `SELECT id, is_locked,
                  ($2::uuid = ANY(COALESCE(banned_users, '{}'::uuid[]))) AS is_banned
           FROM groups
           WHERE code = $1`,
          [code, userId]
        );

        if (groupRes.rows.length) {
          const groupId = groupRes.rows[0].id;
          const isLocked = groupRes.rows[0].is_locked;
          const isBanned = groupRes.rows[0].is_banned;

          if (isBanned) {
            socket.emit('join_error', { message: 'You have been banned from this lobby.' });
            return;
          }

          if (isLocked) {
            const memberRes = await pool.query(
              'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
              [groupId, userId]
            );
            if (memberRes.rows.length === 0) {
              socket.emit('join_error', { message: 'This lobby is locked. New members cannot join right now.' });
              return;
            }
          }

          if (!isHostUser) {
            await pool.query(
              `INSERT INTO group_members (group_id, user_id)
               VALUES ($1, $2)
               ON CONFLICT (group_id, user_id) DO NOTHING`,
              [groupId, userId]
            );
          }
        }
      } catch (err) {
        socket.emit('join_error', { message: 'Room not found. Check the code.' });
        console.warn('Failed to persist group membership to DB:', err);
        return;
      }
    }

    if (isHostUser) {
      // Hosts should manage rooms via host_room and never join as player members.
      socket.emit('join_success', { roomCode: code, players: getPlayers(code) || [] });
      return;
    }

    const players = addPlayer(code, socket.id, username, { userId });
    if (players === null) {
      socket.emit('join_error', { message: 'Could not join room.' });
      return;
    }

    socket.join(code);
    socket.emit('join_success', { roomCode: code, players });
    socket.to(code).emit('player_joined', { players });
  });

  socket.on('host_closed', () => {
    const roomsJoined = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsJoined.forEach((code) => {
      io.to(code).emit('room_closed', {
        message: 'The host has ended the session.',
      });
      io.in(code).socketsLeave(code);
      removeRoom(code);
    });
  });

  socket.on('get_player_count', ({ roomCode }, callback) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      socket.emit('player_count_error', { message: 'Room not found' });
      return;
    }

    callback({ count: room.players.length });
  });

  socket.on('disconnect', () => {
    const roomsJoined = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsJoined.forEach((code) => {
      removePlayerFromTrivia(code, socket.id);

      const players = removePlayer(code, socket.id);
      if (players !== null) {
        io.to(code).emit('player_joined', { players });
      }
    });
  });
}

module.exports = { registerRoomHandlers };
