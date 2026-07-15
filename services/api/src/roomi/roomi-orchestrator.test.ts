import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomiOrchestrator, type TextGenerator } from './roomi-orchestrator';

function generatorReturning(text: string): TextGenerator {
  return { generateText: async () => text };
}

const failingGenerator: TextGenerator = {
  generateText: async () => {
    throw new Error('ollama unavailable');
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RoomiOrchestrator.refineGoal', () => {
  it('uses the text generator when it succeeds', async () => {
    const orchestrator = new RoomiOrchestrator(generatorReturning('25분 집중: 미적분 예제 3문제'));

    const result = await orchestrator.refineGoal('미적분', 25);

    expect(result.source).toBe('ollama');
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
      '[RoomiOrchestrator] Ollama goal_refine generation failed: ollama unavailable'
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

describe('RoomiOrchestrator.generateRetrospective', () => {
  it('parses a well-formed FEEDBACK/LUMI response from the generator', async () => {
    const orchestrator = new RoomiOrchestrator(
      generatorReturning(
        ['FEEDBACK: 목표를 끝까지 달성했어요.', 'LUMI: 오늘도 수고했어.'].join('\n')
      )
    );

    const result = await orchestrator.generateRetrospective({
      sessionMinutes: 50,
      focusMinutes: 42,
      goalCompletionRate: 1
    });

    expect(result).toEqual({
      goalFeedback: '목표를 끝까지 달성했어요.',
      lumiComment: '오늘도 수고했어.'
    });
  });

  it('falls back to a template when the generator throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const orchestrator = new RoomiOrchestrator(failingGenerator);

    const result = await orchestrator.generateRetrospective({
      sessionMinutes: 50,
      focusMinutes: 42,
      goalCompletionRate: 1
    });

    expect(result.goalFeedback).toContain('달성');
    expect(result.lumiComment).toBeTruthy();
    expect(consoleError).toHaveBeenCalledWith(
      '[RoomiOrchestrator] Ollama summary generation failed: ollama unavailable'
    );
  });

  it('falls back to a template when the generator output cannot be parsed', async () => {
    const orchestrator = new RoomiOrchestrator(generatorReturning('오늘 세션 잘 마쳤어요!'));

    const result = await orchestrator.generateRetrospective({
      sessionMinutes: 50,
      focusMinutes: 10,
      goalCompletionRate: 0
    });

    expect(result.goalFeedback).toContain('시간이 부족');
  });

  it('falls back to a template when no generator is configured', async () => {
    const orchestrator = new RoomiOrchestrator();

    const result = await orchestrator.generateRetrospective({
      sessionMinutes: 50,
      focusMinutes: 45,
      goalCompletionRate: 0.5
    });

    expect(result.goalFeedback).toContain('일부만');
  });
});

describe('RoomiOrchestrator face party games', () => {
  it('uses the generator for hidden mission prompts', async () => {
    const calls: string[] = [];
    const generator: TextGenerator = {
      generateText: async (prompt) => {
        calls.push(prompt);
        return 'During the round, scratch your cheek once before answering.';
      }
    };
    const orchestrator = new RoomiOrchestrator(generator);

    const prompt = await orchestrator.generateHiddenMissionPrompt({
      nickname: 'Mina',
      theme: 'snack debate',
      roundSeconds: 45
    });

    expect(prompt).toBe('During the round, scratch your cheek once before answering.');
    expect(calls[0]).toContain('snack debate');
    expect(calls[0]).toContain('no emotion claims');
    expect(calls[0]).toContain('no lie detection');
  });

  it('falls back to a hidden mission template without emotion or lie claims', async () => {
    const orchestrator = new RoomiOrchestrator();

    const prompt = await orchestrator.generateHiddenMissionPrompt({
      nickname: 'Joon',
      theme: 'movie night',
      roundSeconds: 30
    });

    expect(prompt).toContain('Joon');
    expect(prompt).toContain('movie night');
    expect(prompt).toContain('visible cue');
    expect(prompt).not.toMatch(/emotion|lie|truth/i);
  });

  it('parses poker bluff questions and visible-signal tell hints from the generator', async () => {
    const orchestrator = new RoomiOrchestrator(
      generatorReturning(
        [
          'QUESTIONS:',
          '- What detail changed first?',
          '- Who else was there?',
          'HINTS:',
          '- Watch for pauses before concrete details.',
          '- Compare gesture timing with the story timeline.'
        ].join('\n')
      )
    );

    const prompt = await orchestrator.generatePokerBluffPrompt({
      theme: 'travel story',
      questionCount: 2,
      tellHintCount: 2
    });

    expect(prompt).toEqual({
      questions: ['What detail changed first?', 'Who else was there?'],
      tellHints: [
        'Watch for pauses before concrete details.',
        'Compare gesture timing with the story timeline.'
      ]
    });
  });

  it('falls back to poker bluff templates when structured output is missing', async () => {
    const orchestrator = new RoomiOrchestrator(generatorReturning('Ask anything you want.'));

    const prompt = await orchestrator.generatePokerBluffPrompt({
      theme: 'cafeteria',
      questionCount: 2,
      tellHintCount: 2
    });

    expect(prompt.questions).toHaveLength(2);
    expect(prompt.tellHints).toHaveLength(2);
    expect(prompt.questions[0]).toContain('cafeteria');
    expect(prompt.tellHints.join(' ')).toMatch(/pauses|gestures|eye contact|visible/i);
    expect(prompt.tellHints.join(' ')).not.toMatch(/lying|emotion/i);
  });

  it('uses generated copycat seeds as a bounded list', async () => {
    const orchestrator = new RoomiOrchestrator(
      generatorReturning(['1. statue face', '2. tiny nod', '3. eyebrow raise'].join('\n'))
    );

    const seeds = await orchestrator.generateCopycatSeedExpressions({ count: 2 });

    expect(seeds).toEqual(['statue face', 'tiny nod']);
  });

  it('falls back to copycat seed expressions with visible prompts only', async () => {
    const orchestrator = new RoomiOrchestrator(failingGenerator);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const seeds = await orchestrator.generateCopycatSeedExpressions({
      theme: 'team lunch',
      count: 3
    });

    expect(seeds).toHaveLength(3);
    expect(seeds.join(' ')).toContain('team lunch');
    expect(seeds.join(' ')).not.toMatch(/emotion|diagnosis|lie/i);
  });

  it('generates game intro, reveal, and summary fallbacks with privacy language', async () => {
    const orchestrator = new RoomiOrchestrator();

    const intro = await orchestrator.generateGameIntroMessage({
      game: 'poker_bluff',
      roundNumber: 2
    });
    const reveal = await orchestrator.generateGameRevealMessage({
      game: 'hidden_mission',
      winnerNickname: 'Ara',
      visibleSignals: ['gesture timing', 'gaze direction']
    });
    const summary = await orchestrator.generateGameSummaryMessage({
      game: 'copycat',
      playerCount: 4,
      visibleSignals: ['facial movement']
    });

    expect(intro).toContain('Poker Bluff');
    expect(intro).toContain('No emotion or lie claims');
    expect(reveal).toContain('Ara');
    expect(reveal).toContain('gesture timing');
    expect(summary).toContain('visible signals');
    expect([intro, reveal, summary].join(' ')).not.toMatch(/detected emotion|detected lie/i);
  });

  it('generates live game reaction fallbacks for player actions', async () => {
    const orchestrator = new RoomiOrchestrator();

    const reaction = await orchestrator.generateGameReactionMessage({
      game: 'poker_bluff',
      event: 'bluff_cracked',
      actorNickname: 'Mina',
      visibleSignals: ['smile'],
      tone: 'playful'
    });

    expect(reaction).toContain('Mina');
    expect(reaction).toContain('smile');
    expect(reaction).not.toMatch(/detected emotion|detected lie/i);
  });
});
