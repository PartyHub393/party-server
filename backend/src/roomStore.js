/** @type {Map<string, { hostId: string | null, players: Array<any>, assignmentScores?: Record<string, number> }>} */
const rooms = new Map();

function normalizeRoomCode(code) {
  return (code || '').toUpperCase();
}

function getRoomByCode(code) {
  return rooms.get(normalizeRoomCode(code));
}

function setRoomByCode(code, room) {
  rooms.set(normalizeRoomCode(code), room);
}

function hasRoom(code) {
  return rooms.has(normalizeRoomCode(code));
}

function deleteRoomByCode(code) {
  return rooms.delete(normalizeRoomCode(code));
}

module.exports = {
  rooms,
  normalizeRoomCode,
  getRoomByCode,
  setRoomByCode,
  hasRoom,
  deleteRoomByCode,
};
