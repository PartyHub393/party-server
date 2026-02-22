import { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();
const socketInstance = io({ path: '/socket.io', autoConnect: false });

export function SocketProvider({ children }) {
  const [connected, setConnected] = useState(socketInstance.connected);

  const [roomCode, _setRoomCode] = useState(() => {
    return localStorage.getItem('socket_room_code') || null;
  });

  const setRoomCode = (code) => {
    if (code) localStorage.setItem('socket_room_code', code);
    else localStorage.removeItem('socket_room_code');
    _setRoomCode(code);
  };

  useEffect(() => {
    if (!socketInstance.connected) {
      socketInstance.connect();
    }

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socketInstance.on('connect', onConnect);
    socketInstance.on('disconnect', onDisconnect);

    if (!socketInstance.connected) {
      socketInstance.connect();
    }

    return () => {
      socketInstance.off('connect', onConnect);
      socketInstance.off('disconnect', onDisconnect); 
    };
    }, [])

  return (
    <SocketContext.Provider value={{ socket: socketInstance, connected, roomCode, setRoomCode }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext);