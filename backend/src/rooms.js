const { pool } = require('./db')

/** @type {Map<string, { hostId: string | null, players: Array<{ id: string, username: string, joinedAt?: string }> }>} */
const rooms = new Map()

async function createRoomWithCode(code, { hostSocketId, hostUserId } = {}) {
  const normalized = (code || '').toUpperCase();
  if (!normalized) return null;

  // Validate that the group exists in the DB and (optionally) is owned by the expected host.
  let groupId = null;

  try {
    const res = await pool.query(
      'SELECT id, created_by FROM groups WHERE code = $1',
      [normalized]
    );
    if (res.rows.length === 0) return null;

    groupId = res.rows[0].id;
    const createdBy = res.rows[0].created_by;
    if (hostUserId && createdBy !== hostUserId) return null;
  } catch (err) {
    return null;
  }

  if (!rooms.has(normalized)) {
    const players = [];

    // Preload existing group members from the database so the room can be rebuilt after restarts.
    try {
      const membersRes = await pool.query(
        `SELECT u.id as user_id, u.username, gm.joined_at
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = $1`,
        [groupId]
      );

      for (const row of membersRes.rows) {
        players.push({
          id: row.user_id,
          userId: row.user_id,
          socketId: null,
          username: row.username || 'Player',
          joinedAt: row.joined_at ? new Date(row.joined_at).toISOString() : null,
          online: false,
        });
      }
    } catch (err) {
      // If member preload fails, we still create the room; it will populate as users join.
      console.warn('Failed to preload room members from DB:', err);
    }

    rooms.set(normalized, { hostId: null, players });
  }

  if (hostSocketId) {
    const room = rooms.get(normalized);
    if (room) {
      room.hostId = hostSocketId;
    }
  }

  return normalized;
}

function getRoom(code) {
  return rooms.get((code || '').toUpperCase())
}

function setHost(roomCode, socketId) {
  const room = rooms.get(roomCode)
  if (room) room.hostId = socketId
}

function addPlayer(roomCode, socketId, username, { userId } = {}) {
  const room = rooms.get(roomCode)
  if (!room) return null

  const normalizedName = (username || '').trim() || 'Player'

  // Uses the userId and if not use the socketId as a stable identifier for the player across reconnects and multiple devices.
  const stableId = userId || socketId

  // Try to find an existing player entry by userId (for logged-in users) or current socketId.
  let player = null
  if (userId) {
    player = room.players.find((p) => p.userId === userId)
  }
  if (!player) {
    player = room.players.find((p) => p.socketId === socketId)
  }

  if (player) {
    // Existing player reconnecting (or rejoining) - update state.
    player.userId = userId || player.userId || null
    player.socketId = socketId
    player.id = stableId
    player.username = normalizedName
    player.joinedAt = player.joinedAt || new Date().toISOString()
    player.online = true
  } else {
    // New player joining for the first time.
    player = {
      id: stableId,
      userId: userId || null,
      socketId,
      username: normalizedName,
      joinedAt: new Date().toISOString(),
      online: true,
    }
    room.players.push(player)
  }

  return room.players
}

function removePlayer(roomCode, socketId) {
  const room = rooms.get(roomCode)
  if (!room) return null

  const player = room.players.find((p) => p.socketId === socketId)
  if (!player) return room.players

  // Keep the player in the list (so hosts can see who disconnected), but mark as offline.
  player.online = false
  return room.players
}

function removePlayerPermanently(roomCode, playerId) {
  const room = rooms.get(roomCode)
  if (!room) return null

  const before = room.players.length
  room.players = room.players.filter((p) => p.id !== playerId)
  if (room.players.length === before) return room.players

  return room.players
}

function getPlayers(roomCode) {
  const room = rooms.get(roomCode)
  return room ? room.players : []
}

function removeRoom(roomCode) {
  const code = (roomCode || '').toUpperCase();

  if (rooms.has(code)) {
    rooms.delete(code);
    console.log(`Room ${code} deleted.`);
    return true;
  }
  return false;
}

module.exports = {
  createRoomWithCode,
  getRoom,
  setHost,
  addPlayer,
  removePlayer,
  removePlayerPermanently,
  getPlayers,
  removeRoom
}
