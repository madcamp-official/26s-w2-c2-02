import { describe, expect, it } from 'vitest';
import { RoomiOrchestrator, type TextGenerator } from './roomi-orchestrator';

function generatorReturning(text: string): TextGenerator {
  return { generateText: async () => text };
}

const failingGenerator: TextGenerator = {
  generateText: async () => {
    throw new Error('gemini unavailable');
  }
};

describe('RoomiOrchestrator.refineGoal', () => {
  it('uses the text generator when it succeeds', async () => {
    const orchestrator = new RoomiOrchestrator(generatorReturning('25분 집중: 미적분 예제 3문제'));

    const result = await orchestrator.refineGoal('미적분', 25);

    expect(result.source).toBe('gemini');
    expect(result.refinedText).toBe('25분 집중: 미적분 예제 3문제');
    expect(result.reason).toBeTruthy();
  });

  it('falls back to a template when the generator throws', async () => {
    const orchestrator = new RoomiOrchestrator(failingGenerator);

    const result = await orchestrator.refineGoal('미적분', 25);

    expect(result.source).toBe('template');
    expect(result.refinedText).toContain('미적분');
    expect(result.refinedText).toContain('25');
  });

  it('falls back to a template when no generator is configured', async () => {
    const orchestrator = new RoomiOrchestrator();

    const result = await orchestrator.refineGoal('영어 단어', 50);

    expect(result.source).toBe('template');
    expect(result.refinedText).toContain('영어 단어');
    expect(result.refinedText).toContain('50');
  });
});
