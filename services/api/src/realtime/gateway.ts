import type { Server as HttpServer } from 'node:http';
import {
  realtimeEvents,
  type GameSession,
  type ClientToServerEvents,
  type ServerToClientEvents
} from '@roomi/shared';
import { Server } from 'socket.io';
import { isAllowedClientOrigin } from '../env';
import { RoomiOrchestrator } from '../roomi/roomi-orchestrator';
import type { RoomService } from '../rooms/room-service';

const FOCUS_RECOVERY_DELAY_MS = 60_000;
const FOCUS_RECOVERY_COOLDOWN_MS = 5 * 60_000;

export type RealtimeGatewayOptions = {
  focusRecoveryDelayMs?: number;
  focusRecoveryCooldownMs?: number;
};

export function registerRealtimeGateway(
  httpServer: HttpServer,
  roomService: RoomService,
  roomiOrchestrator = new RoomiOrchestrator(),
  options: RealtimeGatewayOptions = {}
) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isAllowedClientOrigin(origin));
      }
    }
  });

  roomService.onRoomUpdated((snapshot) => {
    snapshot.participants.forEach((participant) => {
      io.to(participantChannel(snapshot.room.id, participant.id)).emit(
        realtimeEvents.server.roomUpdated,
        roomService.snapshotForParticipant(snapshot.room.id, participant.id)
      );
    });
  });

  roomService.onRoomiMessage((message) => {
    if (message.targetParticipantId) {
      io.to(participantChannel(message.roomId, message.targetParticipantId)).emit(
        realtimeEvents.server.roomiMessage,
        message
      );
      return;
    }

    io.to(message.roomId).emit(realtimeEvents.server.roomiMessage, message);
  });

  roomService.onGameUpdated((snapshot, game) => {
    io.to(snapshot.room.id).emit(realtimeEvents.server.gameRoundBegin, publicGame(game));
    snapshot.participants.forEach((participant) => {
      io.to(participantChannel(snapshot.room.id, participant.id)).emit(
        realtimeEvents.server.roomUpdated,
        roomService.snapshotForParticipant(snapshot.room.id, participant.id)
      );
    });
  });

  roomService.onMissionAssigned((roomId, mission) => {
    io.to(participantChannel(roomId, mission.playerId)).emit(
      realtimeEvents.server.missionAssign,
      mission
    );
  });

  const lastFocusRecoveryAt = new Map<string, number>();
  const awayTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const focusRecoveryDelayMs = options.focusRecoveryDelayMs ?? FOCUS_RECOVERY_DELAY_MS;
  const focusRecoveryCooldownMs =
    options.focusRecoveryCooldownMs ?? FOCUS_RECOVERY_COOLDOWN_MS;

  io.on('connection', (socket) => {
    const subscriptions = new Map<string, string>();

    socket.on(realtimeEvents.client.subscribeRoom, (input, acknowledge) => {
      const snapshot = roomService.getByRoomId(input.roomId);

      if (!snapshot) {
        acknowledge(undefined);
        socket.emit(realtimeEvents.server.error, 'Room not found');
        return;
      }

      const participantExists = snapshot.participants.some(
        (participant) => participant.id === input.participantId
      );

      if (!participantExists) {
        acknowledge(undefined);
        socket.emit(realtimeEvents.server.error, 'Participant not found');
        return;
      }

      socket.join(snapshot.room.id);
      socket.join(participantChannel(snapshot.room.id, input.participantId));
      subscriptions.set(input.roomId, input.participantId);
      const visibleSnapshot = roomService.snapshotForParticipant(input.roomId, input.participantId);
      acknowledge(visibleSnapshot);
      socket.emit(realtimeEvents.server.roomSnapshot, visibleSnapshot);
    });

    socket.on(realtimeEvents.client.participantReady, (input) => {
      try {
        roomService.setReady(input.roomId, input.participantId, input.isReady);
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.submitGoal, (input) => {
      try {
        roomService.submitGoal(input.roomId, input.participantId, input.rawText);
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

        const cooldownKey = `${input.roomId}:${input.participantId}`;

        if (input.status !== 'away') {
          const timer = awayTimers.get(cooldownKey);
          if (timer) clearTimeout(timer);
          awayTimers.delete(cooldownKey);
          return;
        }

        if (snapshot.room.status === 'studying' && !awayTimers.has(cooldownKey)) {
          const timer = setTimeout(() => {
            awayTimers.delete(cooldownKey);
            void sendFocusRecoveryIfEligible(input.roomId, input.participantId, cooldownKey);
          }, focusRecoveryDelayMs);
          timer.unref?.();
          awayTimers.set(cooldownKey, timer);
        }
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.startGame, (input) => {
      try {
        roomService.startGame(input.roomId, input.participantId, input.kind);
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.reportExpression, (input) => {
      try {
        if (input.missionResult) {
          const game = roomService.recordMissionResult(input.roomId, input.missionResult);
          io.to(input.roomId).emit(realtimeEvents.server.missionResult, input.missionResult);
          io.to(input.roomId).emit(realtimeEvents.server.gameRoundBegin, publicGame(game));
          return;
        }

        if (input.signals) {
          const game = roomService.recordBluffResult(
            input.roomId,
            input.participantId,
            input.signals
          );
          io.to(input.roomId).emit(realtimeEvents.server.gameRoundBegin, publicGame(game));
        }
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.placeBluffBet, (input) => {
      try {
        const game = roomService.placeBluffBet(input.roomId, {
          participantId: input.participantId,
          targetId: input.targetId,
          predictsCrack: input.predictsCrack
        });
        io.to(input.roomId).emit(realtimeEvents.server.gameRoundBegin, publicGame(game));
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.advanceRelay, (input) => {
      try {
        const game = roomService.advanceRelay(input.roomId, input.link);
        io.to(input.roomId).emit(realtimeEvents.server.gameRoundBegin, publicGame(game));
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.revealGame, (input) => {
      try {
        const game = roomService.revealGame(input.roomId, input.participantId, input.gameId);
        io.to(input.roomId).emit(realtimeEvents.server.gameReveal, game);
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.leaveRoom, (input) => {
      try {
        roomService.leaveRoom(input.roomId, input.participantId);
        subscriptions.delete(input.roomId);
        socket.leave(input.roomId);
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on('disconnect', () => {
      subscriptions.forEach((participantId, roomId) => {
        const participantStillExists = roomService
          .getByRoomId(roomId)
          ?.participants.some((participant) => participant.id === participantId);
        if (participantStillExists) roomService.leaveRoom(roomId, participantId);
      });
      subscriptions.clear();
    });
  });

  async function sendFocusRecoveryIfEligible(
    roomId: string,
    participantId: string,
    cooldownKey: string
  ) {
    const snapshot = roomService.getByRoomId(roomId);
    const lastSentAt = lastFocusRecoveryAt.get(cooldownKey) ?? 0;

    if (
      !snapshot ||
      snapshot.room.status !== 'studying' ||
      Date.now() - lastSentAt < focusRecoveryCooldownMs
    ) {
      return;
    }

    const participant = snapshot.participants.find(
      (candidate) => candidate.id === participantId && candidate.status === 'away'
    );

    if (!participant) return;

    const goal = snapshot.goals.find((candidate) => candidate.participantId === participantId);
    lastFocusRecoveryAt.set(cooldownKey, Date.now());

    const text = await roomiOrchestrator.generateFocusRecoveryMessage({
      nickname: participant.nickname,
      goal: goal?.refinedText ?? goal?.rawText,
      status: 'away'
    });
    roomService.addRoomiMessage({
      roomId,
      kind: 'focus_recovery',
      text,
      targetParticipantId: participant.id
    });
  }

}

function participantChannel(roomId: string, participantId: string) {
  return `${roomId}:participant:${participantId}`;
}

function publicGame(game: GameSession): GameSession {
  return game.status === 'reveal' ? game : { ...game, missions: [] };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected realtime error';
}
