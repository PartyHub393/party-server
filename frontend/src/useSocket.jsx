import { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './contexts/AuthContext';

const SocketContext = createContext();
const socketInstance = io({ path: '/socket.io', autoConnect: false });

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(socketInstance.connected);

  const [roomCode, _setRoomCode] = useState(() => {
    return sessionStorage.getItem('socket_room_code') || null;
  });

  const setRoomCode = (code) => {
    if (code) sessionStorage.setItem('socket_room_code', code);
    else sessionStorage.removeItem('socket_room_code');
    _setRoomCode(code);
  };

  useEffect(() => {
    // Keep auth info in the socket handshake for server-side validation.
    socketInstance.auth = { userId: user?.id };

    // If the socket is already connected and the user changes, reconnect to refresh auth.
    if (socketInstance.connected) {
      socketInstance.disconnect();
    }

    socketInstance.connect();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socketInstance.on('connect', onConnect);
    socketInstance.on('disconnect', onDisconnect);

    return () => {
      socketInstance.off('connect', onConnect);
      socketInstance.off('disconnect', onDisconnect);
    };
  }, [user?.id]);

  return (
    <SocketContext.Provider value={{ socket: socketInstance, connected, roomCode, setRoomCode }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext);