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

  it('accepts a softer wink when one eye is mostly open', () => {
    const signals = expressionSignalsFromBlendshapes(
      categories({
        eyeBlinkLeft: 0.5,
        eyeBlinkRight: 0.3
      }),
      undefined,
      1234
    );

    expect(signals.winkLeft).toBe(true);
    expect(signals.winkRight).toBe(false);
  });

  it('accepts a softer brow raise without changing the release gate', () => {
    let state = { count: 0, previousActive: false };

    state = updateHiddenMissionCounter(
      state,
      'brow_count',
      2,
      expressionSignalsFromBlendshapes(categories({ browInnerUp: 0.52 }), undefined, 1_000)
    );
    state = updateHiddenMissionCounter(
      state,
      'brow_count',
      2,
      expressionSignalsFromBlendshapes(categories({ browInnerUp: 0.3 }), undefined, 2_100)
    );
    state = updateHiddenMissionCounter(
      state,
      'brow_count',
      2,
      expressionSignalsFromBlendshapes(categories({ browInnerUp: 0.52 }), undefined, 3_200)
    );

    expect(state.count).toBe(1);
  });

  it('counts only rising edges for hidden mission events', () => {
    let state = { count: 0, previousActive: false };
    const active = (timestamp: number) =>
      expressionSignalsFromBlendshapes(categories({ mouthSmileLeft: 0.7 }), undefined, timestamp);
    const idle = (timestamp: number) =>
      expressionSignalsFromBlendshapes(categories({ mouthSmileLeft: 0.1 }), undefined, timestamp);

    state = updateHiddenMissionCounter(state, 'smile_count', 2, active(1_000));
    state = updateHiddenMissionCounter(state, 'smile_count', 2, active(1_100));
    state = updateHiddenMissionCounter(state, 'smile_count', 2, idle(1_200));
    state = updateHiddenMissionCounter(state, 'smile_count', 2, active(2_100));

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

  it('counts short jaw-open actions as a mission event', () => {
    let state = { count: 0, previousActive: false };
    const jaw = (timestamp: number, jawOpen: number) =>
      expressionSignalsFromBlendshapes(categories({ jawOpen }), undefined, timestamp);

    state = updateHiddenMissionCounter(state, 'jaw_open_count', 2, jaw(1_000, 0.48));
    state = updateHiddenMissionCounter(state, 'jaw_open_count', 2, jaw(1_100, 0.5));
    state = updateHiddenMissionCounter(state, 'jaw_open_count', 2, jaw(1_300, 0.1));
    state = updateHiddenMissionCounter(state, 'jaw_open_count', 2, jaw(2_100, 0.48));

    expect(state.count).toBe(2);
    expect(
      missionResultFromCounter({
        playerId: 'p1',
        missionId: 'm1',
        verify: 'jaw_open_count',
        target: 2,
        state
      }).success
    ).toBe(true);
  });

  it('counts nods only after the head returns near neutral', () => {
    let state = { count: 0, previousActive: false };
    const nod = (timestamp: number, headPitch: number) =>
      updateHiddenMissionCounter(state, 'nod_count', 2, {
        ...expressionSignalsFromBlendshapes(undefined, undefined, timestamp),
        headPitch
      });

    state = nod(1_000, 18);
    state = nod(2_100, 12);
    state = nod(3_200, 18);
    state = nod(4_300, 4);
    state = nod(5_400, 18);

    expect(state.count).toBe(2);
  });

  it('does not count repeated brow raises inside the mission cooldown', () => {
    let state = { count: 0, previousActive: false };
    const active = (timestamp: number) =>
      expressionSignalsFromBlendshapes(categories({ browInnerUp: 0.7 }), undefined, timestamp);
    const idle = (timestamp: number) =>
      expressionSignalsFromBlendshapes(categories({ browInnerUp: 0.1 }), undefined, timestamp);

    state = updateHiddenMissionCounter(state, 'brow_count', 3, active(1_000));
    state = updateHiddenMissionCounter(state, 'brow_count', 3, idle(1_100));
    state = updateHiddenMissionCounter(state, 'brow_count', 3, active(1_500));
    state = updateHiddenMissionCounter(state, 'brow_count', 3, idle(1_600));
    state = updateHiddenMissionCounter(state, 'brow_count', 3, active(2_000));

    expect(state.count).toBe(2);
  });

  it('requires brow raises to release below the lower threshold before counting again', () => {
    let state = { count: 0, previousActive: false };
    const brow = (timestamp: number, browInnerUp: number) =>
      expressionSignalsFromBlendshapes(categories({ browInnerUp }), undefined, timestamp);

    state = updateHiddenMissionCounter(state, 'brow_count', 3, brow(1_000, 0.7));
    state = updateHiddenMissionCounter(state, 'brow_count', 3, brow(2_100, 0.32));
    state = updateHiddenMissionCounter(state, 'brow_count', 3, brow(3_200, 0.7));
    state = updateHiddenMissionCounter(state, 'brow_count', 3, brow(4_300, 0.2));
    state = updateHiddenMissionCounter(state, 'brow_count', 3, brow(5_400, 0.7));

    expect(state.count).toBe(2);
  });

});
