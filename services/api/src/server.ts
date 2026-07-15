import cors from 'cors';
import express from 'express';
import type {
  CreateRoomInput,
  GameKind,
  GoalAchievedInput,
  GoalRefineInput,
  JoinRoomInput,
  SessionEndInput,
  SessionStartInput
} from '@roomi/shared';
import { isAllowedClientOrigin } from './env';
import { MlFocusUpstreamError, type MlFocusPredictor } from './focus/ml-focus-client';
import { LlmProxyUpstreamError, type LlmProxy } from './llm/llm-proxy-client';
import type { RoomService } from './rooms/room-service';
import type { RoomiOrchestrator } from './roomi/roomi-orchestrator';
import { computeSummary } from './summaries/summary-service';

export function createApp(
  roomService: RoomService,
  roomiOrchestrator: RoomiOrchestrator,
  mlFocusPredictor?: MlFocusPredictor,
  llmProxy?: LlmProxy
) {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, isAllowedClientOrigin(origin));
      }
    })
  );
  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'roomi-api' });
  });

  app.all('/v1/*', async (request, response) => {
    if (!llmProxy) {
      response.status(503).json({ message: 'LLM proxy is not configured' });
      return;
    }

    try {
      const proxied = await llmProxy.forward({
        method: request.method,
        path: request.originalUrl,
        body: hasRequestBody(request.method) ? request.body : undefined
      });
      if (proxied.contentType) {
        response.set('Content-Type', proxied.contentType);
      }
      response.status(proxied.status).send(proxied.body);
    } catch (error) {
      if (error instanceof LlmProxyUpstreamError) {
        response.status(error.kind === 'timeout' ? 504 : 502).json({ message: error.message });
        return;
      }
      response.status(502).json({ message: 'LLM proxy request failed' });
    }
  });

  app.post('/rooms', async (request, response) => {
    try {
      const session = await roomService.createRoomSession(request.body as CreateRoomInput);
      response.status(201).json(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid room';
      response.status(statusForRoomError(message, 400)).json({ message });
    }
  });

  app.post('/rooms/join', async (request, response) => {
    try {
      const session = await roomService.joinRoomSession(request.body as JoinRoomInput);
      response.json(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Room join failed';
      response.status(statusForRoomError(message, 404)).json({ message });
    }
  });

  app.post('/rooms/:roomId/goals', (request, response) => {
    try {
      const { participantId, rawText } = request.body as {
        participantId: string;
        rawText: string;
      };
      const snapshot = roomService.submitGoal(request.params.roomId, participantId, rawText);
      response.json(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Goal submission failed';
      response.status(statusForRoomError(message, 404)).json({ message });
    }
  });

  app.post('/sessions', async (request, response) => {
    try {
      const { roomId, participantId } = request.body as SessionStartInput;
      const snapshot = roomService.startSession(roomId, participantId);
      const isStudyMode = snapshot.room.settings.activityKind === 'study';
      const text = isStudyMode
        ? await roomiOrchestrator.generateStartMessage({
            sessionMinutes: snapshot.currentSession?.plannedMinutes ?? snapshot.room.settings.sessionMinutes,
            goalCount: snapshot.goals.length
          })
        : await roomiOrchestrator.generateGameIntroMessage({
            game: toFacePartyGameKind(snapshot.room.settings.defaultGameKind),
            playerCount: snapshot.participants.length,
            playStyles: snapshot.goals.map((goal) => goal.rawText.trim()).filter(Boolean),
            tone: 'playful'
          });
      roomService.addRoomiMessage({
        roomId: snapshot.room.id,
        kind: isStudyMode ? 'start' : 'game_intro',
        text
      });
      response.json(roomService.snapshotForParticipant(roomId, participantId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Session start failed';
      response.status(statusForRoomError(message, 404)).json({ message });
    }
  });

  app.post('/sessions/break/start', (request, response) => {
    try {
      const { roomId, participantId } = request.body as SessionStartInput;
      roomService.startBreak(roomId, participantId);
      response.json(roomService.snapshotForParticipant(roomId, participantId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Break start failed';
      response.status(statusForRoomError(message, 404)).json({ message });
    }
  });

  app.post('/sessions/break/end', async (request, response) => {
    try {
      const { roomId, participantId } = request.body as SessionEndInput;
      const snapshot = roomService.endBreak(roomId, participantId);
      const text = await roomiOrchestrator.generateBreakReturnMessage({
        breakMinutes: snapshot.room.settings.breakMinutes
      });
      roomService.addRoomiMessage({
        roomId: snapshot.room.id,
        kind: 'break_return',
        text
      });
      response.json(roomService.snapshotForParticipant(roomId, participantId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Break end failed';
      response.status(statusForRoomError(message, 404)).json({ message });
    }
  });

  app.post('/sessions/break/extend', (request, response) => {
    try {
      const { roomId, participantId, minutes } = request.body as SessionStartInput & {
        minutes?: number;
      };
      roomService.extendBreak(roomId, participantId, minutes ?? 5);
      response.json(roomService.snapshotForParticipant(roomId, participantId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Break extend failed';
      response.status(statusForRoomError(message, 404)).json({ message });
    }
  });

  app.post('/sessions/end', async (request, response) => {
    try {
      const { roomId, participantId } = request.body as SessionEndInput;
      const snapshot = roomService.endSession(roomId, participantId);
      const session = snapshot.currentSession;

      if (!session) {
        throw new Error('No active session to end');
      }

      const ranking = roomService.getFocusRanking(roomId);
      const baseSummary = computeSummary(session, snapshot.goals, ranking);
      const retrospective = await roomiOrchestrator.generateRetrospective({
        sessionMinutes: session.plannedMinutes,
        focusMinutes: baseSummary.focusMinutes,
        goalCompletionRate: baseSummary.goalCompletionRate
      });

      roomService.attachSessionSummary(roomId, { ...baseSummary, ranking, ...retrospective });
      roomService.addRoomiMessage({
        roomId: snapshot.room.id,
        kind: 'summary',
        text: retrospective.lumiComment
      });

      response.json(roomService.snapshotForParticipant(roomId, participantId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Session end failed';
      response.status(statusForRoomError(message, 404)).json({ message });
    }
  });

  app.post('/rooms/:roomId/goals/achieved', (request, response) => {
    try {
      const { participantId, achieved } = request.body as GoalAchievedInput;
      const snapshot = roomService.setGoalAchieved(request.params.roomId, participantId, achieved);
      response.json(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Goal update failed';
      response.status(statusForRoomError(message, 404)).json({ message });
    }
  });

  app.post('/goals/refine', async (request, response) => {
    // The raw goal/style stays server-side; only the refined text and reason go back.
    const { rawGoal, sessionMinutes, mode = 'study_goal', gameKind } = request.body as GoalRefineInput;

    if (
      typeof rawGoal !== 'string' ||
      typeof sessionMinutes !== 'number' ||
      (mode !== 'play_style' && !rawGoal.trim())
    ) {
      response.status(400).json({ message: 'rawGoal (string) and sessionMinutes (number) are required' });
      return;
    }

    const refinement = await roomiOrchestrator.refineGoal(rawGoal, sessionMinutes, mode, gameKind);
    response.json(refinement);
  });

  app.post('/focus/predict', async (request, response) => {
    if (!mlFocusPredictor) {
      response.status(503).json({ message: 'ML focus prediction is not configured' });
      return;
    }

    try {
      response.json(await mlFocusPredictor.predict(request.body));
    } catch (error) {
      if (error instanceof MlFocusUpstreamError) {
        response.status(error.kind === 'timeout' ? 504 : 502).json({ message: error.message });
        return;
      }
      response.status(502).json({ message: 'ML focus prediction failed' });
    }
  });

  app.post('/focus/feedback', async (request, response) => {
    if (!mlFocusPredictor) {
      response.status(503).json({ message: 'ML focus feedback is not configured' });
      return;
    }

    try {
      response.json(await mlFocusPredictor.submitFeedback(request.body));
    } catch (error) {
      if (error instanceof MlFocusUpstreamError) {
        response.status(error.kind === 'timeout' ? 504 : 502).json({ message: error.message });
        return;
      }
      response.status(502).json({ message: 'ML focus feedback failed' });
    }
  });

  app.delete('/focus/feedback/:userId', async (request, response) => {
    if (!mlFocusPredictor) {
      response.status(503).json({ message: 'ML focus feedback is not configured' });
      return;
    }

    try {
      response.json(await mlFocusPredictor.resetFeedback(request.params.userId));
    } catch (error) {
      if (error instanceof MlFocusUpstreamError) {
        response.status(error.kind === 'timeout' ? 504 : 502).json({ message: error.message });
        return;
      }
      response.status(502).json({ message: 'ML focus feedback reset failed' });
    }
  });

  app.get('/rooms/:inviteCode', (request, response) => {
    const snapshot = roomService.getByInviteCode(request.params.inviteCode);

    if (!snapshot) {
      response.status(404).json({ message: 'Room not found' });
      return;
    }

    response.json(snapshot);
  });

  return app;
}

function hasRequestBody(method: string) {
  const normalizedMethod = method.toUpperCase();
  return normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD';
}

function toFacePartyGameKind(kind: GameKind) {
  if (kind === 'copycat_relay') return 'copycat';
  return kind;
}

function statusForRoomError(message: string, fallback: number) {
  if (
    message === 'Room is full' ||
    message === 'Session already started' ||
    message === 'Break mode is not room-wide' ||
    message === 'No active study session to pause' ||
    message === 'No active break to end' ||
    message === 'No active break to extend'
  ) {
    return 409;
  }

  if (message.startsWith('Only the host')) {
    return 403;
  }

  if (message.startsWith('Daily') || message.startsWith('DAILY_')) {
    return 503;
  }

  return fallback;
}
