import type { Server as HttpServer } from 'node:http';
import {
  realtimeEvents,
  type ClientToServerEvents,
  type ServerToClientEvents
} from '@roomi/shared';
import { Server } from 'socket.io';
import { isAllowedClientOrigin } from '../env';
import type { RoomService } from '../rooms/room-service';

export function registerRealtimeGateway(
  httpServer: HttpServer,
  roomService: RoomService
) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isAllowedClientOrigin(origin));
      }
    }
  });

  roomService.onRoomUpdated((snapshot) => {
    io.to(snapshot.room.id).emit(realtimeEvents.server.roomUpdated, snapshot);
  });

  io.on('connection', (socket) => {
    socket.on(realtimeEvents.client.subscribeRoom, (roomId, acknowledge) => {
      const snapshot = roomService.getByRoomId(roomId);

      if (!snapshot) {
        acknowledge(undefined);
        socket.emit(realtimeEvents.server.error, 'Room not found');
        return;
      }

      socket.join(snapshot.room.id);
      acknowledge(snapshot);
      socket.emit(realtimeEvents.server.roomSnapshot, snapshot);
    });

    socket.on(realtimeEvents.client.participantReady, (input) => {
      try {
        roomService.setReady(input.roomId, input.participantId, input.isReady);
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
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.leaveRoom, (input) => {
      try {
        roomService.leaveRoom(input.roomId, input.participantId);
        socket.leave(input.roomId);
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected realtime error';
}
