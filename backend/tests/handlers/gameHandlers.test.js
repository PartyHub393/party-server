const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
//Uses Node's built-in test runner

//Verifies that registerGameHandles wires events correctly and emits the right socket messages

/*
Creates fake socket objects that capture:
  socket.on handlers
  socket.emit calls
  socket.to().emit() room broadcasts.

Creates fake io to capture io.to(room).emit() calls

Mocks backend dependencies (rooms + games/trivia) so tests run without real room state or DB
*/ 
function loadGameHandlersWithMocks({ roomsMock, triviaMock }) {
  const roomsModulePath = path.resolve(__dirname, '../../src/rooms.js');
  const triviaModulePath = path.resolve(__dirname, '../../src/games/trivia.js');
  const gameHandlersModulePath = path.resolve(__dirname, '../../src/sockets/handlers/gameHandlers.js');

  delete require.cache[roomsModulePath];
  delete require.cache[triviaModulePath];
  delete require.cache[gameHandlersModulePath];

  require.cache[roomsModulePath] = {
    id: roomsModulePath,
    filename: roomsModulePath,
    loaded: true,
    exports: roomsMock,
  };

  require.cache[triviaModulePath] = {
    id: triviaModulePath,
    filename: triviaModulePath,
    loaded: true,
    exports: triviaMock,
  };

  return require(gameHandlersModulePath);
}

function createFakeSocket(id = 'host-1') {
  const handlers = new Map();
  const emits = [];
  const roomEmits = [];

  const socket = {
    id,
    on(event, fn) {
      handlers.set(event, fn);
    },
    emit(event, payload) {
      emits.push({ event, payload });
    },
    to(roomCode) {
      return {
        emit(event, payload) {
          roomEmits.push({ roomCode, event, payload });
        },
      };
    },
  };

  return { socket, handlers, emits, roomEmits };
}

function createFakeIo() {
  const roomEmits = [];
  return {
    to(roomCode) {
      return {
        emit(event, payload) {
          roomEmits.push({ roomCode, event, payload });
        },
      };
    },
    roomEmits,
  };
}

test('host_started(trivia) initializes game and broadcasts game_started', () => {
  const io = createFakeIo();
  const { socket, handlers, emits, roomEmits } = createFakeSocket('host-1');
  const room = { hostId: 'host-1', players: [], activeGame: null };

  let initCalledWith = null;
  const { registerGameHandlers } = loadGameHandlersWithMocks({
    roomsMock: {
      getRoom: () => room,
    },
    triviaMock: {
      initializeTriviaGame: (code) => {
        initCalledWith = code;
        return { roomCode: code };
      },
      getTriviaGame: () => null,
      setCurrentQuestion: () => {},
      recordPlayerAnswer: () => {},
      validateAndAwardPoints: () => ({}),
      getLeaderboard: () => [],
      endTriviaGame: () => null,
    },
  });

  registerGameHandlers(io, socket);

  handlers.get('host_started')({ roomCode: 'abc123', gameType: 'trivia' });

  assert.equal(initCalledWith, 'ABC123');
  assert.equal(room.activeGame, 'trivia');
  assert.equal(emits.length, 0);
  assert.deepEqual(roomEmits[0], {
    roomCode: 'ABC123',
    event: 'game_started',
    payload: { roomCode: 'ABC123', gameType: 'trivia' },
  });
});

test('get_trivia_state returns current question when trivia is active', () => {
  const io = createFakeIo();
  const { socket, handlers } = createFakeSocket('player-1');
  const currentQuestion = { question: 'Q1', options: ['A', 'B', 'C', 'D'] };

  const { registerGameHandlers } = loadGameHandlersWithMocks({
    roomsMock: {
      getRoom: () => ({ hostId: 'host-1', players: [], activeGame: 'trivia' }),
    },
    triviaMock: {
      initializeTriviaGame: () => {},
      getTriviaGame: () => ({ currentQuestion }),
      setCurrentQuestion: () => {},
      recordPlayerAnswer: () => {},
      validateAndAwardPoints: () => ({}),
      getLeaderboard: () => [],
      endTriviaGame: () => null,
    },
  });

  registerGameHandlers(io, socket);

  let callbackPayload = null;
  handlers.get('get_trivia_state')({ roomCode: 'abc123' }, (payload) => {
    callbackPayload = payload;
  });

  assert.deepEqual(callbackPayload, {
    activeGame: 'trivia',
    currentQuestion,
  });
});

