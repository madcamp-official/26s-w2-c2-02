import type { Server as HttpServer } from 'node:http';
import {
  realtimeEvents,
  type GameSession,
  type HiddenMissionVerify,
  type MissionResult,
  type RoomSnapshot,
  type ClientToServerEvents,
  type ServerToClientEvents
} from '@roomi/shared';
import { Server } from 'socket.io';
import { isAllowedClientOrigin } from '../env';
import { RoomiOrchestrator, type FacePartyGameKind } from '../roomi/roomi-orchestrator';
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
    scheduleNextRoundIfNeeded(game);
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
  const nextRoundTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
        const game = roomService.startGame(input.roomId, input.participantId, input.kind);
        void sendGameIntro(input.roomId, game).catch(logGameMessageFailure);
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
          void sendMissionReaction(input.roomId, input.missionResult).catch(logGameMessageFailure);
          return;
        }

        if (input.signals) {
          const game = roomService.recordBluffResult(
            input.roomId,
            input.participantId,
            input.signals
          );
          io.to(input.roomId).emit(realtimeEvents.server.gameRoundBegin, publicGame(game));
          void sendBluffReaction(input.roomId, input.participantId, game).catch(logGameMessageFailure);
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
        void sendBluffBetReaction(input.roomId, input.participantId, input.targetId).catch(
          logGameMessageFailure
        );
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.advanceRelay, (input) => {
      try {
        const game = roomService.advanceRelay(input.roomId, input.link);
        io.to(input.roomId).emit(realtimeEvents.server.gameRoundBegin, publicGame(game));
        void sendRelayReaction(
          input.roomId,
          input.link.fromId,
          input.link.toId,
          input.link.similarity
        ).catch(logGameMessageFailure);
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.revealGame, (input) => {
      try {
        const game = roomService.revealGame(input.roomId, input.participantId, input.gameId);
        io.to(input.roomId).emit(realtimeEvents.server.gameReveal, game);
        void sendGameReveal(input.roomId, game).catch(logGameMessageFailure);
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.nextRoundReady, (input) => {
      try {
        const game = roomService.markNextRoundReady(
          input.roomId,
          input.participantId,
          input.gameId
        );
        io.to(input.roomId).emit(realtimeEvents.server.gameRoundBegin, publicGame(game));
        if (game.status === 'in_round') {
          void sendGameIntro(input.roomId, game).catch(logGameMessageFailure);
        }
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

  function scheduleNextRoundIfNeeded(game: GameSession) {
    const key = `${game.roomId}:${game.id}`;
    if (game.status !== 'between_round' || !game.nextRoundStartsAt) {
      const existing = nextRoundTimers.get(key);
      if (existing) clearTimeout(existing);
      nextRoundTimers.delete(key);
      return;
    }

    if (nextRoundTimers.has(key)) return;

    const delayMs = Math.max(0, Date.parse(game.nextRoundStartsAt) - Date.now());
    const timer = setTimeout(() => {
      nextRoundTimers.delete(key);
      const nextGame = roomService.startNextRoundIfDue(game.roomId, game.id);
      if (nextGame?.status === 'in_round') {
        io.to(game.roomId).emit(realtimeEvents.server.gameRoundBegin, publicGame(nextGame));
        void sendGameIntro(game.roomId, nextGame).catch(logGameMessageFailure);
      }
    }, delayMs);
    timer.unref?.();
    nextRoundTimers.set(key, timer);
  }

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

  async function sendGameIntro(roomId: string, game: GameSession) {
    const snapshot = roomService.getByRoomId(roomId);
    const text = await roomiOrchestrator.generateGameIntroMessage({
      game: toFacePartyGameKind(game.kind),
      playerCount: snapshot?.participants.length,
      playStyles: playStyles(snapshot),
      tone: 'playful'
    });
    roomService.addRoomiMessage({ roomId, kind: 'game_intro', text });
  }

  async function sendMissionReaction(roomId: string, result: MissionResult) {
    const snapshot = roomService.getByRoomId(roomId);
    const mission = snapshot?.currentGame?.missions?.find(
      (item) => item.id === result.missionId && item.playerId === result.playerId
    );
    const text = await roomiOrchestrator.generateGameReactionMessage({
      game: 'hidden_mission',
      event: result.success ? 'mission_success' : result.count > 0 ? 'mission_progress' : 'mission_fail',
      visibleSignals: [hiddenMissionSignalHint(mission?.verify)],
      tone: 'playful'
    });
    roomService.addRoomiMessage({ roomId, kind: 'round_prompt', text });
  }

  async function sendBluffBetReaction(roomId: string, participantId: string, targetId: string) {
    const snapshot = roomService.getByRoomId(roomId);
    const actor = snapshot?.participants.find((participant) => participant.id === participantId);
    const target = snapshot?.participants.find((participant) => participant.id === targetId);
    const text = await roomiOrchestrator.generateGameReactionMessage({
      game: 'poker_bluff',
      event: 'bluff_bet',
      actorNickname: actor?.nickname,
      targetNickname: target?.nickname,
      actorPlayStyle: playStyleFor(snapshot, participantId),
      targetPlayStyle: playStyleFor(snapshot, targetId),
      tone: 'playful'
    });
    roomService.addRoomiMessage({ roomId, kind: 'tell_hint', text });
  }

  async function sendBluffReaction(roomId: string, targetId: string, game: GameSession) {
    const snapshot = roomService.getByRoomId(roomId);
    const target = snapshot?.participants.find((participant) => participant.id === targetId);
    const result = game.bluffResult;
    if (!result) return;

    const text = await roomiOrchestrator.generateGameReactionMessage({
      game: 'poker_bluff',
      event: result.cracked ? 'bluff_cracked' : 'bluff_held',
      actorNickname: target?.nickname,
      actorPlayStyle: playStyleFor(snapshot, targetId),
      points: result.cracked ? undefined : 8,
      visibleSignals: result.tell ? [visibleTellLabel(result.tell)] : ['흔들림 없는 타이밍'],
      tone: 'playful'
    });
    roomService.addRoomiMessage({ roomId, kind: 'tell_hint', text });
  }

  async function sendRelayReaction(
    roomId: string,
    fromId: string,
    toId: string,
    similarity: number
  ) {
    const snapshot = roomService.getByRoomId(roomId);
    const actor = snapshot?.participants.find((participant) => participant.id === fromId);
    const target = snapshot?.participants.find((participant) => participant.id === toId);
    const text = await roomiOrchestrator.generateGameReactionMessage({
      game: 'copycat',
      event: 'relay_advanced',
      actorNickname: actor?.nickname,
      targetNickname: target?.nickname,
      actorPlayStyle: playStyleFor(snapshot, fromId),
      targetPlayStyle: playStyleFor(snapshot, toId),
      points: Math.round(Math.max(0, Math.min(1, similarity)) * 10),
      visibleSignals: [`유사도 ${Math.round(Math.max(0, Math.min(1, similarity)) * 100)}%`],
      tone: 'playful'
    });
    roomService.addRoomiMessage({ roomId, kind: 'round_prompt', text });
  }

  async function sendGameReveal(roomId: string, game: GameSession) {
    const snapshot = roomService.getByRoomId(roomId);
    const winner = [...game.scores].sort((left, right) => right.points - left.points)[0];
    const winnerNickname = snapshot?.participants.find(
      (participant) => participant.id === winner?.participantId
    )?.nickname;
    const text = await roomiOrchestrator.generateGameRevealMessage({
      game: toFacePartyGameKind(game.kind),
      playerCount: snapshot?.participants.length,
      winnerNickname,
      visibleSignals: visibleSignalsForGame(game),
      playStyles: playStyles(snapshot),
      tone: 'playful'
    });
    roomService.addRoomiMessage({ roomId, kind: 'game_reveal', text });
  }

}

function participantChannel(roomId: string, participantId: string) {
  return `${roomId}:participant:${participantId}`;
}

function publicGame(game: GameSession): GameSession {
  return game.status === 'reveal' ? game : { ...game, missions: [] };
}

function toFacePartyGameKind(kind: GameSession['kind']): FacePartyGameKind {
  if (kind === 'copycat_relay') return 'copycat';
  return kind;
}

function visibleSignalsForGame(game: GameSession): string[] {
  if (game.kind === 'hidden_mission') {
    return (game.missionResults ?? []).map((result) => `미션 집계 ${result.count}회`);
  }
  if (game.kind === 'poker_bluff') {
    return game.bluffResult?.tell ? [visibleTellLabel(game.bluffResult.tell)] : [];
  }
  return (game.relayLinks ?? []).map(
    (link) => `유사도 ${Math.round(link.similarity * 100)}%`
  );
}

function visibleTellLabel(tell: NonNullable<GameSession['bluffResult']>['tell']): string {
  if (tell === 'smile') return '미소';
  if (tell === 'jaw') return '입 벌림';
  if (tell === 'brow') return '눈썹 움직임';
  return '보이는 표정 신호';
}

function hiddenMissionSignalHint(verify: HiddenMissionVerify | undefined): string {
  if (verify === 'wink_count') return '윙크처럼 보이는 깜빡임';
  if (verify === 'smile_count') return '작은 미소가 스친 순간';
  if (verify === 'brow_count') return '눈썹을 치켜뜬 움직임';
  if (verify === 'cheek_puff_count') return '볼이 살짝 부푼 움직임';
  if (verify === 'no_jaw_open') return '입 벌림 신호';
  return '보이는 표정 신호';
}

function playStyleFor(snapshot: RoomSnapshot | undefined, participantId: string): string | undefined {
  return snapshot?.goals
    .find((goal) => goal.participantId === participantId)
    ?.rawText.trim() || undefined;
}

function playStyles(snapshot: RoomSnapshot | undefined): string[] | undefined {
  const styles = snapshot?.goals
    .map((goal) => goal.rawText.trim())
    .filter(Boolean);
  return styles && styles.length > 0 ? styles : undefined;
}

function logGameMessageFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[RealtimeGateway] Roomi game message failed: ${message}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected realtime error';
}
