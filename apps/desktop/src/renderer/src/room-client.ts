import { io, type Socket } from 'socket.io-client';
import type {
  ChatMessage,
  ChatSendInput,
  ClientToServerEvents,
  CreateRoomInput,
  GoalRefineInput,
  GoalRefinement,
  JoinRoomInput,
  ParticipantReadyInput,
  UpdateParticipantStatusInput,
  RoomiMessage,
  RoomSubscriptionInput,
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

export function endSession(input: { roomId: string; participantId: string }) {
  return requestSnapshot('/sessions/end', input);
}

export function startBreak(input: { roomId: string; participantId: string }) {
  return requestSnapshot('/sessions/break/start', input);
}

export function endBreak(input: { roomId: string; participantId: string }) {
  return requestSnapshot('/sessions/break/end', input);
}

export function extendBreak(input: { roomId: string; participantId: string; minutes?: number }) {
  return requestSnapshot('/sessions/break/extend', input);
}

export function setGoalAchieved(input: {
  roomId: string;
  participantId: string;
  achieved: boolean;
}) {
  return requestSnapshot(`/rooms/${input.roomId}/goals/achieved`, {
    participantId: input.participantId,
    achieved: input.achieved
  });
}

export async function refineGoal(input: GoalRefineInput): Promise<GoalRefinement> {
  const response = await fetch(`${apiBaseUrl}/goals/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new RoomApiError(`Goal refinement failed: ${response.status}`, response.status);
  }

  return (await response.json()) as GoalRefinement;
}

export function setReady(
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null,
  input: ParticipantReadyInput
) {
  socket?.emit(realtimeEvents.client.participantReady, input);
}

export function updateParticipantStatus(
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null,
  input: UpdateParticipantStatusInput
) {
  socket?.emit(realtimeEvents.client.updateStatus, input);
}

export function sendChatMessage(
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null,
  input: ChatSendInput
) {
  socket?.emit(realtimeEvents.client.sendChatMessage, input);
}

export function createRoomSocket() {
  return io(apiBaseUrl, {
    autoConnect: false,
    transports: ['websocket', 'polling']
  }) as Socket<ServerToClientEvents, ClientToServerEvents>;
}

export function subscribeToRoom(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  input: RoomSubscriptionInput,
  onSnapshot: (snapshot: RoomSnapshot) => void,
  onRoomiMessage: (message: RoomiMessage) => void,
  onError: (message: string) => void,
  onChatMessage?: (message: ChatMessage) => void
) {
  socket.connect();
  socket.emit(realtimeEvents.client.subscribeRoom, input, (snapshot) => {
    if (snapshot) {
      onSnapshot(snapshot);
    }
  });
  socket.on(realtimeEvents.server.roomSnapshot, onSnapshot);
  socket.on(realtimeEvents.server.roomUpdated, onSnapshot);
  socket.on(realtimeEvents.server.roomiMessage, onRoomiMessage);
  socket.on(realtimeEvents.server.error, onError);
  if (onChatMessage) {
    socket.on(realtimeEvents.server.chatMessage, onChatMessage);
  }

  return () => {
    socket.off(realtimeEvents.server.roomSnapshot, onSnapshot);
    socket.off(realtimeEvents.server.roomUpdated, onSnapshot);
    socket.off(realtimeEvents.server.roomiMessage, onRoomiMessage);
    socket.off(realtimeEvents.server.error, onError);
    if (onChatMessage) {
      socket.off(realtimeEvents.server.chatMessage, onChatMessage);
    }
    socket.disconnect();
  };
}

export function leaveRoom(
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null,
  input: { roomId: string; participantId: string }
) {
  socket?.emit(realtimeEvents.client.leaveRoom, input);
}
