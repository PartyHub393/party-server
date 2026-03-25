function normalizeAssignedGroup(assignedGroup) {
  const value = typeof assignedGroup === 'string' ? assignedGroup.trim() : '';
  return value || null;
}

function buildRoomAssignments(players = []) {
  /** @type {Record<string, string[]>} */
  const assignments = {};

  for (const player of players) {
    const groupName = normalizeAssignedGroup(player.assignedGroup);
    if (!groupName) continue;
    if (!assignments[groupName]) assignments[groupName] = [];
    assignments[groupName].push(player.id);
  }

  return assignments;
}

function assignPlayerGroupInRoom(room, playerId, assignedGroup) {
  if (!room) return null;
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) return null;

  const normalizedGroup = normalizeAssignedGroup(assignedGroup);
  player.assignedGroup = normalizedGroup;

  if (normalizedGroup) {
    room.assignmentScores = room.assignmentScores || {};
    if (typeof room.assignmentScores[normalizedGroup] !== 'number') {
      room.assignmentScores[normalizedGroup] = 0;
    }
  }

  return player;
}

function clearAssignmentsInRoom(room) {
  if (!room) return null;

  for (const player of room.players) {
    player.assignedGroup = null;
  }

  return room.players;
}

function setAssignmentScoreInRoom(room, assignmentName, score) {
  if (!room) return null;

  const normalizedName = normalizeAssignedGroup(assignmentName);
  if (!normalizedName) return null;

  const parsedScore = Number(score);
  if (!Number.isFinite(parsedScore)) return null;

  room.assignmentScores = room.assignmentScores || {};
  room.assignmentScores[normalizedName] = Math.trunc(parsedScore);
  return room.assignmentScores[normalizedName];
}

function getAssignmentScoresFromRoom(room) {
  if (!room || !room.assignmentScores) return {};
  return { ...room.assignmentScores };
}

function deleteAssignmentGroupInRoom(room, assignmentName) {
  if (!room) return null;

  const normalizedName = normalizeAssignedGroup(assignmentName);
  if (!normalizedName) return null;

  for (const player of room.players) {
    if (normalizeAssignedGroup(player.assignedGroup) === normalizedName) {
      player.assignedGroup = null;
    }
  }

  if (room.assignmentScores && Object.prototype.hasOwnProperty.call(room.assignmentScores, normalizedName)) {
    delete room.assignmentScores[normalizedName];
  }

  return {
    players: room.players,
    assignmentScores: room.assignmentScores || {},
  };
}

function autoAssignPlayersInRoom(room, targetSize = 5) {
  if (!room) return null;

  const parsedTarget = Number(targetSize);
  const normalizedTarget = Number.isFinite(parsedTarget) ? Math.max(1, Math.trunc(parsedTarget)) : 5;
  const players = [...room.players].sort((a, b) => {
    const aTs = a.joinedAt ? Date.parse(a.joinedAt) : Number.MAX_SAFE_INTEGER;
    const bTs = b.joinedAt ? Date.parse(b.joinedAt) : Number.MAX_SAFE_INTEGER;
    if (aTs !== bTs) return aTs - bTs;
    return String(a.username || a.id).localeCompare(String(b.username || b.id));
  });

  const groupCount = Math.max(1, Math.ceil(players.length / normalizedTarget));
  const groupNames = Array.from({ length: groupCount }, (_, idx) => `Team ${idx + 1}`);

  const nextScores = {};
  for (const name of groupNames) {
    const previous = room.assignmentScores?.[name];
    nextScores[name] = typeof previous === 'number' ? previous : 0;
  }

  players.forEach((player, index) => {
    const groupIndex = index % groupCount;
    player.assignedGroup = groupNames[groupIndex];
  });

  room.assignmentScores = nextScores;

  return {
    players: room.players,
    assignmentScores: room.assignmentScores,
  };
}

module.exports = {
  normalizeAssignedGroup,
  buildRoomAssignments,
  assignPlayerGroupInRoom,
  clearAssignmentsInRoom,
  setAssignmentScoreInRoom,
  getAssignmentScoresFromRoom,
  deleteAssignmentGroupInRoom,
  autoAssignPlayersInRoom,
};
