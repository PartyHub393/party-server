require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { pool } = require('./db');
const {
  createRoom,
  getRoom,
  setHost,
  addPlayer,
  removePlayer,
  getPlayers,
} = require('./rooms');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ connected: true, time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

app.post('/api/rooms', (req, res) => {
  const roomCode = createRoom();
  res.json({ roomCode });
});

io.on('connection', (socket) => {
  socket.on('host_room', (roomCode) => {
    const code = (roomCode || '').toUpperCase();
    const room = getRoom(code);
    if (!room) {
      socket.emit('host_error', { message: 'Room not found' });
      return;
    }
    socket.join(code);
    setHost(code, socket.id);
    socket.emit('host_joined', { roomCode: code, players: getPlayers(code) });
  });

  socket.on('join_room', ({ roomCode, username }) => {
    const code = (roomCode || '').toUpperCase();
    const room = getRoom(code);
    if (!room) {
      socket.emit('join_error', { message: 'Room not found. Check the code.' });
      return;
    }
    const players = addPlayer(code, socket.id, username);
    if (players === null) {
      socket.emit('join_error', { message: 'Could not join room.' });
      return;
    }
    socket.join(code);
    socket.emit('join_success', { roomCode: code, players });
    socket.to(code).emit('player_joined', { players });
  });

  socket.on('disconnect', () => {
    const roomsJoined = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsJoined.forEach((code) => {
      const players = removePlayer(code, socket.id);
      if (players !== null) {
        io.to(code).emit('player_joined', { players });
      }
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
