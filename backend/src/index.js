require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const apiRoutes = require('./routes/api');
const setupSockets = require('./sockets/socket');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
});

const PORT = process.env.PORT || 8080;
const frontendDistCandidates = [
  path.resolve(__dirname, '../../frontend/dist'),
  path.resolve(__dirname, '../frontend/dist'),
  path.resolve(process.cwd(), 'frontend/dist'),
];
const frontendDistPath = frontendDistCandidates.find((candidate) => fs.existsSync(candidate)) || frontendDistCandidates[0];
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

app.use(cors());
// Increase JSON body size limit so base64-encoded image uploads for scavenger hunt work
app.use(express.json({ limit: '10mb' }));

app.use('/', apiRoutes);
app.use(express.static(frontendDistPath));

app.get('/', (req, res) => {
  if (!fs.existsSync(frontendIndexPath)) {
    return res.status(503).json({
      error: 'Frontend build not found',
      expectedPath: frontendIndexPath,
    });
  }

  return res.sendFile(frontendIndexPath);
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }

  if (!fs.existsSync(frontendIndexPath)) {
    return res.status(503).json({
      error: 'Frontend build not found',
      expectedPath: frontendIndexPath,
    });
  }

  return res.sendFile(frontendIndexPath);
});

setupSockets(io);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
