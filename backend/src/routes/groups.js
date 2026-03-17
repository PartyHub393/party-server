const express = require('express')

/**
 * Creates a groups router with injectable dependencies for testing.
 *
 * @param {object} deps
 * @param {{ query: Function }} deps.pool - pg Pool-like object
 * @param {() => string} deps.generateGroupCode - function that returns a new group code
 */
function createGroupsRouter({ pool, generateGroupCode }) {
  if (!pool?.query) throw new Error('createGroupsRouter requires pool.query')
  if (typeof generateGroupCode !== 'function') {
    throw new Error('createGroupsRouter requires generateGroupCode')
  }

  const router = express.Router()

  router.post('/api/rooms', async (req, res) => {
    const { userId } = req.body
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: userId required.' })
    }

    try {
      const userRes = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId])
      if (userRes.rows.length === 0) {
        return res.status(401).json({ error: 'Unauthorized: user not found.' })
      }

      const user = userRes.rows[0]
      if (user.role !== 'host') {
        return res.status(403).json({ error: 'Only hosts may create rooms.' })
      }
    } catch (err) {
      console.error('Room creation auth error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }

    let roomCode
    let createdGroup = null
    let attempts = 0

    while (!createdGroup) {
      attempts += 1
      if (attempts > 20) {
        return res.status(500).json({ error: 'Failed to allocate a unique room code.' })
      }

      roomCode = generateGroupCode()
      try {
        const groupName = `Group ${roomCode}`
        const insertQuery = `
          INSERT INTO groups (code, name, created_by, is_locked)
          VALUES ($1, $2, $3, FALSE)
          ON CONFLICT (code) DO NOTHING
          RETURNING id, code, name, description, created_by, created_at, is_locked
        `
        const insertRes = await pool.query(insertQuery, [roomCode, groupName, userId])
        createdGroup = insertRes.rows[0]
      } catch (err) {
        console.error('Error creating group in DB:', err)
        return res.status(500).json({ error: 'Internal server error' })
      }
    }

    return res.json({ roomCode, group: createdGroup })
  })

  return router
}

module.exports = { createGroupsRouter }

