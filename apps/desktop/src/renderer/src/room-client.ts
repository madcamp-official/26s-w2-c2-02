import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  CreateRoomInput,
  JoinRoomInput,
  ParticipantReadyInput,
  RoomSession,
  RoomSnapshot,
  ServerToClientEvents
} from '@roomi/shared';
import { realtimeEvents } from '@roomi/shared';

const apiBaseUrl = import.meta.env.VITE_ROOMI_API_URL ?? 'http://localhost:4100';

export class RoomApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function requestRoomSession(path: string, body: CreateRoomInput | JoinRoomInput) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new RoomApiError(`Room API failed: ${response.status}`, response.status);
  }

  return (await response.json()) as RoomSession;
}

export function createRoomSession(input: CreateRoomInput) {
  return requestRoomSession('/rooms', input);
}

export function joinRoomSession(input: JoinRoomInput) {
  return requestRoomSession('/rooms/join', input);
}

async function requestSnapshot(path: string, body: unknown): Promise<RoomSnapshot> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new RoomApiError(`Room API failed: ${response.status}`, response.status);
  }

  return (await response.json()) as RoomSnapshot;
}

export function submitGoal(input: { roomId: string; participantId: string; rawText: string }) {
  return requestSnapshot(`/rooms/${input.roomId}/goals`, {
    participantId: input.participantId,
    rawText: input.rawText
  });
}

export function startSession(input: { roomId: string; participantId: string }) {
  return requestSnapshot('/sessions', input);
}

export function setReady(
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null,
  input: ParticipantReadyInput
) {
  socket?.emit(realtimeEvents.client.participantReady, input);
}

export function createRoomSocket() {
  return io(apiBaseUrl, {
    autoConnect: false,
    transports: ['websocket', 'polling']
  }) as Socket<ServerToClientEvents, ClientToServerEvents>;
}

export function subscribeToRoom(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  roomId: string,
  onSnapshot: (snapshot: RoomSnapshot) => void,
  onError: (message: string) => void
) {
  socket.connect();
  socket.emit(realtimeEvents.client.subscribeRoom, roomId, (snapshot) => {
    if (snapshot) {
      onSnapshot(snapshot);
    }
  });
  socket.on(realtimeEvents.server.roomSnapshot, onSnapshot);
  socket.on(realtimeEvents.server.roomUpdated, onSnapshot);
  socket.on(realtimeEvents.server.error, onError);

  return () => {
    socket.off(realtimeEvents.server.roomSnapshot, onSnapshot);
    socket.off(realtimeEvents.server.roomUpdated, onSnapshot);
    socket.off(realtimeEvents.server.error, onError);
    socket.disconnect();
  };
}

export function leaveRoom(
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null,
  input: { roomId: string; participantId: string }
) {
  socket?.emit(realtimeEvents.client.leaveRoom, input);
}
