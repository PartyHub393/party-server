const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { createServer } = require('http')

const { createGroupsRouter } = require('../../src/routes/groups')

function createTestServer({ poolQueryImpl, generateGroupCode }) {
  const app = express()
  app.use(express.json())

  const pool = { query: poolQueryImpl }
  app.use(createGroupsRouter({ pool, generateGroupCode }))

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

test('POST /api/rooms - missing userId -> 401', async (t) => {
  const server = createTestServer({
    generateGroupCode: () => 'ABCDEF',
    poolQueryImpl: async () => {
      throw new Error('should not query db')
    },
  })

  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  assert.equal(res.status, 401)
  const body = await res.json()
  assert.match(body.error, /userId required/i)
})

test('POST /api/rooms - user not found -> 401', async (t) => {
  const server = createTestServer({
    generateGroupCode: () => 'ABCDEF',
    poolQueryImpl: async (query, values) => {
      assert.match(String(query), /select id, role from users/i)
      assert.deepEqual(values, ['u1'])
      return { rows: [] }
    },
  })

  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'u1' }),
  })

  assert.equal(res.status, 401)
  const body = await res.json()
  assert.match(body.error, /user not found/i)
})

test('POST /api/rooms - user not host -> 403', async (t) => {
  let calls = 0
  const server = createTestServer({
    generateGroupCode: () => 'ABCDEF',
    poolQueryImpl: async () => {
      calls++
      return { rows: [{ id: 'u1', role: 'player' }] }
    },
  })

  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'u1' }),
  })

  assert.equal(res.status, 403)
  const body = await res.json()
  assert.match(body.error, /only hosts/i)
  assert.equal(calls, 1)
})

test('POST /api/rooms - success -> returns roomCode + group', async (t) => {
  const generated = []
  let queryCount = 0

  const server = createTestServer({
    generateGroupCode: () => {
      generated.push('ZXCVBN')
      return 'ZXCVBN'
    },
    poolQueryImpl: async (query, values) => {
      queryCount++
      if (queryCount === 1) {
        // host auth check
        return { rows: [{ id: values[0], role: 'host' }] }
      }
      assert.match(String(query), /insert into groups/i)
      assert.deepEqual(values, ['ZXCVBN', 'Group ZXCVBN', 'host-1'])
      return {
        rows: [
          {
            id: 'g1',
            code: 'ZXCVBN',
            name: 'Group ZXCVBN',
            description: null,
            created_by: 'host-1',
            created_at: '2026-01-01T00:00:00Z',
            is_locked: false,
          },
        ],
      }
    },
  })

  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'host-1' }),
  })

  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.roomCode, 'ZXCVBN')
  assert.equal(body.group.code, 'ZXCVBN')
  assert.equal(body.group.id, 'g1')
  assert.equal(body.group.created_by, 'host-1')
  assert.equal(queryCount, 2)
})

test('POST /api/rooms - retries if code conflicts (insert returns no rows)', async (t) => {
  const codes = ['AAAAAA', 'BBBBBB']
  let genCalls = 0
  let insertCalls = 0

  const server = createTestServer({
    generateGroupCode: () => codes[genCalls++],
    poolQueryImpl: async (query, values) => {
      if (/select id, role from users/i.test(String(query))) {
        return { rows: [{ id: values[0], role: 'host' }] }
      }

      if (/insert into groups/i.test(String(query))) {
        insertCalls++
        if (insertCalls === 1) {
          // simulate conflict (ON CONFLICT DO NOTHING)
          return { rows: [] }
        }
        return {
          rows: [
            {
              id: 'g2',
              code: values[0],
              name: values[1],
              description: null,
              created_by: values[2],
              created_at: '2026-01-01T00:00:00Z',
              is_locked: false,
            },
          ],
        }
      }

      throw new Error('unexpected query')
    },
  })

  const { baseUrl } = await start(server)
  t.after(() => stop(server))

  const res = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'host-1' }),
  })

  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.roomCode, 'BBBBBB')
  assert.equal(body.group.code, 'BBBBBB')
  assert.equal(genCalls, 2)
  assert.equal(insertCalls, 2)
})

