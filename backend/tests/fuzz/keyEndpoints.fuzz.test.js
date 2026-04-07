const test = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const express = require('express');
const { createServer } = require('http');

const { createAuthRouter } = require('../../src/routes/auth');
const {
  createScavengerRouter,
  createScavengerStateStore,
} = require('../../src/routes/scavenger');
const { createGroupsRouter } = require('../../src/routes/groups');

function withTimeout(ms) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(new Error('timeout')), ms);
  return { signal: ac.signal, cancel: () => clearTimeout(id) };
}

async function start(app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: async () => new Promise((resolve) => server.close(resolve)),
  };
}

function jsonOrNull(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// ---------------------------
// Scavenger: submit fuzz
// ---------------------------

test('fuzz: /api/scavenger/submit never 500, always JSON', async (t) => {
  t.timeout?.(30_000);

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const scavengerChallenges = {
    categories: [
      {
        id: 'cat-a',
        name: 'Category A',
        challenges: [
          { id: 'ch-10pts', title: 'Ten', points: 10 },
          { id: 'ch-5pts', title: 'Five', points: 5 },
        ],
      },
    ],
  };

  const scavengerStateStore = createScavengerStateStore();
  const imageScanner = {
    async scanImageData() {
      // Keep deterministic and offline for fuzzing
      return { allowed: false, scanned: true, matchedPrompt: false, reason: 'host review' };
    },
  };

  app.use(createScavengerRouter({ scavengerChallenges, scavengerStateStore, imageScanner }));
  const { baseUrl, stop } = await start(app);
  t.after(() => stop());

  const validDataUrls = [
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'data:image/jpeg;base64,/9j/',
    'data:image/webp;base64,UklGR',
  ];

  const imageDataArb = fc.oneof(
    fc.constantFrom(...validDataUrls),
    fc.string(),
    fc.constant(null),
    fc.constant(undefined)
  );

  const challengeIdArb = fc.oneof(
    fc.constantFrom('ch-10pts', 'ch-5pts', 'does-not-exist', ''),
    fc.string(),
    fc.constant(null),
    fc.constant(undefined)
  );

  await fc.assert(
    fc.asyncProperty(challengeIdArb, imageDataArb, fc.string(), fc.string(), async (challengeId, imageData, playerName, groupCode) => {
      const qs = groupCode ? `?groupCode=${encodeURIComponent(groupCode)}` : '';
      const { signal, cancel } = withTimeout(2000);
      let res;
      try {
        res = await fetch(`${baseUrl}/api/scavenger/submit${qs}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId, imageData, playerName }),
          signal,
        });
      } finally {
        cancel();
      }

      // Invariant: never crash on malformed inputs
      assert.notEqual(res.status, 500);

      // Invariant: should be parseable JSON (router always returns json bodies)
      const text = await res.text();
      const parsed = jsonOrNull(text);
      assert.ok(parsed && typeof parsed === 'object');
    }),
    { numRuns: 300 }
  );
});

// ---------------------------
// Auth: createaccount/login fuzz
// ---------------------------

test('fuzz: /api/createaccount and /api/login never 500, always JSON', async (t) => {
  t.timeout?.(30_000);

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Offline stubs; return "user not found" unless test needs otherwise
  const pool = {
    async query() {
      return { rows: [] };
    },
  };
  const bcrypt = {
    async hash() {
      return 'hash';
    },
    async compare() {
      return false;
    },
  };

  app.use(createAuthRouter({ pool, bcrypt }));
  const { baseUrl, stop } = await start(app);
  t.after(() => stop());

  const anyJsonish = fc.oneof(
    fc.dictionary(fc.string({ maxLength: 20 }), fc.oneof(fc.string({ maxLength: 200 }), fc.integer(), fc.boolean(), fc.constant(null))),
    fc.constant({}),
  );

  await fc.assert(
    fc.asyncProperty(anyJsonish, anyJsonish, async (createBody, loginBody) => {
      // createaccount
      {
        const { signal, cancel } = withTimeout(2000);
        let res;
        try {
          res = await fetch(`${baseUrl}/api/createaccount`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createBody),
            signal,
          });
        } finally {
          cancel();
        }

        assert.notEqual(res.status, 500);
        const parsed = jsonOrNull(await res.text());
        assert.ok(parsed && typeof parsed === 'object');
      }

      // login
      {
        const { signal, cancel } = withTimeout(2000);
        let res;
        try {
          res = await fetch(`${baseUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(loginBody),
            signal,
          });
        } finally {
          cancel();
        }

        assert.notEqual(res.status, 500);
        const parsed = jsonOrNull(await res.text());
        assert.ok(parsed && typeof parsed === 'object');
      }
    }),
    { numRuns: 200 }
  );
});

// ---------------------------
// Groups: create room fuzz (/api/rooms)
// ---------------------------

test('fuzz: /api/rooms never 500, always JSON', async (t) => {
  t.timeout?.(30_000);

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const pool = {
    async query(query, values) {
      // Behave enough like the real route expects:
      // - if user lookup, return host for "host-1", else empty
      if (/select id, role from users/i.test(String(query))) {
        const userId = values && values[0];
        if (userId === 'host-1') return { rows: [{ id: 'host-1', role: 'host' }] };
        return { rows: [] };
      }
      if (/insert into groups/i.test(String(query))) {
        return { rows: [{ id: 'g1', code: values[0], name: values[1], created_by: values[2], created_at: new Date().toISOString(), is_locked: false }] };
      }
      return { rows: [] };
    },
  };

  const generateGroupCode = () => 'ABCDEF';
  app.use(createGroupsRouter({ pool, generateGroupCode }));

  const { baseUrl, stop } = await start(app);
  t.after(() => stop());

  const bodyArb = fc.oneof(
    fc.dictionary(fc.string({ maxLength: 20 }), fc.oneof(fc.string({ maxLength: 200 }), fc.integer(), fc.boolean(), fc.constant(null))),
    fc.constant({}),
  );

  await fc.assert(
    fc.asyncProperty(bodyArb, async (body) => {
      const { signal, cancel } = withTimeout(2000);
      let res;
      try {
        res = await fetch(`${baseUrl}/api/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
      } finally {
        cancel();
      }

      assert.notEqual(res.status, 500);
      const parsed = jsonOrNull(await res.text());
      assert.ok(parsed && typeof parsed === 'object');
    }),
    { numRuns: 200 }
  );
});

