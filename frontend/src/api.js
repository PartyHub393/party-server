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

export async function createRoom({ userId }) {
  let res
  try {
    res = await fetch(`${API_BASE}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }

  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to create room')
  return data
}

export async function getHostGroups(userId) {
  let res
  try {
    res = await fetch(`${API_BASE}/api/host/groups?userId=${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }

  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to load host groups')
  return data
}

export async function setGroupLock({ groupCode, userId, isLocked }) {
  let res
  try {
    res = await fetch(`${API_BASE}/api/groups/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupCode, userId, isLocked }),
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }

  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to update lobby lock')
  return data
}

export async function joinGroup({ groupCode, userId }) {
  let res
  try {
    res = await fetch(`${API_BASE}/api/groups/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupCode, userId }),
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to join group')
  return data
}

export async function getPlayerGroups(userId) {
  let res
  try {
    res = await fetch(`${API_BASE}/api/player/groups?userId=${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }

  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to load player groups')
  return data
}

export async function createAccount({ username, email, password, role }) {
  let res
  try {
    res = await fetch(`${API_BASE}/api/createaccount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, role }),
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

export async function getScavengerChallenges() {
  let res
  try {
    res = await fetch(`${API_BASE}/api/scavenger/challenges`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to load scavenger challenges')
  return data
}

export async function getScavengerState() {
  let res
  const groupCode = localStorage.getItem('joined_group_code')
  const qs = groupCode ? `?groupCode=${encodeURIComponent(groupCode)}` : ''
  try {
    res = await fetch(`${API_BASE}/api/scavenger/state${qs}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to load scavenger state')
  return data
}

export async function setScavengerTeamName(teamName) {
  let res
  const groupCode = localStorage.getItem('joined_group_code')
  const qs = groupCode ? `?groupCode=${encodeURIComponent(groupCode)}` : ''
  try {
    res = await fetch(`${API_BASE}/api/scavenger/team${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName }),
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to save team name')
  return data
}

export async function submitScavengerPhoto({ challengeId, imageData, playerName }) {
  let res
  const groupCode = localStorage.getItem('joined_group_code')
  const qs = groupCode ? `?groupCode=${encodeURIComponent(groupCode)}` : ''
  try {
    res = await fetch(`${API_BASE}/api/scavenger/submit${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, imageData, playerName }),
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to submit photo')
  return data
}

export async function reviewScavengerSubmission({ submissionId, approved, comment }) {
  let res
  const groupCode = localStorage.getItem('joined_group_code')
  const qs = groupCode ? `?groupCode=${encodeURIComponent(groupCode)}` : ''
  try {
    res = await fetch(`${API_BASE}/api/scavenger/review${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId, approved, comment }),
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to review submission')
  return data
}

export async function cancelScavengerSubmission({ submissionId }) {
  let res
  const groupCode = localStorage.getItem('joined_group_code')
  const qs = groupCode ? `?groupCode=${encodeURIComponent(groupCode)}` : ''
  try {
    res = await fetch(`${API_BASE}/api/scavenger/cancel${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId }),
    })
  } catch (err) {
    throw new Error('Cannot reach server. Is the backend running on port 3000?')
  }
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Failed to cancel submission')
  return data
}