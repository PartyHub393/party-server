const triviaGames = new Map();

function initializeTriviaGame(roomCode) {
  const triviaState = {
    roomCode,
    currentQuestion: null,
    playerAnswers: new Map(),
    playerScores: new Map(), 
    questionStartTime: null,
    totalQuestionsAsked: 0,
  };
  
  triviaGames.set(roomCode, triviaState);
  return triviaState;
}

function getTriviaGame(roomCode) {
  return triviaGames.get(roomCode) || null;
}

function setCurrentQuestion(roomCode, question) {
  const trivia = getTriviaGame(roomCode);
  if (trivia) {
    trivia.currentQuestion = question;
    trivia.playerAnswers.clear();
    trivia.questionStartTime = Date.now();
    trivia.totalQuestionsAsked++;
  }
}


function recordPlayerAnswer(roomCode, playerId, username, answerIndex, qid) {
  const trivia = getTriviaGame(roomCode);
  if (!trivia) return null;

  trivia.playerAnswers.set(playerId, {
    username,
    answerIndex,
    qid,
    timestamp: Date.now(),
  });

  return true;
}

function calculatePoints(questionData, answerIndex, timeTakenMs) {
  if (!questionData || questionData.options[answerIndex] !== questionData.answer) {
    return 0;
  }

  const maxTime = 30000;
  const timeBonus = Math.max(0, 100 - Math.floor(timeTakenMs / 300));
  
  return Math.max(10, timeBonus);
}

function validateAndAwardPoints(roomCode, questionData) {
  const trivia = getTriviaGame(roomCode);
  if (!trivia || !trivia.currentQuestion) return {};

  const results = {};

  trivia.playerAnswers.forEach((answerData, playerId) => {
    const timeTaken = Date.now() - trivia.questionStartTime;
    const pointsEarned = calculatePoints(
      questionData,
      answerData.answerIndex,
      timeTaken
    );

    const isCorrect = pointsEarned > 0;

    const currentScore = trivia.playerScores.get(playerId) || 0;
    trivia.playerScores.set(playerId, currentScore + pointsEarned);

    results[playerId] = {
      username: answerData.username,
      points: pointsEarned,
      correct: isCorrect,
      totalScore: currentScore + pointsEarned,
    };
  });

  return results;
}

function getPlayerScores(roomCode) {
  const trivia = getTriviaGame(roomCode);
  if (!trivia) return [];

  const scores = [];
  trivia.playerScores.forEach((score, playerId) => {
    const playerAnswer = Array.from(trivia.playerAnswers.values()).find(
      (ans) => ans.username
    );
    scores.push({
      playerId,
      score,
    });
  });

  return scores.sort((a, b) => b.score - a.score);
}

function getLeaderboard(roomCode) {
  return getPlayerScores(roomCode);
}

function resetPlayerScore(roomCode, playerId) {
  const trivia = getTriviaGame(roomCode);
  if (trivia) {
    trivia.playerScores.set(playerId, 0);
  }
}


function endTriviaGame(roomCode) {
  const trivia = getTriviaGame(roomCode);
  if (!trivia) return null;

  const finalStats = {
    roomCode,
    boardsAsked: trivia.totalQuestionsAsked,
    finalScores: getPlayerScores(roomCode),
  };

  triviaGames.delete(roomCode);
  return finalStats;
}

function removePlayerFromTrivia(roomCode, playerId) {
  const trivia = getTriviaGame(roomCode);
  if (trivia) {
    trivia.playerAnswers.delete(playerId);
  }
}

module.exports = {
  initializeTriviaGame,
  getTriviaGame,
  setCurrentQuestion,
  recordPlayerAnswer,
  calculatePoints,
  validateAndAwardPoints,
  getPlayerScores,
  getLeaderboard,
  resetPlayerScore,
  endTriviaGame,
  removePlayerFromTrivia,
};
