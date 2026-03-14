const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { hash, compare } = require('bcrypt');
const questions = require('../data/questions.json');
const scavengerChallenges = require('../data/scavengerChallenges.json');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateGroupCode() {
  return Array.from(
    { length: 6 },
    () => LETTERS[Math.floor(Math.random() * LETTERS.length)]
  ).join('');
}

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

router.get('/api/host/groups', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: userId required.' });
  }

  try {
    const userRes = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized: user not found.' });
    }

    const user = userRes.rows[0];
    if (user.role !== 'host') {
      return res.status(403).json({ error: 'Only hosts may query groups.' });
    }

    const groupsRes = await pool.query(
      'SELECT id, code, name, description, created_at, is_locked FROM groups WHERE created_by = $1 ORDER BY created_at DESC',
      [userId]
    );

    return res.json({ groups: groupsRes.rows });
  } catch (err) {
    console.error('Host groups query error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get groups that a player is a member of (persisted via group_members)
router.get('/api/player/groups', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: userId required.' });
  }

  try {
    const userRes = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized: user not found.' });
    }

    const groupsRes = await pool.query(
      `SELECT g.id, g.code, g.name, g.description, g.created_by, g.created_at, g.is_locked
       FROM groups g
       JOIN group_members m ON m.group_id = g.id
       WHERE m.user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    );

    return res.json({ groups: groupsRes.rows });
  } catch (err) {
    console.error('Player groups query error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/rooms', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: userId required.' });
  }

  try {
    const userRes = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized: user not found.' });
    }

    const user = userRes.rows[0];
    if (user.role !== 'host') {
      return res.status(403).json({ error: 'Only hosts may create rooms.' });
    }
  } catch (err) {
    console.error('Room creation auth error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // Generate a unique room code and persist it so it can be loaded later.
  let roomCode;
  let createdGroup = null;

  // Keep trying until we create a group and insert it into DB without conflict.
  while (!createdGroup) {
    roomCode = generateGroupCode();
    try {
      const groupName = `Group ${roomCode}`;
      const insertQuery = `
        INSERT INTO groups (code, name, created_by, is_locked)
        VALUES ($1, $2, $3, FALSE)
        ON CONFLICT (code) DO NOTHING
        RETURNING id, code, name, description, created_by, created_at, is_locked
      `;
      const insertRes = await pool.query(insertQuery, [roomCode, groupName, userId]);
      createdGroup = insertRes.rows[0];
    } catch (err) {
      console.error('Error creating group in DB:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  res.json({ roomCode, group: createdGroup });
});

router.post('/api/groups/lock', async (req, res) => {
  const { groupCode, userId, isLocked } = req.body;

  if (!groupCode || !userId || typeof isLocked !== 'boolean') {
    return res.status(400).json({ error: 'groupCode, userId, and isLocked are required.' });
  }

  const code = (groupCode || '').trim().toUpperCase();

  try {
    const userRes = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized: user not found.' });
    }

    if (userRes.rows[0].role !== 'host') {
      return res.status(403).json({ error: 'Only hosts may lock the lobby.' });
    }

    const updateRes = await pool.query(
      `UPDATE groups
       SET is_locked = $1
       WHERE code = $2 AND created_by = $3
       RETURNING id, code, name, description, created_by, created_at, is_locked`,
      [isLocked, code, userId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found or not owned by host.' });
    }

    return res.json({ group: updateRes.rows[0] });
  } catch (err) {
    console.error('Group lock update error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/createaccount', async (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }

  const resolvedRole = role === 'host' ? 'host' : 'player';

  try {
    const passwordHash = await hash(password, 10);
    const queryText = `
      INSERT INTO users (username, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, role, created_at;
    `;
    const values = [username, email, passwordHash, resolvedRole];
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
        email: user.email,
        role: user.role || 'player',
      }
    });
  } catch (err) { 
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join or create a group via code. Stores membership in group_members.
router.post('/api/groups/join', async (req, res) => {
  const { groupCode, userId } = req.body;
  if (!groupCode || !userId) {
    return res.status(400).json({ error: 'groupCode and userId are required.' });
  }

  const code = (groupCode || '').trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'Invalid group code.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure the group exists; do NOT create it from the join endpoint.
    const existing = await client.query(
      `SELECT id, code, name, description, created_by, created_at, is_locked,
              ($2::uuid = ANY(COALESCE(banned_users, '{}'::uuid[]))) AS is_banned
       FROM groups
       WHERE code = $1`,
      [code, userId]
    );
    const group = existing.rows[0];

    if (!group) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group not found. Please get the code from the host.' });
    }

    if (group.is_banned) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You have been banned from this lobby.' });
    }

    const userRes = await client.query('SELECT id, username FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found.' });
    }

    const membershipRes = await client.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group.id, userId]
    );
    const isExistingMember = membershipRes.rows.length > 0;

    if (group.is_locked && !isExistingMember) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'This lobby is locked. New members cannot join right now.' });
    }

    await client.query(
      `INSERT INTO group_members (group_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [group.id, userId]
    );

    await client.query('COMMIT');

    return res.json({ group, member: userRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Group join error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
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