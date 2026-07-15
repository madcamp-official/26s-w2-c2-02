import type { Server as HttpServer } from 'node:http';
import {
  realtimeEvents,
  type GameSession,
  type MissionResult,
  type ParticipantStatus,
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
const FOCUS_RANKING_HEARTBEAT_MS = 12_000;
// One minute of unbroken distraction is the README's trigger for a private check-in.
// Recovering to focused clears the pending timer, so this only fires on a sustained
// run. The cooldown is longer than the away one because distraction recurs far more
// often over a session and repeated nudges would just be nagging.
const DISTRACTED_RECOVERY_DELAY_MS = 60_000;
const DISTRACTED_RECOVERY_COOLDOWN_MS = 10 * 60_000;

/** Participant statuses Roomi will privately check in about. */
type RecoveryStatus = 'away' | 'distracted';

export type RealtimeGatewayOptions = {
  focusRecoveryDelayMs?: number;
  focusRecoveryCooldownMs?: number;
  focusRankingHeartbeatMs?: number;
  distractedRecoveryDelayMs?: number;
  distractedRecoveryCooldownMs?: number;
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

  const focusRankingHeartbeatMs = options.focusRankingHeartbeatMs ?? FOCUS_RANKING_HEARTBEAT_MS;
  const focusRankingHeartbeats = new Map<string, ReturnType<typeof setInterval>>();

  function broadcastFocusRanking(roomId: string) {
    io.to(roomId).emit(realtimeEvents.server.focusRankingUpdated, {
      roomId,
      ranking: roomService.getFocusRanking(roomId)
    });
  }

  roomService.onRoomUpdated((snapshot) => {
    snapshot.participants.forEach((participant) => {
      io.to(participantChannel(snapshot.room.id, participant.id)).emit(
        realtimeEvents.server.roomUpdated,
        roomService.snapshotForParticipant(snapshot.room.id, participant.id)
      );
    });

    const roomId = snapshot.room.id;
    const hasHeartbeat = focusRankingHeartbeats.has(roomId);

    if (snapshot.room.status === 'studying' && !hasHeartbeat) {
      // Status-change broadcasts already cover most updates in real time; this
      // heartbeat only exists to keep ticking for a participant who stays
      // 'focused' long enough that no status-change event fires at all.
      const timer = setInterval(() => broadcastFocusRanking(roomId), focusRankingHeartbeatMs);
      timer.unref?.();
      focusRankingHeartbeats.set(roomId, timer);
    } else if (snapshot.room.status !== 'studying' && hasHeartbeat) {
      clearInterval(focusRankingHeartbeats.get(roomId));
      focusRankingHeartbeats.delete(roomId);
    }
  });

  roomService.onFocusRankingUpdated(({ roomId, ranking }) => {
    io.to(roomId).emit(realtimeEvents.server.focusRankingUpdated, { roomId, ranking });
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

  roomService.onChatMessage((message) => {
    io.to(message.roomId).emit(realtimeEvents.server.chatMessage, message);
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
  const recoveryTimers = new Map<
    string,
    { status: RecoveryStatus; timer: ReturnType<typeof setTimeout> }
  >();
  const nextRoundTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const focusRecoveryDelayMs = options.focusRecoveryDelayMs ?? FOCUS_RECOVERY_DELAY_MS;
  const focusRecoveryCooldownMs =
    options.focusRecoveryCooldownMs ?? FOCUS_RECOVERY_COOLDOWN_MS;
  const distractedRecoveryDelayMs =
    options.distractedRecoveryDelayMs ?? DISTRACTED_RECOVERY_DELAY_MS;
  const distractedRecoveryCooldownMs =
    options.distractedRecoveryCooldownMs ?? DISTRACTED_RECOVERY_COOLDOWN_MS;

  const recoveryDelayFor = (status: RecoveryStatus) =>
    status === 'away' ? focusRecoveryDelayMs : distractedRecoveryDelayMs;
  const recoveryCooldownFor = (status: RecoveryStatus) =>
    status === 'away' ? focusRecoveryCooldownMs : distractedRecoveryCooldownMs;

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
        const status = isRecoveryStatus(input.status) ? input.status : null;
        const pending = recoveryTimers.get(cooldownKey);

        // Re-reporting the same status must not restart the clock, or a client that
        // repeats its presence would push the nudge back forever.
        if (pending && pending.status === status) {
          return;
        }

        if (pending) {
          clearTimeout(pending.timer);
          recoveryTimers.delete(cooldownKey);
        }

        if (!status || snapshot.room.status !== 'studying') {
          return;
        }

        const timer = setTimeout(() => {
          recoveryTimers.delete(cooldownKey);
          void sendFocusRecoveryIfEligible(input.roomId, input.participantId, cooldownKey, status);
        }, recoveryDelayFor(status));
        timer.unref?.();
        recoveryTimers.set(cooldownKey, { status, timer });
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

    socket.on(realtimeEvents.client.seedRelay, (input) => {
      try {
        const game = roomService.seedRelay(
          input.roomId,
          input.participantId,
          input.gameId,
          input.signals
        );
        io.to(input.roomId).emit(realtimeEvents.server.gameRoundBegin, publicGame(game));
      } catch (error) {
        socket.emit(realtimeEvents.server.error, errorMessage(error));
      }
    });

    socket.on(realtimeEvents.client.advanceRelay, (input) => {
      try {
        const game = roomService.advanceRelay(
          input.roomId,
          input.participantId,
          input.gameId,
          input.signals
        );
        io.to(input.roomId).emit(realtimeEvents.server.gameRoundBegin, publicGame(game));
        const link = game.relayLinks?.at(-1);
        if (link) {
          void sendRelayReaction(input.roomId, link.fromId, link.toId, link.similarity).catch(
            logGameMessageFailure
          );
        }
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

    socket.on(realtimeEvents.client.sendChatMessage, (input) => {
      try {
        const message = roomService.addChatMessage(input);
        void sendChatReaction(input.roomId, message.id).catch(logGameMessageFailure);
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
    cooldownKey: string,
    status: RecoveryStatus
  ) {
    const snapshot = roomService.getByRoomId(roomId);
    const lastSentAt = lastFocusRecoveryAt.get(cooldownKey) ?? 0;

    if (
      !snapshot ||
      snapshot.room.status !== 'studying' ||
      Date.now() - lastSentAt < recoveryCooldownFor(status)
    ) {
      return;
    }

    // Still in the state we scheduled for: anyone who already recovered on their
    // own does not need to hear about it.
    const participant = snapshot.participants.find(
      (candidate) => candidate.id === participantId && candidate.status === status
    );

    if (!participant) return;

    const goal = snapshot.goals.find((candidate) => candidate.participantId === participantId);
    lastFocusRecoveryAt.set(cooldownKey, Date.now());

    const text = await roomiOrchestrator.generateFocusRecoveryMessage({
      nickname: participant.nickname,
      goal: goal?.refinedText ?? goal?.rawText,
      status
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
      roundNumber: game.round.index,
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
    if (!mission || result.success || mission.target - result.count !== 1) return;
    roomService.addRoomiMessage({
      roomId,
      kind: 'round_prompt',
      text: '누군가 거의 미션을 끝낸 것 같은데...?'
    });
  }

  async function sendChatReaction(roomId: string, messageId: string) {
    const snapshot = roomService.getByRoomId(roomId);
    const currentGame = snapshot?.currentGame;
    if (!snapshot || !currentGame) return;

    const recentMessages = roomService.recentChatMessages(roomId, 8);
    const latest = recentMessages.find((message) => message.id === messageId);
    if (!latest) return;

    const text = await roomiOrchestrator.generateChatReactionMessage({
      game: toFacePartyGameKind(currentGame.kind),
      latestNickname: latest.nickname,
      latestText: latest.text,
      recentMessages: recentMessages.map((message) => ({
        nickname: message.nickname,
        text: message.text
      })),
      playStyles: playStyles(snapshot),
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

function isRecoveryStatus(status: ParticipantStatus): status is RecoveryStatus {
  return status === 'away' || status === 'distracted';
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
