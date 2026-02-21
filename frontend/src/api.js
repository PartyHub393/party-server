const API_BASE = ''

async function parseJson(res) {
  const text = await res.text()
  if (!text || text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function createRoom() {
  const res = await fetch(`${API_BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to create room')
  return data?.roomCode
}

export async function createAccount({ username, email, password }) {
  let res
  try {
    res = await fetch(`${API_BASE}/api/createaccount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Sign up failed')
  return data
}

export async function login({ username, password }) {
  let res
  try {
    res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Login failed')
  return data
}


  export async function fetchQuestion(seen = []) {
    let res
    try {
      res = await fetch(`${API_BASE}/api/trivia/random?seen=${seen.join(',')}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (err) {
      console.log('Fetch error:', err)
      throw new Error('Cannot reach server. Is the backend running on port 3000?')
    }
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Failed to fetch question')
    return data
  }