import type { Server as HttpServer } from 'node:http';
import {
  realtimeEvents,
  type ClientToServerEvents,
  type ServerToClientEvents
} from '@roomi/shared';
import { Server } from 'socket.io';
import { env } from '../env';
import type { RoomService } from '../rooms/room-service';

export function registerRealtimeGateway(
  httpServer: HttpServer,
  roomService: RoomService
) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: env.clientOrigin }
  });

  io.on('connection', (socket) => {
    socket.on(realtimeEvents.client.joinRoom, (input, acknowledge) => {
      try {
        const snapshot = roomService.joinRoom(input);
        socket.join(snapshot.room.id);
        acknowledge(snapshot);
        io.to(snapshot.room.id).emit(realtimeEvents.server.roomUpdated, snapshot);
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.updateStatus, (input) => {
      try {
        const snapshot = roomService.updateParticipantStatus(
          input.roomId,
          input.participantId,
          input.status
        );
        io.to(input.roomId).emit(realtimeEvents.server.roomUpdated, snapshot);
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.leaveRoom, (roomId) => {
      socket.leave(roomId);
    });
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected realtime error';
}
