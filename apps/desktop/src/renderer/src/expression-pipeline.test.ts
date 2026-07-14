import { describe, expect, it } from 'vitest';
import {
  expressionSignalsFromBlendshapes,
  missionResultFromCounter,
  updateHiddenMissionCounter,
  type BlendshapeCategory
} from './expression-pipeline';

function categories(items: Record<string, number>): BlendshapeCategory[] {
  return Object.entries(items).map(([categoryName, score]) => ({ categoryName, score }));
}

describe('expression-pipeline', () => {
  it('maps MediaPipe blendshape scores to stable expression signals', () => {
    const signals = expressionSignalsFromBlendshapes(
      categories({
        eyeBlinkLeft: 0.8,
        eyeBlinkRight: 0.1,
        mouthSmileLeft: 0.6,
        jawOpen: 0.2,
        browInnerUp: 0.5,
        cheekPuffLeft: 0.4
      }),
      undefined,
      1234
    );

    expect(signals).toMatchObject({
      timestamp: 1234,
      smile: 0.6,
      jawOpen: 0.2,
      winkLeft: true,
      winkRight: false,
      browRaise: 0.5,
      cheekPuff: 0.4
    });
  });

  it('counts only rising edges for hidden mission events', () => {
    let state = { count: 0, previousActive: false };
    const active = expressionSignalsFromBlendshapes(categories({ mouthSmileLeft: 0.7 }));
    const idle = expressionSignalsFromBlendshapes(categories({ mouthSmileLeft: 0.1 }));

    state = updateHiddenMissionCounter(state, 'smile_count', 2, active);
    state = updateHiddenMissionCounter(state, 'smile_count', 2, active);
    state = updateHiddenMissionCounter(state, 'smile_count', 2, idle);
    state = updateHiddenMissionCounter(state, 'smile_count', 2, active);

    expect(state.count).toBe(2);
    expect(
      missionResultFromCounter({
        playerId: 'p1',
        missionId: 'm1',
        verify: 'smile_count',
        target: 2,
        state
      }).success
    ).toBe(true);
  });

  it('marks no-jaw-open missions failed without exposing raw landmarks', () => {
    const state = updateHiddenMissionCounter(
      { count: 0, previousActive: false },
      'no_jaw_open',
      0,
      expressionSignalsFromBlendshapes(categories({ jawOpen: 0.8 }))
    );

    expect(state.failed).toBe(true);
    expect(
      missionResultFromCounter({
        playerId: 'p1',
        missionId: 'm1',
        verify: 'no_jaw_open',
        target: 0,
        state
      })
    ).toEqual({ playerId: 'p1', missionId: 'm1', count: 1, success: false });
  });
});
