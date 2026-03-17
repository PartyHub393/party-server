const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { createServer } = require('http')

const { createAuthRouter } = require('../../src/routes/auth')

function createTestServer({ poolQueryImpl, bcryptImpl }) {
  const app = express()
  app.use(express.json())

  const pool = { query: poolQueryImpl }
  const bcrypt = bcryptImpl
  app.use(createAuthRouter({ pool, bcrypt }))

  const server = createServer(app)
  return server
}

async function start(server) {
  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()
  return { baseUrl: `http://127.0.0.1:${port}` }
}

async function stop(server) {
  await new Promise((resolve) => server.close(resolve))
}

test('POST /api/createaccount - missing fields -> 400', async (t) => {
  const server = createTestServer({
    poolQueryImpl: async () => {
      throw new Error('should not query db')
    },
    bcryptImpl: {
      hash: async () => 'hash',
      compare: async () => true,
    },
  })
  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/createaccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'a', email: 'b@example.com' }),
  })
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.error, /required/i)
})

test('POST /api/createaccount - success -> 201 with user (no password hash)', async (t) => {
  let hashCalled = 0
  let queryCalled = 0
  let lastQuery = null
  let lastValues = null

  const server = createTestServer({
    bcryptImpl: {
      hash: async (password, rounds) => {
        hashCalled++
        assert.equal(password, 'pw')
        assert.equal(rounds, 10)
        return 'hashed_pw'
      },
      compare: async () => true,
    },
    poolQueryImpl: async (query, values) => {
      queryCalled++
      lastQuery = query
      lastValues = values
      return {
        rows: [
          {
            id: 'u1',
            username: 'alice',
            email: 'alice@case.edu',
            role: 'player',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      }
    },
  })

  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/createaccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'alice',
      email: 'alice@case.edu',
      password: 'pw',
    }),
  })

  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.message, 'User created successfully')
  assert.equal(body.user.username, 'alice')
  assert.equal(body.user.email, 'alice@case.edu')
  assert.ok(body.user.id)
  assert.ok(!('password_hash' in body.user))

  assert.equal(hashCalled, 1)
  assert.equal(queryCalled, 1)
  assert.match(String(lastQuery), /insert into users/i)
  assert.deepEqual(lastValues, ['alice', 'alice@case.edu', 'hashed_pw', 'player'])
})

test('POST /api/createaccount - duplicate username/email -> 409', async (t) => {
  const dupErr = new Error('duplicate')
  dupErr.code = '23505'

  const server = createTestServer({
    bcryptImpl: {
      hash: async () => 'hashed',
      compare: async () => true,
    },
    poolQueryImpl: async () => {
      throw dupErr
    },
  })

  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/createaccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'alice',
      email: 'alice@case.edu',
      password: 'pw',
      role: 'host',
    }),
  })

  assert.equal(res.status, 409)
  const body = await res.json()
  assert.match(body.error, /exists/i)
})

test('POST /api/login - missing fields -> 400', async (t) => {
  const server = createTestServer({
    bcryptImpl: {
      hash: async () => 'hash',
      compare: async () => true,
    },
    poolQueryImpl: async () => ({ rows: [] }),
  })

  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice' }),
  })

  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.error, /required/i)
})

test('POST /api/login - user not found -> 401', async (t) => {
  const server = createTestServer({
    bcryptImpl: {
      hash: async () => 'hash',
      compare: async () => true,
    },
    poolQueryImpl: async (query, values) => {
      assert.match(String(query), /select \* from users/i)
      assert.deepEqual(values, ['alice'])
      return { rows: [] }
    },
  })

  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'pw' }),
  })

  assert.equal(res.status, 401)
  const body = await res.json()
  assert.match(body.error, /invalid/i)
})

test('POST /api/login - wrong password -> 401', async (t) => {
  let compareCalled = 0
  const server = createTestServer({
    bcryptImpl: {
      hash: async () => 'hash',
      compare: async (pw, hash) => {
        compareCalled++
        assert.equal(pw, 'pw')
        assert.equal(hash, 'stored_hash')
        return false
      },
    },
    poolQueryImpl: async () => ({
      rows: [
        {
          id: 'u1',
          username: 'alice',
          email: 'alice@case.edu',
          role: 'player',
          password_hash: 'stored_hash',
        },
      ],
    }),
  })

  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'pw' }),
  })

  assert.equal(res.status, 401)
  const body = await res.json()
  assert.match(body.error, /invalid/i)
  assert.equal(compareCalled, 1)
})

test('POST /api/login - success -> 200 and user payload', async (t) => {
  const server = createTestServer({
    bcryptImpl: {
      hash: async () => 'hash',
      compare: async () => true,
    },
    poolQueryImpl: async () => ({
      rows: [
        {
          id: 'u1',
          username: 'alice',
          email: 'alice@case.edu',
          role: 'host',
          password_hash: 'stored_hash',
        },
      ],
    }),
  })

  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'pw' }),
  })

  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.message, 'Login successful')
  assert.deepEqual(body.user, {
    id: 'u1',
    username: 'alice',
    email: 'alice@case.edu',
    role: 'host',
  })
})