test('broadcast_question host can broadcast; sends new_question', () => {
  const io = createFakeIo();
  const { socket, handlers, emits, roomEmits } = createFakeSocket('host-1');

  let setCurrentQuestionCalled = 0;
  const { registerGameHandlers } = loadGameHandlersWithMocks({
    roomsMock: {
      getRoom: () => ({ hostId: 'host-1', players: [], activeGame: 'trivia' }),
    },
    triviaMock: {
      initializeTriviaGame: () => {},
      getTriviaGame: () => ({ roomCode: 'ABC123' }),
      setCurrentQuestion: () => {
        setCurrentQuestionCalled += 1;
      },
      recordPlayerAnswer: () => {},
      validateAndAwardPoints: () => ({}),
      getLeaderboard: () => [],
      endTriviaGame: () => null,
    },
  });

  registerGameHandlers(io, socket);

  handlers.get('broadcast_question')({
    roomCode: 'abc123',
    question: 'Q1',
    options: ['A', 'B', 'C', 'D'],
    timeLimit: 20,
    questionLimit: 10,
  });

  assert.equal(setCurrentQuestionCalled, 1);
  assert.deepEqual(roomEmits[0], {
    roomCode: 'ABC123',
    event: 'new_question',
    payload: { question: 'Q1', options: ['A', 'B', 'C', 'D'] },
  });
  assert.equal(emits.length, 0);
});

test('player_trivia_answer records and notifies room when player is in room', () => {
  const io = createFakeIo();
  const { socket, handlers, emits, roomEmits } = createFakeSocket('player-1');

  let recordCalled = 0;
  const { registerGameHandlers } = loadGameHandlersWithMocks({
    roomsMock: {
      getRoom: () => ({
        hostId: 'host-1',
        players: [{ id: 'player-1', socketId: 'player-1', username: 'Sam' }],
      }),
    },
    triviaMock: {
      initializeTriviaGame: () => {},
      getTriviaGame: () => ({ roomCode: 'ABC123' }),
      setCurrentQuestion: () => {},
      recordPlayerAnswer: () => {
        recordCalled += 1;
      },
      validateAndAwardPoints: () => ({}),
      getLeaderboard: () => [],
      endTriviaGame: () => null,
    },
  });

  registerGameHandlers(io, socket);

  handlers.get('player_trivia_answer')({
    roomCode: 'abc123',
    username: 'Sam',
    answerIndex: 2,
    qid: 99,
  });

  assert.equal(recordCalled, 1);
  assert.deepEqual(roomEmits[0], {
    roomCode: 'ABC123',
    event: 'player_answered',
    payload: { username: 'Sam', answerIndex: 2, qid: 99 },
  });
  assert.equal(emits.length, 0);
});

test('reveal_answer computes results and emits answer_revealed to room', () => {
  const io = createFakeIo();
  const { socket, handlers, emits } = createFakeSocket('host-1');

  const fakeResults = {
    'player-1': { username: 'Sam', points: 50, correct: true, totalScore: 50 },
  };

  const { registerGameHandlers } = loadGameHandlersWithMocks({
    roomsMock: {
      getRoom: () => ({ hostId: 'host-1', players: [], activeGame: 'trivia' }),
    },
    triviaMock: {
      initializeTriviaGame: () => {},
      getTriviaGame: () => ({ roomCode: 'ABC123' }),
      setCurrentQuestion: () => {},
      recordPlayerAnswer: () => {},
      validateAndAwardPoints: () => fakeResults,
      getLeaderboard: () => [],
      endTriviaGame: () => null,
    },
  });

  registerGameHandlers(io, socket);

  handlers.get('reveal_answer')({
    roomCode: 'abc123',
    question: 'Q1',
    options: ['A', 'B', 'C', 'D'],
    answer: 'C',
  });

  assert.equal(emits.length, 0);
  assert.deepEqual(io.roomEmits[0], {
    roomCode: 'ABC123',
    event: 'answer_revealed',
    payload: {
      correctAnswer: 'C',
      playerResults: fakeResults,
    },
  });
});

test('end_game host only; emits game_ended with finalStats', () => {
  const io = createFakeIo();
  const { socket, handlers, emits } = createFakeSocket('host-1');

  const finalStats = { roomCode: 'ABC123', boardsAsked: 5, finalScores: [] };

  const { registerGameHandlers } = loadGameHandlersWithMocks({
    roomsMock: {
      getRoom: () => ({ hostId: 'host-1', players: [], activeGame: 'trivia' }),
    },
    triviaMock: {
      initializeTriviaGame: () => {},
      getTriviaGame: () => ({ roomCode: 'ABC123' }),
      setCurrentQuestion: () => {},
      recordPlayerAnswer: () => {},
      validateAndAwardPoints: () => ({}),
      getLeaderboard: () => [],
      endTriviaGame: () => finalStats,
    },
  });

  registerGameHandlers(io, socket);

  handlers.get('end_game')({ roomCode: 'abc123' });

  assert.equal(emits.length, 0);
  assert.deepEqual(io.roomEmits[0], {
    roomCode: 'ABC123',
    event: 'game_ended',
    payload: { finalStats },
  });
});