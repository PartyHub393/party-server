require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const apiRoutes = require('./routes/api');
const setupSockets = require('./sockets/socket');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
});

const PORT = process.env.PORT || 4000;

app.use(cors());
// Increase JSON body size limit so base64-encoded image uploads for scavenger hunt work
app.use(express.json({ limit: '10mb' }));

app.use('/', apiRoutes);

setupSockets(io);

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
