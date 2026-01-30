# PartyHub

Jackbox-style party game platform. Create rooms, share a code, and have players join from their devices.

## Structure

- **`backend/`** – Node.js/Express + Socket.io server (room creation, real-time join/leave).
- **`frontend/`** – Vite + React app (host screen + player join screen).

## Setup

```bash
# Install all dependencies
npm run install:all

# Or install separately
cd backend && npm install
cd ../frontend && npm install
```

## Run

```bash
# Terminal 1 – backend (default http://localhost:3000)
npm run dev:backend

# Terminal 2 – frontend (default http://localhost:5173)
npm run dev:frontend
```

Then open the frontend URL. Create a room on the host screen, then join from another tab or device at `/join` with the 6-letter code and a username.

## Optional: PostgreSQL

The backend can use PostgreSQL for the `/db` health check. Set `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` (or use defaults in `backend/src/db.js`). Room/player state is in-memory and does not require the DB.
