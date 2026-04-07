const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { createServer } = require('http')

const {
  createScavengerRouter,
  createScavengerState,
  createScavengerStateStore,
} = require('../../src/routes/scavenger')

const realChallenges = require('../../src/data/scavengerChallenges.json')

const MINIMAL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const fixtureChallengesMinimal = {
  categories: [
    {
      id: 'cat-a',
      name: 'Category A',
      challenges: [
        { id: 'ch-10pts', title: 'Ten', points: 10 },
        { id: 'ch-nopoints', title: 'No numeric points' },
      ],
    },
    {
      id: 'cat-b',
      name: 'Category B',
      challenges: [{ id: 'ch-5pts', title: 'Five', points: 5 }],
    },
  ],
}

function createScavengerApp(overrides = {}) {
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  const scavengerStateStore = overrides.scavengerStateStore ?? createScavengerStateStore()
  // Convenience accessor for legacy tests that want a direct state object.
  const scavengerState =
    overrides.scavengerState ??
    scavengerStateStore.get(overrides.groupCode || 'GLOBAL')
  const scavengerChallenges = overrides.scavengerChallenges ?? fixtureChallengesMinimal
  const imageScanner = overrides.imageScanner
  app.use(createScavengerRouter({ scavengerChallenges, scavengerStateStore, imageScanner }))
  return { app, scavengerState, scavengerStateStore, scavengerChallenges }
}

