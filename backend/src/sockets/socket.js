const {
  createRoomWithCode,
  getRoom,
  setHost,
  addPlayer,
  removePlayer,
  getPlayers,
  removeRoom,
} = require('../rooms');
const { pool } = require('../db');

const {
  initializeTriviaGame,
  getTriviaGame,
  setCurrentQuestion,
  recordPlayerAnswer,
  validateAndAwardPoints,
  getLeaderboard,
  endTriviaGame,
  removePlayerFromTrivia,
} = require('../games/trivia');

module.exports = function(io) {
  io.on('connection', (socket) => {
    socket.on('host_room', async (roomCode) => {
      const code = (roomCode || '').toUpperCase();
      const userId = socket.handshake.auth?.userId;

      // If the room is not in memory yet, verify it exists in the DB and then create it in-memory.
      let room = getRoom(code);
      if (!room) {
        try {
          const res = await pool.query('SELECT created_by FROM groups WHERE code = $1', [code]);
          if (res.rows.length === 0) {
            socket.emit('host_error', { message: 'Room not found' });
            return;
          }

          const createdBy = res.rows[0].created_by;
          if (userId && createdBy && userId !== createdBy) {
            socket.emit('host_error', { message: 'You are not the owner of this room.' });
            return;
          }

          await createRoomWithCode(code, { hostSocketId: socket.id, hostUserId: userId });
          room = getRoom(code);
        } catch (err) {
          socket.emit('host_error', { message: 'Room not found' });
          return;
        }
      }

      socket.join(code);
      setHost(code, socket.id);
      socket.emit('host_joined', { roomCode: code, players: getPlayers(code) });
    });

    socket.on('join_room', async ({ roomCode, username }) => {
      const code = (roomCode || '').toUpperCase();
      const userId = socket.handshake.auth?.userId;
      let room = getRoom(code);

      // If the room is missing, only allow join if the group exists in the DB.
      if (!room) {
        try {
          const res = await pool.query('SELECT id, is_locked FROM groups WHERE code = $1', [code]);
          if (res.rows.length === 0) {
            socket.emit('join_error', { message: 'Room not found. Check the code.' });
            return;
          }

          const groupId = res.rows[0].id;
          const isLocked = res.rows[0].is_locked;

          if (isLocked) {
            if (!userId) {
              socket.emit('join_error', { message: 'This lobby is locked. New members cannot join right now.' });
              return;
            }

            const memberRes = await pool.query(
              'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
              [groupId, userId]
            );
            if (memberRes.rows.length === 0) {
              socket.emit('join_error', { message: 'This lobby is locked. New members cannot join right now.' });
              return;
            }
          }

          if (userId) {
            // Persist membership so the room can be reconstructed after a restart.
            await pool.query(
              `INSERT INTO group_members (group_id, user_id)
               VALUES ($1, $2)
               ON CONFLICT (group_id, user_id) DO NOTHING`,
              [groupId, userId]
            );
          }

          await createRoomWithCode(code);
          room = getRoom(code);
        } catch (err) {
          socket.emit('join_error', { message: 'Room not found. Check the code.' });
          return;
        }
      } else if (userId) {
        // Ensure membership is persisted even if the room already exists in memory.
        try {
          const groupRes = await pool.query('SELECT id, is_locked FROM groups WHERE code = $1', [code]);
          if (groupRes.rows.length) {
            const groupId = groupRes.rows[0].id;
            const isLocked = groupRes.rows[0].is_locked;

            if (isLocked) {
              const memberRes = await pool.query(
                'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
                [groupId, userId]
              );
              if (memberRes.rows.length === 0) {
                socket.emit('join_error', { message: 'This lobby is locked. New members cannot join right now.' });
                return;
              }
            }

            await pool.query(
              `INSERT INTO group_members (group_id, user_id)
               VALUES ($1, $2)
               ON CONFLICT (group_id, user_id) DO NOTHING`,
              [groupId, userId]
            );
          }
        } catch (err) {
          // Shouldn't get here honestly
          socket.emit('join_error', { message: 'Room not found. Check the code.' });
          console.warn('Failed to persist group membership to DB:', err);
        }
      } else {
        try {
          const groupRes = await pool.query('SELECT is_locked FROM groups WHERE code = $1', [code]);
          if (groupRes.rows.length && groupRes.rows[0].is_locked) {
            socket.emit('join_error', { message: 'This lobby is locked. New members cannot join right now.' });
            return;
          }
        } catch (err) {
          // Shouldn't get here honestly
          socket.emit('join_error', { message: 'Room not found. Check the code.' });
          console.warn('Failed to check if group is locked in DB:', err);
        }
      }

      const players = addPlayer(code, socket.id, username, { userId });
      if (players === null) {
        socket.emit('join_error', { message: 'Could not join room.' });
        return;
      }
      socket.join(code);
      socket.emit('join_success', { roomCode: code, players });
      socket.to(code).emit('player_joined', { players });
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
    socket.on('host_started', ({roomCode,gameType}) => {
      const code = (roomCode || '').toUpperCase();
      const room = getRoom(code);
      const game = (gameType || '').toLowerCase();
      if (!room) {
        socket.emit('host_error', {message: 'Room not found'});
        return;
      }
      if (room.hostId !== socket.id) {
        socket.emit('host_error', {message: 'Only the host can start the game.'});
        return;
      }
  
      if (!['trivia', 'scavenger'].includes(game)) {
        socket.emit('host_error', {message: 'Invalid game type.'});
        return;
      }

      if (game === 'trivia') {
        initializeTriviaGame(code);
      }

      socket.to(code).emit('game_started',{roomCode: code, gameType: game}); 

    }); 
    socket.on('broadcast_question', ({ roomCode, question, options }) => {  
      const code = (roomCode || '').toUpperCase();
      const room = getRoom(code);

      if (!room) {
        socket.emit('host_error', { message: 'Room not found' });
        return;
      }

      if(room.hostId !== socket.id) {
        socket.emit('host_error', { message: 'Only the host can broadcast questions.' });
        return;
      }

      const trivia = getTriviaGame(code);
      if (trivia) {
        setCurrentQuestion(code, { question, options });
      }

      socket.to(code).emit('new_question', { question, options });

    });
    socket.on('player_trivia_answer',({roomCode,username,answerIndex,qid}) => {
      const code = (roomCode || '').toUpperCase();
      const room = getRoom(code);

      if (!room || !room.players.find(p => p.socketId === socket.id || p.id === socket.id)) {
        socket.emit('player_answered', { message: 'Room not found or not in room' });
        return;
      }

      const trivia = getTriviaGame(code);
      if (trivia) {
        recordPlayerAnswer(code, socket.id, username, answerIndex, qid);
      }

      socket.to(code).emit('player_answered',{username,answerIndex,qid});
    });

    socket.on('get_player_count',({roomCode}, callback) => {
      const code = (roomCode || '').toUpperCase();
      const room = getRoom(code);

      if (!room) {
        socket.emit('player_count_error', { message: 'Room not found' });
        return;
      }

      callback({ count: room.players.length });
      return;
      
    });

    socket.on('reveal_answer', ({ roomCode, question, options, answer }) => {
      const code = (roomCode || '').toUpperCase();
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

      // Validate and award points for all player answers
      const results = validateAndAwardPoints(code, { question, options, answer });

      // Emit answer reveal and results to all players
      io.to(code).emit('answer_revealed', {
        correctAnswer: answer,
        playerResults: results,
      });
    });

    socket.on('get_trivia_leaderboard', ({ roomCode }, callback) => {
      const code = (roomCode || '').toUpperCase();
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
      const code = (roomCode || '').toUpperCase();
      const room = getRoom(code);

      if (!room || room.hostId !== socket.id) {
        socket.emit('host_error', { message: 'Only the host can end the trivia game.' });
        return;
      }

      const finalStats = endTriviaGame(code);
      io.to(code).emit('trivia_ended', { finalStats });
    });

    socket.on('disconnect', () => {
      const roomsJoined = Array.from(socket.rooms).filter((r) => r !== socket.id);
      roomsJoined.forEach((code) => {
        // Clean up trivia player data
        removePlayerFromTrivia(code, socket.id);

        const players = removePlayer(code, socket.id);
        if (players !== null) {
          io.to(code).emit('player_joined', { players });
        }
      });
    });
  });
};