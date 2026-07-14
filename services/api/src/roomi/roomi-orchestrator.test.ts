import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomiOrchestrator, type TextGenerator } from './roomi-orchestrator';

function generatorReturning(text: string): TextGenerator {
  return { generateText: async () => text };
}

const failingGenerator: TextGenerator = {
  generateText: async () => {
    throw new Error('gemini unavailable');
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RoomiOrchestrator.refineGoal', () => {
  it('uses the text generator when it succeeds', async () => {
    const orchestrator = new RoomiOrchestrator(generatorReturning('25분 집중: 미적분 예제 3문제'));

    const result = await orchestrator.refineGoal('미적분', 25);

    expect(result.source).toBe('gemini');
    expect(result.refinedText).toBe('25분 집중: 미적분 예제 3문제');
    expect(result.reason).toBeTruthy();
  });

  it('falls back to a template when the generator throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const orchestrator = new RoomiOrchestrator(failingGenerator);

    const result = await orchestrator.refineGoal('미적분', 25);

    expect(result.source).toBe('template');
    expect(result.refinedText).toContain('미적분');
    expect(result.refinedText).toContain('25');
    expect(consoleError).toHaveBeenCalledWith(
      '[RoomiOrchestrator] Gemini goal_refine generation failed: gemini unavailable'
    );
  });

  it('falls back to a template when no generator is configured', async () => {
    const orchestrator = new RoomiOrchestrator();

    const result = await orchestrator.refineGoal('영어 단어', 50);

    expect(result.source).toBe('template');
    expect(result.refinedText).toContain('영어 단어');
    expect(result.refinedText).toContain('50');
  });
});

describe('RoomiOrchestrator live-session messages', () => {
  it('uses the generator for a session start message', async () => {
    const orchestrator = new RoomiOrchestrator(generatorReturning('좋아, 오늘 목표 하나씩 끝내보자.'));

    const message = await orchestrator.generateStartMessage({ sessionMinutes: 50, goalCount: 2 });

    expect(message).toBe('좋아, 오늘 목표 하나씩 끝내보자.');
  });

  it('falls back to a supportive private recovery message', async () => {
    const orchestrator = new RoomiOrchestrator(failingGenerator);

    const message = await orchestrator.generateFocusRecoveryMessage({
      nickname: '소요',
      goal: '수학 문제 3개 풀기',
      status: 'away'
    });

    expect(message).toContain('소요');
    expect(message).toContain('다음 한 단계');
  });
});