function listen(app) {
  const server = createServer(app)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` })
    })
  })
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function postJsonGroup(baseUrl, path, groupCode, body) {
  const qs = groupCode ? `?groupCode=${encodeURIComponent(groupCode)}` : ''
  return postJson(baseUrl, `${path}${qs}`, body)
}

// --- Challenges & state ---

// Verifies the challenges endpoint returns the expected top-level JSON shape.
test('GET /api/scavenger/challenges returns bundled scavenger JSON', async (t) => {
  const { app } = createScavengerApp({ scavengerChallenges: realChallenges })
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await fetch(`${baseUrl}/api/scavenger/challenges`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(Array.isArray(body.categories))
  assert.ok(body.categories.length > 0)
  const first = body.categories[0]
  assert.ok(first.id && first.name)
  assert.ok(Array.isArray(first.challenges))
  assert.ok(first.challenges[0].id)
  assert.equal(typeof first.challenges[0].points, 'number')
})

// Verifies state defaults are empty/zero and category stats mirror configured challenges.
test('GET /api/scavenger/state - empty state has zeros and categoryStats aligned to challenges', async (t) => {
  const { app, scavengerChallenges } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await fetch(`${baseUrl}/api/scavenger/state`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.teamName, '')
  assert.equal(body.totalPoints, 0)
  assert.equal(body.challengesCompleted, 0)
  assert.ok(!('completedChallengeIds' in body))
  assert.ok(Array.isArray(body.submissions))
  assert.equal(body.submissions.length, 0)
  assert.equal(body.categoryStats.length, scavengerChallenges.categories.length)
  body.categoryStats.forEach((stat, i) => {
    const cat = scavengerChallenges.categories[i]
    assert.equal(stat.id, cat.id)
    assert.equal(stat.name, cat.name)
    assert.equal(stat.totalChallenges, cat.challenges.length)
    assert.equal(stat.completedChallenges, 0)
  })
})

// Verifies completed challenge IDs are reflected in per-category completion counts.
test('GET /api/scavenger/state - categoryStats reflect completedChallengeIds', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  scavengerState.teamName = 'Squad'
  scavengerState.completedChallengeIds.push('ch-10pts', 'ch-5pts')

  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await fetch(`${baseUrl}/api/scavenger/state`)
  const body = await res.json()
  assert.equal(body.teamName, 'Squad')
  assert.equal(body.challengesCompleted, 2)
  const catA = body.categoryStats.find((s) => s.id === 'cat-a')
  const catB = body.categoryStats.find((s) => s.id === 'cat-b')
  assert.equal(catA.completedChallenges, 1)
  assert.equal(catB.completedChallenges, 1)
})

// Verifies router tolerates missing categories and returns an empty stats array.
test('GET /api/scavenger/state - missing categories yields empty categoryStats', async (t) => {
  const { app } = createScavengerApp({ scavengerChallenges: {} })
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await fetch(`${baseUrl}/api/scavenger/state`)
  const body = await res.json()
  assert.deepEqual(body.categoryStats, [])
})

// --- Team ---

// Verifies team name validation rejects missing/blank input.
test('POST /api/scavenger/team - missing or blank name -> 400', async (t) => {
  const { app } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  for (const body of [{}, { teamName: '' }, { teamName: '   \t' }]) {
    const res = await postJson(baseUrl, '/api/scavenger/team', body)
    assert.equal(res.status, 400)
    const j = await res.json()
    assert.match(j.error, /team name is required/i)
  }
})

// Verifies team name is trimmed and persisted in server state.
test('POST /api/scavenger/team - trims and persists', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await postJson(baseUrl, '/api/scavenger/team', { teamName: '  Alpha  ' })
  assert.equal(res.status, 200)
  const j = await res.json()
  assert.equal(j.teamName, 'Alpha')
  assert.equal(scavengerState.teamName, 'Alpha')
})

// --- Submit (photo / data URL) ---

// Verifies submit validation requires both challengeId and imageData.
test('POST /api/scavenger/submit - missing challengeId or imageData -> 400', async (t) => {
  const { app } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const cases = [
    { body: { imageData: MINIMAL_PNG_DATA_URL } },
    { body: { challengeId: 'ch-10pts' } },
    { body: { challengeId: '', imageData: MINIMAL_PNG_DATA_URL } },
    { body: { challengeId: 'ch-10pts', imageData: '' } },
  ]
  for (const { body } of cases) {
    const res = await postJson(baseUrl, '/api/scavenger/submit', body)
    assert.equal(res.status, 400)
    const j = await res.json()
    assert.match(j.error, /challengeId and imageData are required/i)
  }
})

// Verifies submit rejects non-string payloads for imageData.
test('POST /api/scavenger/submit - rejects non-string imageData', async (t) => {
  const { app } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: { base64: 'abc' },
  })
  assert.equal(res.status, 400)
  const j = await res.json()
  assert.match(j.error, /only image uploads/i)
})

// Verifies submit only accepts data URLs starting with the image prefix.
test('POST /api/scavenger/submit - rejects non-image data URLs and raw URLs', async (t) => {
  const { app } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const badUrls = [
    'https://example.com/photo.png',
    'data:video/mp4;base64,AAAA',
    'data:text/plain;base64,AA==',
    'data:application/octet-stream;base64,AA==',
    'data:image', // prefix check requires data:image/
    'not a url at all',
  ]
  for (const imageData of badUrls) {
    const res = await postJson(baseUrl, '/api/scavenger/submit', {
      challengeId: 'ch-10pts',
      imageData,
    })
    assert.equal(res.status, 400)
    const j = await res.json()
    assert.match(j.error, /only image uploads/i)
  }
})

// Verifies submit rejects challenge IDs that are not present in challenge data.
test('POST /api/scavenger/submit - unknown challengeId -> 400', async (t) => {
  const { app } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'does-not-exist',
    imageData: MINIMAL_PNG_DATA_URL,
  })
  assert.equal(res.status, 400)
  const j = await res.json()
  assert.match(j.error, /unknown challengeId/i)
})

// Verifies common image MIME prefixes are accepted for uploads.
test('POST /api/scavenger/submit - accepts data:image/jpeg and data:image/webp prefixes', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  for (const prefix of ['data:image/jpeg;base64,/9j/', 'data:image/webp;base64,UklGR']) {
    const res = await postJson(baseUrl, '/api/scavenger/submit', {
      challengeId: 'ch-10pts',
      imageData: prefix,
    })
    assert.equal(res.status, 201, `expected 201 for prefix ${prefix.slice(0, 30)}`)
    scavengerState.submissions.pop()
  }
})

// Verifies successful submit response shape and playerName default/trim behavior.
test('POST /api/scavenger/submit - 201 shape, default playerName, trim playerName', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res1 = await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
  })
  assert.equal(res1.status, 201)
  const j1 = await res1.json()
  assert.ok(j1.submission.id && typeof j1.submission.id === 'string')
  assert.match(j1.submission.id, /\d+-[a-z0-9]+/i)
  assert.equal(j1.submission.challengeId, 'ch-10pts')
  assert.equal(j1.submission.imageData, MINIMAL_PNG_DATA_URL)
  assert.equal(j1.submission.playerName, 'Player')
  assert.equal(j1.submission.approved, null)
  assert.equal(j1.autoApproved, false)
  assert.equal(j1.submission.comment, '')
  assert.ok(j1.submission.createdAt)
  assert.equal(scavengerState.submissions.length, 1)

  const res2 = await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-5pts',
    imageData: MINIMAL_PNG_DATA_URL,
    playerName: '  Sam  ',
  })
  assert.equal(res2.status, 201)
  const j2 = await res2.json()
  assert.equal(j2.submission.playerName, 'Sam')
})

// Verifies multiple pending submissions can exist for the same challenge.
test('POST /api/scavenger/submit - multiple pending submissions for same challenge allowed', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
    playerName: 'A',
  })
  await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
    playerName: 'B',
  })
  assert.equal(scavengerState.submissions.length, 2)
  assert.equal(
    scavengerState.submissions.filter((s) => s.challengeId === 'ch-10pts').length,
    2
  )
})

// Verifies flagged scans still create a pending submission for manual review.
test('POST /api/scavenger/submit - scanner-flagged image is queued for manual approval', async (t) => {
  const imageScanner = {
    async scanImageData() {
      return {
        allowed: false,
        scanned: true,
        matchedPrompt: false,
        reason: 'Image appears unsafe for this event.',
      }
    },
  }
  const { app, scavengerState } = createScavengerApp({ imageScanner })
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
    playerName: 'A',
  })
  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.flaggedBySafetyScan, true)
  assert.equal(body.autoApproved, false)
  assert.match(body.scanWarning, /unsafe/i)
  assert.equal(scavengerState.submissions.length, 1)
  assert.equal(scavengerState.submissions[0].approved, null)
  assert.equal(scavengerState.submissions[0].safetyScan.allowed, false)
})

// Verifies scan pass with challenge-match auto-approves and awards points immediately.
test('POST /api/scavenger/submit - scanner pass auto-approves submission', async (t) => {
  const imageScanner = {
    async scanImageData() {
      return {
        allowed: true,
        scanned: true,
        matchedPrompt: true,
        reason: 'Safe and matches challenge.',
      }
    },
  }
  const { app, scavengerState } = createScavengerApp({ imageScanner })
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
    playerName: 'A',
  })

  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.flaggedBySafetyScan, false)
  assert.equal(body.autoApproved, true)
  assert.equal(body.submission.approved, true)
  assert.match(body.submission.comment, /auto-approved/i)
  assert.equal(scavengerState.totalPoints, 10)
  assert.deepEqual(scavengerState.completedChallengeIds, ['ch-10pts'])
})

// Verifies auto-approval still works if scanner omits the optional `scanned` property.
test('POST /api/scavenger/submit - scanner pass auto-approves even without scanned flag', async (t) => {
  const imageScanner = {
    async scanImageData() {
      return {
        allowed: true,
        matchedPrompt: true,
        reason: 'Safe and on prompt.',
      }
    },
  }
  const { app, scavengerState } = createScavengerApp({ imageScanner })
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
  })

  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.autoApproved, true)
  assert.equal(body.submission.approved, true)
  assert.equal(scavengerState.totalPoints, 10)
  assert.deepEqual(scavengerState.completedChallengeIds, ['ch-10pts'])
})

// Verifies a scanner-flagged submission can still be approved by review endpoint.
test('POST /api/scavenger/review - can approve scanner-flagged submission', async (t) => {
  const imageScanner = {
    async scanImageData() {
      return { allowed: false, reason: 'Needs host review' }
    },
  }
  const { app, scavengerState } = createScavengerApp({ imageScanner })
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const submitRes = await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
    playerName: 'A',
  })
  const submitBody = await submitRes.json()

  const rev = await postJson(baseUrl, '/api/scavenger/review', {
    submissionId: submitBody.submission.id,
    approved: true,
    comment: 'approved by host',
  })

  assert.equal(rev.status, 200)
  assert.equal(scavengerState.totalPoints, 10)
  assert.deepEqual(scavengerState.completedChallengeIds, ['ch-10pts'])
})

// Verifies submit returns 503 when scanner is configured but currently unavailable.
test('POST /api/scavenger/submit - scanner outage queues submission for host review', async (t) => {
  const imageScanner = {
    async scanImageData() {
      throw new Error('Gemini API timeout')
    },
  }
  const { app, scavengerState } = createScavengerApp({ imageScanner })
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
  })
  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.autoApproved, false)
  assert.equal(body.flaggedBySafetyScan, true)
  assert.match(body.scanWarning, /unable to scan/i)
  assert.equal(scavengerState.submissions.length, 1)
  assert.equal(scavengerState.submissions[0].approved, null)
})

test('team scoring: approvals add to group totalPoints (not per-player), isolated by groupCode', async (t) => {
  const imageScanner = {
    async scanImageData() {
      return { allowed: false, scanned: true, matchedPrompt: false, reason: 'Host review required' }
    },
  }

  const { app } = createScavengerApp({ imageScanner })
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  // Submit two different challenges in group A by two different "players"
  const s1 = await (await postJsonGroup(baseUrl, '/api/scavenger/submit', 'AAA111', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
    playerName: 'Player One',
  })).json()
  const s2 = await (await postJsonGroup(baseUrl, '/api/scavenger/submit', 'AAA111', {
    challengeId: 'ch-5pts',
    imageData: MINIMAL_PNG_DATA_URL,
    playerName: 'Player Two',
  })).json()

  // Approve both: group total should be 15 regardless of uploader identity
  await postJsonGroup(baseUrl, '/api/scavenger/review', 'AAA111', {
    submissionId: s1.submission.id,
    approved: true,
  })
  await postJsonGroup(baseUrl, '/api/scavenger/review', 'AAA111', {
    submissionId: s2.submission.id,
    approved: true,
  })

  const stateA = await (await fetch(`${baseUrl}/api/scavenger/state?groupCode=AAA111`)).json()
  assert.equal(stateA.totalPoints, 15)
  assert.equal(stateA.challengesCompleted, 2)

  // Group B should remain untouched
  const stateB = await (await fetch(`${baseUrl}/api/scavenger/state?groupCode=BBB222`)).json()
  assert.equal(stateB.totalPoints, 0)
  assert.equal(stateB.challengesCompleted, 0)
  assert.equal(stateB.submissions.length, 0)
})

// --- Review ---

// Verifies review validation requires submissionId and a boolean approved flag.
test('POST /api/scavenger/review - missing submissionId or non-boolean approved -> 400', async (t) => {
  const { app } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const bad = [
    { approved: true },
    { submissionId: '', approved: true },
    { submissionId: 'x', approved: 'true' },
    { submissionId: 'x', approved: 1 },
    { submissionId: 'x' },
  ]
  for (const body of bad) {
    const res = await postJson(baseUrl, '/api/scavenger/review', body)
    assert.equal(res.status, 400)
    const j = await res.json()
    assert.match(j.error, /submissionId and approved \(boolean\) are required/i)
  }
})

// Verifies review returns 404 when target submission does not exist.
test('POST /api/scavenger/review - unknown submission -> 404', async (t) => {
  const { app } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await postJson(baseUrl, '/api/scavenger/review', {
    submissionId: 'nope',
    approved: false,
  })
  assert.equal(res.status, 404)
})

// Verifies denied reviews do not alter completion list or total points.
test('POST /api/scavenger/review - deny does not complete challenge or add points', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const subRes = await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
  })
  const { submission } = await subRes.json()

  const rev = await postJson(baseUrl, '/api/scavenger/review', {
    submissionId: submission.id,
    approved: false,
    comment: '  blurry  ',
  })
  assert.equal(rev.status, 200)
  const body = await rev.json()
  assert.equal(body.submission.approved, false)
  assert.equal(body.submission.comment, 'blurry')
  assert.equal(scavengerState.totalPoints, 0)
  assert.equal(scavengerState.completedChallengeIds.length, 0)
})

// Verifies points are idempotent: one challenge contributes points at most once.
test('POST /api/scavenger/review - approve adds points once per challenge; second approve same challenge does not double', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const s1 = await (await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
  })).json()
  const s2 = await (await postJson(baseUrl, '/api/scavenger/submit', {
    challengeId: 'ch-10pts',
    imageData: MINIMAL_PNG_DATA_URL,
  })).json()

  await postJson(baseUrl, '/api/scavenger/review', {
    submissionId: s1.submission.id,
    approved: true,
  })
  assert.equal(scavengerState.totalPoints, 10)
  assert.deepEqual(scavengerState.completedChallengeIds, ['ch-10pts'])

  await postJson(baseUrl, '/api/scavenger/review', {
    submissionId: s2.submission.id,
    approved: true,
  })
  assert.equal(scavengerState.totalPoints, 10, 'second approval same challenge must not add points')
  assert.equal(scavengerState.completedChallengeIds.length, 1)
})

// Verifies approval still completes a challenge even when points are missing/non-numeric.
test('POST /api/scavenger/review - challenge without numeric points: approve completes but does not change totalPoints', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const { submission } = await (
    await postJson(baseUrl, '/api/scavenger/submit', {
      challengeId: 'ch-nopoints',
      imageData: MINIMAL_PNG_DATA_URL,
    })
  ).json()

  await postJson(baseUrl, '/api/scavenger/review', {
    submissionId: submission.id,
    approved: true,
  })
  assert.ok(scavengerState.completedChallengeIds.includes('ch-nopoints'))
  assert.equal(scavengerState.totalPoints, 0)
})

// Verifies review response state mirrors the server's current in-memory state values.
test('POST /api/scavenger/review - response includes full state snapshot', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const { submission } = await (
    await postJson(baseUrl, '/api/scavenger/submit', {
      challengeId: 'ch-5pts',
      imageData: MINIMAL_PNG_DATA_URL,
    })
  ).json()

  const rev = await postJson(baseUrl, '/api/scavenger/review', {
    submissionId: submission.id,
    approved: true,
  })
  const body = await rev.json()
  assert.deepEqual(body.state.totalPoints, scavengerState.totalPoints)
  assert.deepEqual(body.state.completedChallengeIds, scavengerState.completedChallengeIds)
  assert.deepEqual(body.state.submissions, scavengerState.submissions)
  assert.equal(body.state.teamName, scavengerState.teamName)
})

// --- Cancel ---

// Verifies cancel validation requires a submissionId.
test('POST /api/scavenger/cancel - missing submissionId -> 400', async (t) => {
  const { app } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await postJson(baseUrl, '/api/scavenger/cancel', {})
  assert.equal(res.status, 400)
})

// Verifies cancel returns 404 for unknown submissions.
test('POST /api/scavenger/cancel - unknown id -> 404', async (t) => {
  const { app } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const res = await postJson(baseUrl, '/api/scavenger/cancel', { submissionId: 'x' })
  assert.equal(res.status, 404)
})

// Verifies cancel is blocked once a submission has been reviewed.
test('POST /api/scavenger/cancel - cannot cancel after review', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const { submission } = await (
    await postJson(baseUrl, '/api/scavenger/submit', {
      challengeId: 'ch-10pts',
      imageData: MINIMAL_PNG_DATA_URL,
    })
  ).json()
  await postJson(baseUrl, '/api/scavenger/review', {
    submissionId: submission.id,
    approved: true,
  })

  const res = await postJson(baseUrl, '/api/scavenger/cancel', {
    submissionId: submission.id,
  })
  assert.equal(res.status, 400)
  const j = await res.json()
  assert.match(j.error, /cannot cancel/i)
  assert.equal(scavengerState.submissions.length, 1)
})

// Verifies cancel removes pending submissions and returns updated state.
test('POST /api/scavenger/cancel - removes pending submission', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const { submission } = await (
    await postJson(baseUrl, '/api/scavenger/submit', {
      challengeId: 'ch-10pts',
      imageData: MINIMAL_PNG_DATA_URL,
    })
  ).json()
  assert.equal(scavengerState.submissions.length, 1)

  const res = await postJson(baseUrl, '/api/scavenger/cancel', {
    submissionId: submission.id,
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.state.submissions.length, 0)
  assert.equal(scavengerState.submissions.length, 0)
})

// --- Integration-style flow ---

// Verifies an end-to-end flow keeps points, submissions, and category stats consistent.
test('full flow: team, submit, cancel other pending, approve, state matches', async (t) => {
  const { app, scavengerState } = createScavengerApp()
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  // Setup: create team identity for the session.
  await postJson(baseUrl, '/api/scavenger/team', { teamName: 'The Owls' })

  const keep = await (
    await postJson(baseUrl, '/api/scavenger/submit', {
      challengeId: 'ch-10pts',
      imageData: MINIMAL_PNG_DATA_URL,
    })
  ).json()
  const drop = await (
    await postJson(baseUrl, '/api/scavenger/submit', {
      challengeId: 'ch-5pts',
      imageData: MINIMAL_PNG_DATA_URL,
    })
  ).json()

  // Action: cancel one pending submission and approve the other.
  await postJson(baseUrl, '/api/scavenger/cancel', { submissionId: drop.submission.id })
  assert.equal(scavengerState.submissions.length, 1)

  await postJson(baseUrl, '/api/scavenger/review', {
    submissionId: keep.submission.id,
    approved: true,
    comment: 'nice',
  })

  // Assert: final derived state matches expected progression.
  const stateRes = await fetch(`${baseUrl}/api/scavenger/state`)
  const state = await stateRes.json()
  assert.equal(state.teamName, 'The Owls')
  assert.equal(state.totalPoints, 10)
  assert.equal(state.challengesCompleted, 1)
  assert.equal(state.submissions.length, 1)
  assert.equal(state.submissions[0].approved, true)
  const catA = state.categoryStats.find((s) => s.id === 'cat-a')
  assert.equal(catA.completedChallenges, 1)
  const catB = state.categoryStats.find((s) => s.id === 'cat-b')
  assert.equal(catB.completedChallenges, 0)
})

// Verifies behavior against real challenge data (not only minimal fixture data).
test('real challenges: campus-1 submit + approve adds 10 points', async (t) => {
  const { app, scavengerState } = createScavengerApp({
    scavengerChallenges: realChallenges,
  })
  const { server, baseUrl } = await listen(app)
  t.after(() => close(server))

  const { submission } = await (
    await postJson(baseUrl, '/api/scavenger/submit', {
      challengeId: 'campus-1',
      imageData: MINIMAL_PNG_DATA_URL,
    })
  ).json()
  await postJson(baseUrl, '/api/scavenger/review', {
    submissionId: submission.id,
    approved: true,
  })
  assert.equal(scavengerState.totalPoints, 10)
  assert.ok(scavengerState.completedChallengeIds.includes('campus-1'))
})
