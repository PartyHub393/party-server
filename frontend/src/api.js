const API_BASE = ''

export async function createRoom() {
  const res = await fetch(`${API_BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error('Failed to create room')
  const data = await res.json()
  return data.roomCode
}
