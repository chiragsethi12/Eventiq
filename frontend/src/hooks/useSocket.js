import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';

const getSocketOrigin = () => {
  const apiUrl = import.meta.env.VITE_API_URL;

  if (!apiUrl) {
    return typeof window !== 'undefined' ? window.location.origin : null;
  }

  try {
    return new URL(apiUrl).origin;
  } catch (_error) {
    return apiUrl;
  }
};

let sharedSocket = null;
let sharedSocketToken = null;
let sharedSocketOrigin = null;
let connectedState = false;
let activeSocketConsumers = 0;

const connectionSubscribers = new Set();

const notifyConnectionSubscribers = () => {
  connectionSubscribers.forEach((subscriber) => {
    subscriber(connectedState);
  });
};

const handleSocketConnect = () => {
  connectedState = true;
  notifyConnectionSubscribers();
};

const handleSocketDisconnect = () => {
  connectedState = false;
  notifyConnectionSubscribers();
};

const teardownSharedSocket = () => {
  if (sharedSocket) {
    sharedSocket.off('connect', handleSocketConnect);
    sharedSocket.off('disconnect', handleSocketDisconnect);
    sharedSocket.disconnect();
  }

  sharedSocket = null;
  sharedSocketToken = null;
  sharedSocketOrigin = null;
  connectedState = false;
  notifyConnectionSubscribers();
};

const createSharedSocket = ({ accessToken, socketOrigin }) => {
  const socket = io(socketOrigin, {
    auth: { token: accessToken },
    transports: ['websocket']
  });

  socket.on('connect', handleSocketConnect);
  socket.on('disconnect', handleSocketDisconnect);

  sharedSocket = socket;
  sharedSocketToken = accessToken;
  sharedSocketOrigin = socketOrigin;
  connectedState = socket.connected;

  return socket;
};

const ensureSharedSocket = (accessToken) => {
  const socketOrigin = getSocketOrigin();

  if (!accessToken || !socketOrigin) {
    return null;
  }

  if (
    sharedSocket &&
    sharedSocketToken === accessToken &&
    sharedSocketOrigin === socketOrigin
  ) {
    return sharedSocket;
  }

  teardownSharedSocket();
  return createSharedSocket({ accessToken, socketOrigin });
};

export function useSocket(eventId) {
  const accessToken = useSelector((state) => state.auth.accessToken);
  const [socketInstance, setSocketInstance] = useState(sharedSocket);
  const [connected, setConnected] = useState(connectedState);

  useEffect(() => {
    connectionSubscribers.add(setConnected);
    setConnected(connectedState);

    return () => {
      connectionSubscribers.delete(setConnected);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setSocketInstance(null);
      return undefined;
    }

    const socket = ensureSharedSocket(accessToken);

    if (!socket) {
      setSocketInstance(null);
      return undefined;
    }

    setSocketInstance(socket);
    activeSocketConsumers += 1;

    const joinEventRoom = () => {
      if (!eventId) {
        return;
      }

      socket.emit('join_event', { eventId });
    };

    const refreshSeatState = () => {
      if (!eventId) {
        return;
      }

      socket.emit('get_seat_state', { eventId });
    };

    if (eventId && socket.connected) {
      joinEventRoom();
    }

    socket.on('connect', joinEventRoom);
    socket.io.on('reconnect', refreshSeatState);

    return () => {
      socket.off('connect', joinEventRoom);
      socket.io.off('reconnect', refreshSeatState);
      activeSocketConsumers = Math.max(0, activeSocketConsumers - 1);

      if (activeSocketConsumers === 0) {
        teardownSharedSocket();
      }
    };
  }, [accessToken, eventId]);

  const emit = useCallback((eventName, payload = {}) => {
    if (!sharedSocket) {
      return false;
    }

    sharedSocket.emit(eventName, payload);
    return true;
  }, []);

  return {
    socket: socketInstance,
    connected,
    emit
  };
}
