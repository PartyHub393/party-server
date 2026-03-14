const { getRoom } = require('../../rooms');
const {
  initializeTriviaGame,
  getTriviaGame,
  setCurrentQuestion,
  recordPlayerAnswer,
  validateAndAwardPoints,
  getLeaderboard,
  endTriviaGame,
} = require('../../games/trivia');

function normalizeCode(roomCode) {
  return (roomCode || '').toUpperCase();
}

function registerGameHandlers(io, socket) {
  socket.on('host_started', ({ roomCode, gameType }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);
    const game = (gameType || '').toLowerCase();

    if (!room) {
      socket.emit('host_error', { message: 'Room not found' });
      return;
    }
    if (room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can start the game.' });
      return;
    }

    if (!['trivia', 'scavenger'].includes(game)) {
      socket.emit('host_error', { message: 'Invalid game type.' });
      return;
    }

    if (game === 'trivia') {
      initializeTriviaGame(code);
    }

    socket.to(code).emit('game_started', { roomCode: code, gameType: game });
  });

  socket.on('broadcast_question', ({ roomCode, question, options }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      socket.emit('host_error', { message: 'Room not found' });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can broadcast questions.' });
      return;
    }

    const trivia = getTriviaGame(code);
    if (trivia) {
      setCurrentQuestion(code, { question, options });
    }

    socket.to(code).emit('new_question', { question, options });
  });

  socket.on('player_trivia_answer', ({ roomCode, username, answerIndex, qid }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room || !room.players.find((player) => player.socketId === socket.id || player.id === socket.id)) {
      socket.emit('player_answered', { message: 'Room not found or not in room' });
      return;
    }

    const trivia = getTriviaGame(code);
    if (trivia) {
      recordPlayerAnswer(code, socket.id, username, answerIndex, qid);
    }

    socket.to(code).emit('player_answered', { username, answerIndex, qid });
  });

  socket.on('reveal_answer', ({ roomCode, question, options, answer }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room || room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can reveal answers.' });
      return;
    }

    const trivia = getTriviaGame(code);
    if (!trivia) {
      socket.emit('host_error', { message: 'Trivia game not found.' });
      return;
    }

    const results = validateAndAwardPoints(code, { question, options, answer });

    io.to(code).emit('answer_revealed', {
      correctAnswer: answer,
      playerResults: results,
    });
  });

  socket.on('get_trivia_leaderboard', ({ roomCode }, callback) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room) {
      socket.emit('leaderboard_error', { message: 'Room not found' });
      return;
    }

    const leaderboard = getLeaderboard(code);
    if (callback) {
      callback({ leaderboard });
    }
  });

  socket.on('end_trivia', ({ roomCode }) => {
    const code = normalizeCode(roomCode);
    const room = getRoom(code);

    if (!room || room.hostId !== socket.id) {
      socket.emit('host_error', { message: 'Only the host can end the trivia game.' });
      return;
    }

    const finalStats = endTriviaGame(code);
    io.to(code).emit('trivia_ended', { finalStats });
  });
}

module.exports = { registerGameHandlers };
