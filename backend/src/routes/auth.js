const express = require('express')

/**
 * Creates an auth router with injectable dependencies for testing.
 *
 * @param {object} deps
 * @param {{ query: Function }} deps.pool - pg Pool-like object
 * @param {{ hash: Function, compare: Function }} deps.bcrypt - bcrypt-like object
 */
function createAuthRouter({ pool, bcrypt }) {
  if (!pool?.query) throw new Error('createAuthRouter requires pool.query')
  if (!bcrypt?.hash || !bcrypt?.compare) throw new Error('createAuthRouter requires bcrypt.hash/compare')

  const router = express.Router()

  router.post('/api/createaccount', async (req, res) => {
    const { username, email, password, role } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' })
    }

    const resolvedRole = role === 'host' ? 'host' : 'player'

    try {
      const passwordHash = await bcrypt.hash(password, 10)
      const queryText = `
        INSERT INTO users (username, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, email, role, created_at;
      `
      const values = [username, email, passwordHash, resolvedRole]
      const result = await pool.query(queryText, values)

      return res.status(201).json({
        message: 'User created successfully',
        user: result.rows[0],
      })
    } catch (err) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'Username or Email already exists.' })
      }
      console.error('Database Error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/api/login', async (req, res) => {
    try {
      const { username, password } = req.body

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' })
      }

      const queryText = 'SELECT * FROM users WHERE username = $1'
      const result = await pool.query(queryText, [username])

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password.' })
      }

      const user = result.rows[0]
      const isMatch = await bcrypt.compare(password, user.password_hash)

      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid username or password.' })
      }

      return res.status(200).json({
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role || 'player',
        },
      })
    } catch (err) {
      console.error('Login error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}

module.exports = { createAuthRouter }

