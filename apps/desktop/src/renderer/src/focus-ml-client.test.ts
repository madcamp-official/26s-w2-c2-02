import { describe, expect, it, vi } from 'vitest';
import {
  type FeatureWindowV1,
  MlFocusClientError,
  parsePredictResponse,
  predictFocusWindow
} from './focus-ml-client';

const featureWindow: FeatureWindowV1 = {
  windowId: 'window-1',
  userId: 'user-1',
  sessionId: 'session-1',
  windowStart: '2026-07-13T08:00:00.000Z',
  windowEnd: '2026-07-13T08:00:20.000Z',
  durationSec: 20,
  features: {
    facePresenceRatio: 1,
    avgFaceDetectionConfidence: 1,
    eyeClosedRatio: 0,
    headYawMean: 0,
    headYawStd: 0,
    headPitchMean: 0,
    headPitchStd: 0,
    headDownRatio: 0,
    headTurnedRatio: 0,
    lowConfidenceRatio: 0,
    motionAmount: 0,
    ruleBasedScoreMean: 1,
    ruleBasedScoreMin: 1
  },
  ruleBasedLabel: 'focused'
};

describe('focus ML client', () => {
  it('keeps legacy shouldPrompt responses compatible with correction prompts', () => {
    const response = parsePredictResponse({
      modelVersion: 'rule-based-fallback',
      label: 'distracted',
      score: 1.4,
      probabilities: {
        focused: 0.1,
        distracted: 0.9
      },
      confidence: 0.8,
      shouldPrompt: true,
      reasons: ['head_down']
    });

    expect(response.promptKind).toBe('correction');
    expect(response.score).toBe(1);
    expect(response.probabilities.away).toBe(0);
  });

  it('posts feature schema v1 windows to the configured ML server', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        modelVersion: '20260713-153527',
        label: 'focused',
        score: 0.92,
        probabilities: {
          focused: 0.92,
          distracted: 0.05,
          away: 0.02,
          break_or_paused: 0.01
        },
        confidence: 0.92,
        shouldPrompt: false,
        promptKind: null,
        reasons: []
      })
    });

    const response = await predictFocusWindow(featureWindow, {
      baseUrl: 'http://localhost:8080',
      fetcher
    });

    expect(response.label).toBe('focused');
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:8080/focus/predict',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(featureWindow),
        signal: undefined
      })
    );
  });

  it('turns invalid response shapes into client errors', () => {
    expect(() => parsePredictResponse({ label: 'phone' })).toThrow(MlFocusClientError);
  });
});
