require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { pool } = require('./db');
const { hash, compare } = require('bcrypt')
const {
  createRoom,
  getRoom,
  setHost,
  addPlayer,
  removePlayer,
  getPlayers,
  removeRoom,
} = require('./rooms');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
});

const questions = require('./data/questions.json');

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

app.post('/api/createaccount', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }

  try {
    const passwordHash = await hash(password, 10);

    const queryText = `
      INSERT INTO users (username, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, username, email, created_at;
    `;

    const values = [username, email, passwordHash];
    const result = await pool.query(queryText, values);

    res.status(201).json({
      message: 'User created successfully',
      user: result.rows[0]
    });
    
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or Email already exists.' });
    }
    
    console.error('Database Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
})

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const queryText = 'SELECT * FROM users WHERE username = $1';
  const result = await pool.query(queryText, [username]);

  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const user = result.rows[0];

  const isMatch = await compare(password, user.password_hash);

  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (err) { 
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
})

app.get('/api/trivia/random', (req, res) => {
  const seenIds = req.query.seen ? req.query.seen.split(',').map(Number) : [];

  const availableQuestions = questions.filter(q => !seenIds.includes(q.id));

  if (availableQuestions.length === 0) {
    return res.status(404).json({ message: "No more new questions!" });
  }

  const randomIndex = Math.floor(Math.random() * availableQuestions.length);
  res.json(availableQuestions[randomIndex]);
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

  socket.on('host_closed', () => {
    const roomsJoined = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsJoined.forEach((code) => {
      io.to(code).emit('room_closed', { 
        message: 'The host has ended the session.' 
      });

      io.in(code).socketsLeave(code);

      removeRoom(code);
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
