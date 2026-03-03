const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { hash, compare } = require('bcrypt');
const { createRoom } = require('../rooms');
const questions = require('../data/questions.json');
const scavengerChallenges = require('../data/scavengerChallenges.json');

// Simple in-memory scavenger state for a single team/session.
// In a production system this would be keyed by room/session and persisted in the database.
// submissions: { id, challengeId, imageData, playerName, approved, comment, createdAt }
const scavengerState = {
  teamName: '',
  totalPoints: 0,
  completedChallengeIds: [],
  submissions: [],
};

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ connected: true, time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// --- Scavenger Hunt APIs ---

// Get static scavenger challenges grouped by category
router.get('/api/scavenger/challenges', (req, res) => {
  res.json(scavengerChallenges);
});

// Get current scavenger team state and derived metrics
router.get('/api/scavenger/state', (req, res) => {
  const { teamName, totalPoints, completedChallengeIds, submissions } = scavengerState;

  const categories = scavengerChallenges.categories || [];
  const categoryStats = categories.map((cat) => {
    const total = cat.challenges.length;
    const completed = cat.challenges.filter((c) =>
      completedChallengeIds.includes(c.id)
    ).length;
    return {
      id: cat.id,
      name: cat.name,
      totalChallenges: total,
      completedChallenges: completed,
    };
  });

  res.json({
    teamName,
    totalPoints,
    challengesCompleted: completedChallengeIds.length,
    categoryStats,
    submissions,
  });
});

// Set or update the scavenger team name
router.post('/api/scavenger/team', (req, res) => {
  const { teamName } = req.body;
  if (!teamName || !teamName.trim()) {
    return res.status(400).json({ error: 'Team name is required.' });
  }
  scavengerState.teamName = teamName.trim();
  return res.json({ teamName: scavengerState.teamName });
});

// Player submits a scavenger hunt photo for a specific challenge
router.post('/api/scavenger/submit', (req, res) => {
  const { challengeId, imageData, playerName } = req.body;

  if (!challengeId || !imageData) {
    return res.status(400).json({ error: 'challengeId and imageData are required.' });
  }

  // Basic validation to allow only images (data URL form)
  if (typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Only image uploads are allowed.' });
  }

  // Ensure the challenge exists
  const categories = scavengerChallenges.categories || [];
  const category = categories.find((cat) =>
    cat.challenges.some((c) => c.id === challengeId)
  );
  if (!category) {
    return res.status(400).json({ error: 'Unknown challengeId.' });
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const submission = {
    id,
    challengeId,
    imageData,
    playerName: (playerName || 'Player').trim(),
    approved: null, // null = pending, true/false after review
    comment: '',
    createdAt: new Date().toISOString(),
  };

  scavengerState.submissions.push(submission);

  return res.status(201).json({ submission });
});

// Host reviews a submission: approve or deny, with optional comment
router.post('/api/scavenger/review', (req, res) => {
  const { submissionId, approved, comment } = req.body;

  if (!submissionId || typeof approved !== 'boolean') {
    return res.status(400).json({ error: 'submissionId and approved (boolean) are required.' });
  }

  const submission = scavengerState.submissions.find((s) => s.id === submissionId);
  if (!submission) {
    return res.status(404).json({ error: 'Submission not found.' });
  }

  submission.approved = approved;
  submission.comment = (comment || '').trim();

  // If approved and this challenge has not yet been counted as completed, update totals
  if (approved && !scavengerState.completedChallengeIds.includes(submission.challengeId)) {
    scavengerState.completedChallengeIds.push(submission.challengeId);

    const categories = scavengerChallenges.categories || [];
    const category = categories.find((cat) =>
      cat.challenges.some((c) => c.id === submission.challengeId)
    );
    const challenge = category
      ? category.challenges.find((c) => c.id === submission.challengeId)
      : null;

    if (challenge && typeof challenge.points === 'number') {
      scavengerState.totalPoints += challenge.points;
    }
  }

  return res.json({
    submission,
    state: scavengerState,
  });
});

// Player cancels an upload (only allowed while pending)
router.post('/api/scavenger/cancel', (req, res) => {
  const { submissionId } = req.body;

  if (!submissionId) {
    return res.status(400).json({ error: 'submissionId is required.' });
  }

  const index = scavengerState.submissions.findIndex((s) => s.id === submissionId);
  if (index === -1) {
    return res.status(404).json({ error: 'Submission not found.' });
  }

  const submission = scavengerState.submissions[index];
  if (submission.approved !== null) {
    return res
      .status(400)
      .json({ error: 'Cannot cancel a submission after it has been reviewed.' });
  }

  scavengerState.submissions.splice(index, 1);

  return res.json({ state: scavengerState });
});

router.post('/api/rooms', (req, res) => {
  const roomCode = createRoom();
  res.json({ roomCode });
});

router.post('/api/createaccount', async (req, res) => {
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
});

router.post('/api/login', async (req, res) => {
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
});

router.get('/api/trivia/random', (req, res) => {
  const seenIds = req.query.seen ? req.query.seen.split(',').map(Number) : [];
  const availableQuestions = questions.filter(q => !seenIds.includes(q.id));

  if (availableQuestions.length === 0) {
    return res.status(404).json({ message: "No more new questions!" });
  }

  const randomIndex = Math.floor(Math.random() * availableQuestions.length);
  res.json(availableQuestions[randomIndex]);
});

router.get('/', (req, res) => {
  res.json({ status: 'Alive' });
});

module.exports = router;