## DiscoverCase

DiscoverCase is a lightweight game platform for CWRU Orientation Week. Hosts create a room, share a code, and players join from their devices to play CWRU-themed trivia and scavenger hunts.

## Major workflows

- **Auth + join flow**
  - Users create an account and log in.
  - **Hosts** create a room (group) and share the room code.
  - **Players** join the room via the code and enter the waiting room.

- **Waiting room**
  - Players appear in a roster and join a Socket.IO room keyed by the group code.
  - Hosts can start a game and broadcast events to everyone in the room.

- **Trivia**
  - Host starts trivia and broadcasts questions.
  - Players submit answers over sockets.
  - Host reveals the correct answer; the server validates responses and awards points, then broadcasts results/leaderboard events.

- **Scavenger hunt**
  - Players upload a photo for a challenge (base64 data URL).
  - The backend attempts an automated AI scan (Gemini) for safety/prompt match.
  - Submissions are either auto-approved (when scan succeeds and allows) or queued for host review, where the host receives the Gemini feedback
  - Host approves/denies submissions; approved submissions award **team points**.

## Key technical choices

- **Monorepo layout**
  - `frontend/`: React UI
  - `backend/`: Node/Express API + Socket.IO server

- **Transport**
  - **REST endpoints** for CRUD-style operations (auth, scavenger submissions/review, room creation/join).
  - **Socket.IO** for real-time gameplay events (trivia questions, answer reveal, join/leave updates).

- **Scavenger scoring model**
  - Scavenger scoring is tracked as a **single total per team (group code)**.
  - Any approved challenge completed by any player in the team increments the same team score.
  - Challenges are idempotent per team (a challenge contributes points at most once to that team total).

- **Scavenger scan reliability**
  - The image scan is treated as a best-effort automation step.
  - When Gemini is overloaded/unavailable, the upload still succeeds and is queued for manual host review with a clear “unable to scan” reason.

## How AI assisted development

AI was used as a coding partner to:

- **Trace runtime errors to the exact source and help with debugging** (e.g., locating the origin of “Unable to scan image right now” and identifying upstream causes like API key expiry or transient 503s).
- **Refactor scoring logic safely** (moving scavenger state from a single global object to per-`groupCode` state, so team scoring behaves correctly across rooms).
- **Design resilience fallbacks** (degrading image scan failures into host-reviewable submissions instead of blocking uploads).
- **Improve test strategy** by adding property-based fuzz tests for key endpoints and mock-object testing for frontend.

## Quality and correctness verification

- **Deterministic unit/integration-style tests (Node’s built-in test runner)**
  - Auth route tests validate status codes and payload shapes with stubbed DB/bcrypt.
  - Group creation tests validate behavior with stubbed DB and deterministic code generation.
  - Socket handler tests validate emitted events using fake sockets + mocked dependencies.
  - Scavenger route tests validate upload validation, review flows, and team scoring behavior.

- **Property-based fuzz testing**
  - Added `fast-check` fuzz tests for key endpoints to assert invariants like:
    - requests with random/malformed inputs should **not crash** the server (no 500s)
    - responses should remain **JSON** and return within a reasonable timeout

To run backend tests:

```bash
cd backend
npm test
```

## Notes / limitations

- Some state (e.g., scavenger team state) is currently stored **in-memory** in the backend. This is simple and fast for events, but resets on server restart and does not scale horizontally without shared storage.