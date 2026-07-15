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

  it('generates a play style recommendation for game rooms', async () => {
    const calls: string[] = [];
    const orchestrator = new RoomiOrchestrator({
      generateText: async (prompt) => {
        calls.push(prompt);
        return '의심받을수록 더 침착한 척하기';
      }
    });

    const result = await orchestrator.refineGoal('', 50, 'play_style', 'poker_bluff');

    expect(result.source).toBe('ollama');
    expect(result.refinedText).toBe('의심받을수록 더 침착한 척하기');
    expect(result.reason).toContain('플레이 스타일');
    expect(calls[0]).toContain('포커페이스 블러프');
    expect(calls[0]).toContain('오늘의 플레이 스타일');
    expect(calls[0]).toContain('한국어');
  });

  it('falls back to a game-specific play style template', async () => {
    const orchestrator = new RoomiOrchestrator();

    const result = await orchestrator.refineGoal('', 50, 'play_style', 'copycat_relay');

    expect(result.source).toBe('template');
    expect(result.refinedText).toContain('카피');
    expect(result.reason).toContain('카피캣 릴레이');
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

  it('asks rather than accuses when the signal only says distracted', async () => {
    const orchestrator = new RoomiOrchestrator(failingGenerator);

    const message = await orchestrator.generateFocusRecoveryMessage({
      nickname: '소요',
      goal: '수학 문제 3개 풀기',
      status: 'distracted'
    });

    expect(message).toContain('소요');
    expect(message).toContain('?');
  });

  it('tells the generator not to treat a distraction reading as fact', async () => {
    const prompts: string[] = [];
    const orchestrator = new RoomiOrchestrator({
      generateText: async (prompt) => {
        prompts.push(prompt);
        return '아직 목표 작업 중이야?';
      }
    });

    await orchestrator.generateFocusRecoveryMessage({ nickname: '소요', status: 'distracted' });

    expect(prompts[0]).toContain('단정하지 말고');
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
        return '라운드 중 대답하기 전에 볼을 한 번 가볍게 만져.';
      }
    };
    const orchestrator = new RoomiOrchestrator(generator);

    const prompt = await orchestrator.generateHiddenMissionPrompt({
      nickname: 'Mina',
      theme: 'snack debate',
      roundSeconds: 45
    });

    expect(prompt).toBe('라운드 중 대답하기 전에 볼을 한 번 가볍게 만져.');
    expect(calls[0]).toContain('snack debate');
    expect(calls[0]).toContain('한국어 한 문장');
    expect(calls[0]).toContain('감정');
    expect(calls[0]).toContain('거짓말 탐지');
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
    expect(prompt).toContain('턱');
    expect(prompt).not.toMatch(/감정|거짓말|진실/);
  });

  it('parses poker bluff questions and visible-signal tell hints from the generator', async () => {
    const orchestrator = new RoomiOrchestrator(
      generatorReturning(
        [
          'QUESTIONS:',
          '- 처음 바뀐 디테일은 뭐였어?',
          '- 그때 또 누가 있었어?',
          'HINTS:',
          '- 구체적인 말을 하기 전 멈칫하는 타이밍을 보세요.',
          '- 손짓과 이야기 순서가 맞는지 비교해보세요.'
        ].join('\n')
      )
    );

    const prompt = await orchestrator.generatePokerBluffPrompt({
      theme: 'travel story',
      questionCount: 2,
      tellHintCount: 2
    });

    expect(prompt).toEqual({
      questions: ['처음 바뀐 디테일은 뭐였어?', '그때 또 누가 있었어?'],
      tellHints: [
        '구체적인 말을 하기 전 멈칫하는 타이밍을 보세요.',
        '손짓과 이야기 순서가 맞는지 비교해보세요.'
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
    expect(prompt.tellHints.join(' ')).toMatch(/타이밍|손짓|시선|보이는/);
    expect(prompt.tellHints.join(' ')).not.toMatch(/거짓말|감정/);
  });

  it('uses generated copycat seeds as a bounded list', async () => {
    const orchestrator = new RoomiOrchestrator(
      generatorReturning(['1. 조각상처럼 멈춘 표정', '2. 아주 작은 끄덕임', '3. 눈썹 살짝 올리기'].join('\n'))
    );

    const seeds = await orchestrator.generateCopycatSeedExpressions({ count: 2 });

    expect(seeds).toEqual(['조각상처럼 멈춘 표정', '아주 작은 끄덕임']);
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
    expect(seeds.join(' ')).not.toMatch(/감정|진단|거짓말/);
  });

  it('generates game intro, reveal, and summary fallbacks with privacy language', async () => {
    const orchestrator = new RoomiOrchestrator();

    const intro = await orchestrator.generateGameIntroMessage({
      game: 'poker_bluff',
      roundNumber: 2,
      playStyles: ['의심받을수록 더 침착한 척하기']
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

    expect(intro).toContain('포커페이스 블러프');
    expect(intro).toContain('눈에 보이는 단서');
    expect(intro).toContain('플레이 스타일');
    expect(reveal).toContain('Ara');
    expect(reveal).toContain('gesture timing');
    expect(summary).toContain('보이는 신호');
    expect([intro, reveal, summary].join(' ')).not.toMatch(/감정을 탐지|거짓말을 탐지/);
  });

  it('starts hidden mission rounds with a conversation topic', async () => {
    const orchestrator = new RoomiOrchestrator();

    const intro = await orchestrator.generateGameIntroMessage({
      game: 'hidden_mission',
      roundNumber: 1,
      playerCount: 3
    });

    expect(intro).toContain('대화 주제');
    expect(intro).toContain('비밀 미션');
  });

  it('generates live game reaction fallbacks for player actions', async () => {
    const orchestrator = new RoomiOrchestrator();

    const reaction = await orchestrator.generateGameReactionMessage({
      game: 'poker_bluff',
      event: 'bluff_cracked',
      actorNickname: 'Mina',
      visibleSignals: ['미소'],
      tone: 'playful'
    });

    expect(reaction).toContain('Mina');
    expect(reaction).toContain('미소');
    expect(reaction).not.toMatch(/감정을 탐지|거짓말을 탐지/);
  });

  it('generates a hidden mission progress reaction before success', async () => {
    const orchestrator = new RoomiOrchestrator();

    const reaction = await orchestrator.generateGameReactionMessage({
      game: 'hidden_mission',
      event: 'mission_progress',
      actorNickname: '소요',
      visibleSignals: ['눈썹을 치켜뜬 움직임'],
      tone: 'playful'
    });

    expect(reaction).toContain('누군가');
    expect(reaction).toContain('눈썹을 치켜뜬 움직임');
    expect(reaction).not.toContain('소요');
    expect(reaction).not.toMatch(/미션|성공|카운트/);
  });

  it('keeps hidden mission reaction prompts tied to the provided visible signal', async () => {
    const prompts: string[] = [];
    const orchestrator = new RoomiOrchestrator({
      generateText: async (prompt) => {
        prompts.push(prompt);
        return '방금 누군가 작은 미소를 스친 것 같은데...?';
      }
    });

    await orchestrator.generateGameReactionMessage({
      game: 'hidden_mission',
      event: 'mission_progress',
      visibleSignals: ['작은 미소가 스친 순간'],
      tone: 'playful'
    });

    expect(prompts[0]).toContain('작은 미소가 스친 순간');
    expect(prompts[0]).toContain('반드시 보이는 신호에 들어온 행동만');
    expect(prompts[0]).not.toContain('눈썹을 치켜뜬 것 같은데');
  });

  it('builds chat reaction prompts from recent chat only', async () => {
    const prompts: string[] = [];
    const orchestrator = new RoomiOrchestrator({
      generateText: async (prompt) => {
        prompts.push(prompt);
        return '그 얘기 재밌다. 주제는 이어가고 미션은 계속 숨겨보자.';
      }
    });

    const reaction = await orchestrator.generateChatReactionMessage({
      game: 'hidden_mission',
      latestNickname: '채훈',
      latestText: '오늘 제일 애매했던 일부터 말해볼까?',
      recentMessages: [
        { nickname: '민지', text: '나는 편의점에서 계산 실수한 거.' },
        { nickname: '채훈', text: '오늘 제일 애매했던 일부터 말해볼까?' }
      ],
      tone: 'playful'
    });

    expect(reaction).toContain('주제');
    expect(prompts[0]).toContain('최근 채팅');
    expect(prompts[0]).toContain('채훈: 오늘 제일 애매했던 일부터 말해볼까?');
    expect(prompts[0]).toContain('전체 대화 로그를 요약하지 말고');
  });
});
