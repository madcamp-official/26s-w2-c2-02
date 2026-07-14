import cors from 'cors';
import express from 'express';
import type {
  CreateRoomInput,
  GoalRefineInput,
  JoinRoomInput,
  SessionStartInput
} from '@roomi/shared';
import { isAllowedClientOrigin } from './env';
import { MlFocusUpstreamError, type MlFocusPredictor } from './focus/ml-focus-client';
import type { RoomService } from './rooms/room-service';
import type { RoomiOrchestrator } from './roomi/roomi-orchestrator';

export function createApp(
  roomService: RoomService,
  roomiOrchestrator: RoomiOrchestrator,
  mlFocusPredictor?: MlFocusPredictor
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
      const text = await roomiOrchestrator.generateStartMessage({
        sessionMinutes: snapshot.currentSession?.plannedMinutes ?? snapshot.room.settings.sessionMinutes,
        goalCount: snapshot.goals.length
      });
      roomService.addRoomiMessage({
        roomId: snapshot.room.id,
        kind: 'start',
        text
      });
      response.json(roomService.snapshotForParticipant(roomId, participantId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Session start failed';
      response.status(statusForRoomError(message, 404)).json({ message });
    }
  });

  app.post('/goals/refine', async (request, response) => {
    // The raw goal stays server-side; only the refined text and reason go back.
    const { rawGoal, sessionMinutes } = request.body as GoalRefineInput;
    const refinement = await roomiOrchestrator.refineGoal(rawGoal, sessionMinutes);
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

function statusForRoomError(message: string, fallback: number) {
  if (message === 'Room is full' || message === 'Session already started') {
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
