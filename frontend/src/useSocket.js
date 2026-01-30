import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

export function useSocket() {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const s = io({ path: '/socket.io', autoConnect: true })
    setSocket(s)
    s.on('connect', () => setConnected(true))
    s.on('disconnect', () => setConnected(false))
    return () => {
      s.off('connect').off('disconnect')
      s.disconnect()
    }
  }, [])

  return { socket, connected }
}
