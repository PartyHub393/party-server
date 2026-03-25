const { getRoom, removePlayerPermanently, getPlayers } = require('../../rooms');
const { pool } = require('../../db');

function normalizeCode(roomCode) {
  return (roomCode || '').toUpperCase();
}

function registerModerationHandlers(io, socket) {
  socket.on('kick_player', async ({ roomCode, playerId }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      socket.emit('host_error', { message: 'Room not found' });
      return;
    }
    if (room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can kick players.' });
      return;
    }

    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
      socket.emit('host_error', { message: 'Player not found' });
      return;
    }

    try {
      const res = await pool.query('SELECT id FROM groups WHERE code = $1', [code]);
      if (res.rows.length === 0) {
        console.warn('Group not found in database when trying to kick player.');
        return;
      }

      const groupId = res.rows[0].id;
      pool.query(
        `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
        [groupId, player.userId]
      );

      pool.query(
        `DELETE FROM room_assignment_members WHERE group_id = $1 AND user_id = $2`,
        [groupId, player.userId]
      );

      io.to(player.socketId).emit('kicked', { message: 'You have been kicked from the room.' });
      io.sockets.sockets.get(player.socketId)?.leave(code);
      removePlayerPermanently(code, player.id);
      io.to(code).emit('player_left', { players: getPlayers(code) });
    } catch (err) {
      socket.emit('host_error', { message: 'Failed to remove player from database.' });
      console.warn('Failed to remove player from group membership in DB:', err);
    }
  });

  socket.on('ban_player', async ({ roomCode, playerId }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      socket.emit('host_error', { message: 'Room not found' });
      return;
    }
    if (room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can ban players.' });
      return;
    }

    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
      socket.emit('host_error', { message: 'Player not found' });
      return;
    }
    if (!player.userId) {
      socket.emit('host_error', { message: 'Cannot ban this player: missing user ID.' });
      return;
    }

    try {
      const groupRes = await pool.query('SELECT id FROM groups WHERE code = $1', [code]);
      if (groupRes.rows.length === 0) {
        socket.emit('host_error', { message: 'Room not found in database.' });
        return;
      }

      const groupId = groupRes.rows[0].id;

      await pool.query(
        `UPDATE groups
         SET banned_users = ARRAY(SELECT DISTINCT UNNEST(COALESCE(banned_users, '{}'::uuid[]) || $2::uuid))
         WHERE id = $1`,
        [groupId, player.userId]
      );

      await pool.query(
        `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
        [groupId, player.userId]
      );

      await pool.query(
        `DELETE FROM room_assignment_members WHERE group_id = $1 AND user_id = $2`,
        [groupId, player.userId]
      );

      if (player.socketId) {
        io.to(player.socketId).emit('banned', { message: 'You have been banned from the room.' });
        io.sockets.sockets.get(player.socketId)?.leave(code);
      }

      removePlayerPermanently(code, player.id);
      io.to(code).emit('player_left', { players: getPlayers(code) });
    } catch (err) {
      socket.emit('host_error', { message: 'Failed to ban player from database.' });
      console.warn('Failed to ban player:', err);
    }
  });

  socket.on('get_banned_users', async ({ roomCode }, callback) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      if (callback) callback({ bannedUsers: [] });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can view banned users.' });
      if (callback) callback({ bannedUsers: [] });
      return;
    }

    try {
      const res = await pool.query(
        `SELECT u.id, u.username
         FROM groups g
         JOIN users u ON u.id = ANY(COALESCE(g.banned_users, '{}'::uuid[]))
         WHERE g.code = $1`,
        [code]
      );

      if (callback) {
        callback({
          bannedUsers: res.rows.map((row) => ({
            id: row.id,
            username: row.username || 'Player',
          })),
        });
      }
    } catch (err) {
      console.warn('Failed to load banned users:', err);
      if (callback) callback({ bannedUsers: [] });
    }
  });

  socket.on('unban_player', async ({ roomCode, playerId }, callback) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      if (callback) callback({ success: false });
      return;
    }
    if (room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can unban players.' });
      if (callback) callback({ success: false });
      return;
    }

    try {
      const groupRes = await pool.query('SELECT id FROM groups WHERE code = $1', [code]);
      if (groupRes.rows.length === 0) {
        socket.emit('host_error', { message: 'Room not found in database.' });
        if (callback) callback({ success: false });
        return;
      }

      const groupId = groupRes.rows[0].id;
      await pool.query(
        `UPDATE groups
          SET banned_users = ARRAY(SELECT UNNEST(COALESCE(banned_users, '{}'::uuid[])) EXCEPT SELECT $2::uuid)
          WHERE id = $1`,
        [groupId, playerId]
      );

      if (callback) callback({ success: true });
    } catch (err) {
      socket.emit('host_error', { message: 'Failed to unban player from database.' });
      console.warn('Failed to unban player:', err);
      if (callback) callback({ success: false });
    }
  });
}

module.exports = { registerModerationHandlers };
