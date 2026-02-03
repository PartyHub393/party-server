const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function generateRoomCode() {
  return Array.from(
    { length: 6 },
    () => LETTERS[Math.floor(Math.random() * LETTERS.length)]
  ).join('')
}

/** @type {Map<string, { hostId: string | null, players: Array<{ id: string, username: string }> }>} */
const rooms = new Map()

function createRoom() {
  let code
  do {
    code = generateRoomCode()
  } while (rooms.has(code))
  rooms.set(code, { hostId: null, players: [] })
  return code
}

function getRoom(code) {
  return rooms.get((code || '').toUpperCase())
}

function setHost(roomCode, socketId) {
  const room = rooms.get(roomCode)
  if (room) room.hostId = socketId
}

function addPlayer(roomCode, socketId, username) {
  const room = rooms.get(roomCode)
  if (!room) return null
  const player = { id: socketId, username: (username || '').trim() || 'Player' }
  room.players.push(player)
  return room.players
}

function removePlayer(roomCode, socketId) {
  const room = rooms.get(roomCode)
  if (!room) return null
  room.players = room.players.filter((p) => p.id !== socketId)
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
  createRoom,
  getRoom,
  setHost,
  addPlayer,
  removePlayer,
  getPlayers,
  rooms,
  removeRoom
}
