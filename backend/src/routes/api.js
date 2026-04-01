const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { createAuthRouter } = require('./auth');
const { createGroupsRouter } = require('./groups');
const { createScavengerRouter, createScavengerState } = require('./scavenger');
const { createGeminiImageScanner } = require('../services/geminiImageScanner');
const bcrypt = require('bcrypt');
const questions = require('../data/questions.json');
const scavengerChallenges = require('../data/scavengerChallenges.json');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const imageScanner = createGeminiImageScanner();

function generateGroupCode() {
  return Array.from(
    { length: 6 },
    () => LETTERS[Math.floor(Math.random() * LETTERS.length)]
  ).join('');
}

const scavengerState = createScavengerState();

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

// Auth routes (login + registration)
router.use(createAuthRouter({ pool, bcrypt }));

router.use(
  createScavengerRouter({
    scavengerChallenges,
    scavengerState,
    imageScanner,
  })
);

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

router.use(
  createGroupsRouter({
    pool,
    generateGroupCode,
  })
);

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

    // Fetch the user to ensure they exist and to check their role (host vs player).
    const userRes = await client.query('SELECT id, username, role FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userRes.rows[0];

    // Find the group by code. Hosts may create it if missing.
    const existing = await client.query(
      `SELECT id, code, name, description, created_by, created_at, is_locked,
              ($2::uuid = ANY(COALESCE(banned_users, '{}'::uuid[]))) AS is_banned
       FROM groups
       WHERE code = $1`,
      [code, userId]
    );
    let group = existing.rows[0];

    // If no group found and user is not a host, reject join attempt.
    if (!group && user.role !== 'host') {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Group not found. Please get the code from the host.' });
    }

    if (user.role === 'host') {
      // If host typed an existing code, they may only use it when they own that room.
      if (group && group.created_by !== userId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'That group code belongs to another host.' });
      }

      // If host typed a new code, ensure they do not already own another room.
      if (!group) {
        const ownedRes = await client.query(
          `SELECT id, code
           FROM groups
           WHERE created_by = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [userId]
        );

        if (ownedRes.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Host already has a group assigned.' });
        }

        const createdRes = await client.query(
          `INSERT INTO groups (code, name, created_by, is_locked)
           VALUES ($1, $2, $3, FALSE)
           ON CONFLICT (code) DO NOTHING
           RETURNING id, code, name, description, created_by, created_at, is_locked,
                     FALSE AS is_banned`,
          [code, `Group ${code}`, userId]
        );

        if (createdRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Group code already exists. Try a different code.' });
        }

        group = createdRes.rows[0];
      }

      // Hosts should not be listed as players in group_members.
      await client.query(
        'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
        [group.id, userId]
      );

      await client.query('COMMIT');
      return res.json({ group, member: { id: user.id, username: user.username } });
    }

    if (group.is_banned) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You have been banned from this lobby.' });
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
    
    // Ensure a valid group was found/created before adding membership.
    if (!group) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Failed to resolve group.' });
    }

    await client.query(
      `INSERT INTO group_members (group_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [group.id, userId]
    );

    await client.query('COMMIT');

    return res.json({ group, member: { id: user.id, username: user.username } });
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