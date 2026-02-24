const {
  getRoom,
  setHost,
  addPlayer,
  removePlayer,
  getPlayers,
  removeRoom,
} = require('../rooms');

module.exports = function(io) {
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

      socket.to(code).emit('new_question', { question, options });

    });
    socket.on('trivia_answer',({roomCode,username,answerIndex,qid}) => {
      const code = (roomCode || '').toUpperCase();
      const room = getRoom(code);

      if (!room) {
        socket.emit('trivia_feedback', { message: 'Room not found' });
        return;
      }
      socket.to(code).emit('trivia_feedback',{message: `${username} answered!`});
    });
  });
};