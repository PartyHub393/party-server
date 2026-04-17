const { pool } = require('./db')
const {
  normalizeRoomCode,
  getRoomByCode,
  setRoomByCode,
  hasRoom,
  deleteRoomByCode,
} = require('./roomStore')
const {
  buildRoomAssignments,
  assignPlayerGroupInRoom,
  clearAssignmentsInRoom,
  setAssignmentScoreInRoom,
  getAssignmentScoresFromRoom,
  deleteAssignmentGroupInRoom,
  autoAssignPlayersInRoom,
} = require('./roomAssignments')
const {
  resolveGroupByCode,
  loadRoomSnapshot,
} = require('./roomPersistence')

async function createRoomWithCode(code, { hostSocketId, hostUserId } = {}) {
  const normalized = normalizeRoomCode(code);
  if (!normalized) return null;

  let groupMeta = null;
  try {
    groupMeta = await resolveGroupByCode(pool, normalized);
    if (!groupMeta) return null;

    if (hostUserId && groupMeta.createdBy !== hostUserId) return null;
  } catch (err) {
    return null;
  }

  if (!hasRoom(normalized)) {
    try {
      const snapshot = await loadRoomSnapshot(pool, groupMeta.groupId);
      setRoomByCode(normalized, {
        hostId: null,
        players: snapshot.players,
        assignmentScores: snapshot.assignmentScores,
        activeGame: null,
      });
    } catch (err) {
      // If member preload fails, we still create the room; it will populate as users join.
      console.warn('Failed to preload room members from DB:', err);
      setRoomByCode(normalized, {
        hostId: null,
        players: [],
        assignmentScores: {},
        activeGame: null,
      });
    }
  }

  if (hostSocketId) {
    const room = getRoomByCode(normalized);
    if (room) {
      room.hostId = hostSocketId;
    }
  }

  return normalized;
}

function getRoom(code) {
  return getRoomByCode(code)
}

function setHost(roomCode, socketId) {
  const room = getRoomByCode(roomCode)
  if (room) room.hostId = socketId
}

function addPlayer(roomCode, socketId, username, { userId } = {}) {
  const room = getRoomByCode(roomCode)
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
      assignedGroup: null,
    }
    room.players.push(player)
  }

  return room.players
}

function removePlayer(roomCode, socketId) {
  const room = getRoomByCode(roomCode)
  if (!room) return null

  const player = room.players.find((p) => p.socketId === socketId)
  if (!player) return room.players

  // Keep the player in the list (so hosts can see who disconnected), but mark as offline.
  player.online = false
  return room.players
}

function removePlayerPermanently(roomCode, playerId) {
  const room = getRoomByCode(roomCode)
  if (!room) return null

  const before = room.players.length
  room.players = room.players.filter((p) => p.id !== playerId)
  if (room.players.length === before) return room.players

  return room.players
}

function getPlayers(roomCode) {
  const room = getRoomByCode(roomCode)
  return room ? room.players : []
}

function assignPlayerToGroup(roomCode, playerId, assignedGroup) {
  const room = getRoomByCode(roomCode);
  return assignPlayerGroupInRoom(room, playerId, assignedGroup);
}

function clearRoomAssignments(roomCode) {
  const room = getRoomByCode(roomCode);
  return clearAssignmentsInRoom(room);
}

function getRoomAssignments(roomCode) {
  const room = getRoomByCode(roomCode);
  if (!room) return {};
  return buildRoomAssignments(room.players);
}

function setRoomAssignmentScore(roomCode, assignmentName, score) {
  const room = getRoomByCode(roomCode);
  return setAssignmentScoreInRoom(room, assignmentName, score);
}

function getRoomAssignmentScores(roomCode) {
  const room = getRoomByCode(roomCode);
  return getAssignmentScoresFromRoom(room);
}

function deleteAssignmentGroup(roomCode, assignmentName) {
  const room = getRoomByCode(roomCode);
  return deleteAssignmentGroupInRoom(room, assignmentName);
}

function autoAssignPlayersToGroups(roomCode, targetSize = 5) {
  const room = getRoomByCode(roomCode);
  return autoAssignPlayersInRoom(room, targetSize);
}

function removeRoom(roomCode) {
  const code = normalizeRoomCode(roomCode);

  if (deleteRoomByCode(code)) {
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
  removeRoom,
  assignPlayerToGroup,
  clearRoomAssignments,
  getRoomAssignments,
  setRoomAssignmentScore,
  getRoomAssignmentScores,
  deleteAssignmentGroup,
  autoAssignPlayersToGroups,
}
