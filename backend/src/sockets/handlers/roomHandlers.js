const {
  createRoomWithCode,
  getRoom,
  setHost,
  addPlayer,
  removePlayer,
  getPlayers,
  removeRoom,
  assignPlayerToGroup,
  clearRoomAssignments,
  getRoomAssignments,
  setRoomAssignmentScore,
  getRoomAssignmentScores,
  deleteAssignmentGroup,
  autoAssignPlayersToGroups,
} = require('../../rooms');
const { pool } = require('../../db');
const { removePlayerFromTrivia } = require('../../games/trivia');
const { getTriviaGame } = require('../../games/trivia');

function normalizeCode(roomCode) {
  return (roomCode || '').toUpperCase();
}

async function resolveGroupIdByCode(code) {
  const res = await pool.query('SELECT id FROM groups WHERE code = $1', [code]);
  return res.rows[0]?.id || null;
}

async function upsertDbAssignment({ groupId, userId, groupName }) {
  const normalizedName = typeof groupName === 'string' ? groupName.trim() : '';

  if (!normalizedName) {
    await pool.query(
      'DELETE FROM room_assignment_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    return;
  }

  const assignmentGroupRes = await pool.query(
    `INSERT INTO room_assignment_groups (group_id, name, score)
     VALUES ($1, $2, 0)
     ON CONFLICT (group_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [groupId, normalizedName]
  );

  const assignmentGroupId = assignmentGroupRes.rows[0]?.id;
  if (!assignmentGroupId) return;

  await pool.query(
    `INSERT INTO room_assignment_members (group_id, assignment_group_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (group_id, user_id)
     DO UPDATE SET assignment_group_id = EXCLUDED.assignment_group_id, assigned_at = CURRENT_TIMESTAMP`,
    [groupId, assignmentGroupId, userId]
  );
}

async function persistRoomAssignmentsSnapshot({ groupId, players, assignmentScores }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const assignedNames = new Set();
    for (const player of players || []) {
      const name = typeof player.assignedGroup === 'string' ? player.assignedGroup.trim() : '';
      if (name) assignedNames.add(name);
    }
    for (const key of Object.keys(assignmentScores || {})) {
      const trimmed = (key || '').trim();
      if (trimmed) assignedNames.add(trimmed);
    }

    const names = Array.from(assignedNames);

    if (names.length === 0) {
      await client.query('DELETE FROM room_assignment_members WHERE group_id = $1', [groupId]);
      await client.query('DELETE FROM room_assignment_groups WHERE group_id = $1', [groupId]);
      await client.query('COMMIT');
      return;
    }

    await client.query('DELETE FROM room_assignment_members WHERE group_id = $1', [groupId]);

    await client.query(
      'DELETE FROM room_assignment_groups WHERE group_id = $1 AND NOT (name = ANY($2::text[]))',
      [groupId, names]
    );

    /** @type {Record<string, string>} */
    const assignmentGroupIdByName = {};
    for (const name of names) {
      const score = Number.isFinite(Number(assignmentScores?.[name])) ? Math.trunc(Number(assignmentScores[name])) : 0;
      const res = await client.query(
        `INSERT INTO room_assignment_groups (group_id, name, score)
         VALUES ($1, $2, $3)
         ON CONFLICT (group_id, name) DO UPDATE SET score = EXCLUDED.score
         RETURNING id`,
        [groupId, name, score]
      );
      if (res.rows[0]?.id) {
        assignmentGroupIdByName[name] = res.rows[0].id;
      }
    }

    for (const player of players || []) {
      const groupName = typeof player.assignedGroup === 'string' ? player.assignedGroup.trim() : '';
      if (!player.userId || !groupName || !assignmentGroupIdByName[groupName]) continue;

      await client.query(
        `INSERT INTO room_assignment_members (group_id, assignment_group_id, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (group_id, user_id)
         DO UPDATE SET assignment_group_id = EXCLUDED.assignment_group_id, assigned_at = CURRENT_TIMESTAMP`,
        [groupId, assignmentGroupIdByName[groupName], player.userId]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
    socket.emit('host_joined', {
      roomCode: code,
      players: getPlayers(code),
      assignments: getRoomAssignments(code),
      assignmentScores: getRoomAssignmentScores(code),
    });
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
      socket.emit('join_success', {
        roomCode: code,
        players: getPlayers(code) || [],
        assignments: getRoomAssignments(code),
        assignmentScores: getRoomAssignmentScores(code),
      });
      return;
    }

    const players = addPlayer(code, socket.id, username, { userId });
    if (players === null) {
      socket.emit('join_error', { message: 'Could not join room.' });
      return;
    }

    socket.join(code);
    const activeGame = room.activeGame || null;
    const triviaState = activeGame === 'trivia' ? getTriviaGame(code) : null;

    socket.emit('join_success', {
      roomCode: code,
      players,
      assignments: getRoomAssignments(code),
      assignmentScores: getRoomAssignmentScores(code),
      activeGame,
      triviaQuestion: triviaState?.currentQuestion || null,
    });
    socket.to(code).emit('player_joined', {
      players,
      assignments: getRoomAssignments(code),
      assignmentScores: getRoomAssignmentScores(code),
    });
  });

  socket.on('assign_player_group', async ({ roomCode, playerId, groupName }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      socket.emit('host_error', { message: 'Room not found' });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can assign player groups.' });
      return;
    }

    const updatedPlayer = assignPlayerToGroup(code, playerId, groupName);
    if (!updatedPlayer) {
      socket.emit('host_error', { message: 'Player not found' });
      return;
    }

    if (updatedPlayer.userId) {
      try {
        const groupId = await resolveGroupIdByCode(code);
        if (groupId) {
          await upsertDbAssignment({
            groupId,
            userId: updatedPlayer.userId,
            groupName: updatedPlayer.assignedGroup,
          });
        }
      } catch (err) {
        socket.emit('host_error', { message: 'Failed to persist assignment.' });
      }
    }

    io.to(code).emit('group_assignments_updated', {
      players: getPlayers(code),
      assignments: getRoomAssignments(code),
      assignmentScores: getRoomAssignmentScores(code),
    });
  });

  socket.on('clear_group_assignments', async ({ roomCode }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      socket.emit('host_error', { message: 'Room not found' });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can clear player groups.' });
      return;
    }

    clearRoomAssignments(code);

    try {
      const groupId = await resolveGroupIdByCode(code);
      if (groupId) {
        await pool.query('DELETE FROM room_assignment_members WHERE group_id = $1', [groupId]);
      }
    } catch (err) {
      socket.emit('host_error', { message: 'Failed to clear assignments in database.' });
    }

    io.to(code).emit('group_assignments_updated', {
      players: getPlayers(code),
      assignments: getRoomAssignments(code),
      assignmentScores: getRoomAssignmentScores(code),
    });
  });

  socket.on('set_assignment_score', async ({ roomCode, groupName, score }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      socket.emit('host_error', { message: 'Room not found' });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can set assignment scores.' });
      return;
    }

    const updatedScore = setRoomAssignmentScore(code, groupName, score);
    if (updatedScore === null) {
      socket.emit('host_error', { message: 'Invalid assignment group or score.' });
      return;
    }

    try {
      const groupId = await resolveGroupIdByCode(code);
      if (groupId) {
        await pool.query(
          `INSERT INTO room_assignment_groups (group_id, name, score)
           VALUES ($1, $2, $3)
           ON CONFLICT (group_id, name) DO UPDATE SET score = EXCLUDED.score`,
          [groupId, groupName.trim(), updatedScore]
        );
      }
    } catch (err) {
      socket.emit('host_error', { message: 'Failed to persist assignment score.' });
    }

    io.to(code).emit('group_assignments_updated', {
      players: getPlayers(code),
      assignments: getRoomAssignments(code),
      assignmentScores: getRoomAssignmentScores(code),
    });
  });

  socket.on('delete_assignment_group', async ({ roomCode, groupName }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      socket.emit('host_error', { message: 'Room not found' });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can delete assignment groups.' });
      return;
    }

    const updated = deleteAssignmentGroup(code, groupName);
    if (!updated) {
      socket.emit('host_error', { message: 'Invalid assignment group.' });
      return;
    }

    try {
      const groupId = await resolveGroupIdByCode(code);
      if (groupId) {
        await pool.query(
          'DELETE FROM room_assignment_groups WHERE group_id = $1 AND name = $2',
          [groupId, String(groupName || '').trim()]
        );
      }
    } catch (err) {
      socket.emit('host_error', { message: 'Failed to delete assignment group.' });
    }

    io.to(code).emit('group_assignments_updated', {
      players: getPlayers(code),
      assignments: getRoomAssignments(code),
      assignmentScores: getRoomAssignmentScores(code),
    });
  });

  socket.on('auto_assign_members', async ({ roomCode, targetSize }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      socket.emit('host_error', { message: 'Room not found' });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can auto-assign members.' });
      return;
    }

    const updated = autoAssignPlayersToGroups(code, targetSize);
    if (!updated) {
      socket.emit('host_error', { message: 'Failed to auto-assign members.' });
      return;
    }

    try {
      const groupId = await resolveGroupIdByCode(code);
      if (groupId) {
        await persistRoomAssignmentsSnapshot({
          groupId,
          players: getPlayers(code),
          assignmentScores: getRoomAssignmentScores(code),
        });
      }
    } catch (err) {
      socket.emit('host_error', { message: 'Failed to persist auto-assignment.' });
    }

    io.to(code).emit('group_assignments_updated', {
      players: getPlayers(code),
      assignments: getRoomAssignments(code),
      assignmentScores: getRoomAssignmentScores(code),
    });
  });

  socket.on('get_group_assignments', ({ roomCode }, callback) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      if (callback) callback({ assignments: {}, players: [] });
      return;
    }

    if (callback) {
      callback({
        assignments: getRoomAssignments(code),
        players: getPlayers(code),
        assignmentScores: getRoomAssignmentScores(code),
      });
    }
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

    const onlineCount = room.players.filter((player) => player.online !== false).length;
    callback({ count: onlineCount });
  });

  socket.on('leave_room', async ({ roomCode }) => {
    const code = normalizeCode(roomCode);
    if (!code) return;

    removePlayerFromTrivia(code, socket.id);
    const players = removePlayer(code, socket.id);
    socket.leave(code);

    const userId = socket.handshake.auth?.userId;
    if (userId) {
      try {
        await pool.query(
          `DELETE FROM group_members gm
           USING groups g
           WHERE gm.group_id = g.id
             AND g.code = $1
             AND gm.user_id = $2`,
          [code, userId]
        );
      } catch (err) {
        console.warn('Failed to remove group membership on leave_room:', err);
      }
    }

    if (players !== null) {
      io.to(code).emit('player_left', {
        players,
        assignments: getRoomAssignments(code),
        assignmentScores: getRoomAssignmentScores(code),
      });
    }
  });

  socket.on('disconnecting', () => {
    const roomsJoined = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsJoined.forEach((code) => {
      removePlayerFromTrivia(code, socket.id);

      const players = removePlayer(code, socket.id);
      if (players !== null) {
        io.to(code).emit('player_joined', {
          players,
          assignments: getRoomAssignments(code),
          assignmentScores: getRoomAssignmentScores(code),
        });
      }
    });
  });
}

module.exports = { registerRoomHandlers };
