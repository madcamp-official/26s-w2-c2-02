import type { GoalRefinement } from '@roomi/shared';

export type RoomiPromptKind =
  | 'goal_refine'
  | 'start'
  | 'focus_recovery'
  | 'break_return'
  | 'summary'
  | 'hidden_mission'
  | 'poker_bluff'
  | 'copycat_seed'
  | 'game_intro'
  | 'game_reveal'
  | 'game_summary';

/**
 * Single seam between the app and any LLM text provider. OllamaClient implements
 * this; tests inject a fake. Everything that needs generated text goes through
 * RoomiOrchestrator, which owns per-kind prompts and template fallbacks.
 */
export interface TextGenerator {
  generateText(prompt: string): Promise<string>;
}

type StartMessageInput = {
  sessionMinutes: number;
  goalCount: number;
};

type FocusRecoveryInput = {
  nickname: string;
  goal?: string;
  status: 'distracted' | 'away';
};

type RetrospectiveInput = {
  sessionMinutes: number;
  focusMinutes: number;
  goalCompletionRate: number;
};

export type RetrospectiveText = {
  goalFeedback: string;
  lumiComment: string;
};

export type FacePartyGameKind = 'hidden_mission' | 'poker_bluff' | 'copycat';

export type FacePartyGameTone = 'friendly' | 'playful' | 'calm';

export type HiddenMissionPromptInput = {
  nickname?: string;
  theme?: string;
  roundSeconds?: number;
  tone?: FacePartyGameTone;
};

export type PokerBluffPromptInput = {
  theme?: string;
  questionCount?: number;
  tellHintCount?: number;
  tone?: FacePartyGameTone;
};

export type PokerBluffPrompt = {
  questions: string[];
  tellHints: string[];
};

export type CopycatSeedInput = {
  theme?: string;
  count?: number;
  tone?: FacePartyGameTone;
};

export type FacePartyGameMessageInput = {
  game: FacePartyGameKind;
  roundNumber?: number;
  playerCount?: number;
  winnerNickname?: string;
  visibleSignals?: string[];
  tone?: FacePartyGameTone;
};

export class RoomiOrchestrator {
  constructor(private readonly generator?: TextGenerator) {}

  async refineGoal(rawGoal: string, sessionMinutes: number): Promise<GoalRefinement> {
    if (this.generator) {
      try {
        const refinedText = this.sanitizeRefinedText(
          await this.generator.generateText(this.buildRefinePrompt(rawGoal, sessionMinutes))
        );

        if (refinedText) {
          return {
            refinedText,
            reason: '루미가 목표를 구체적인 실행 계획으로 다듬었어요.',
            source: 'ollama'
          };
        }
      } catch (error) {
        // Any failure (no key, network, rate limit, timeout) falls through to the
        // deterministic template so the waiting-room flow never blocks on the LLM.
        this.logGeneratorFailure('goal_refine', error);
      }
    }

    return this.templateRefinement(rawGoal, sessionMinutes);
  }

  async generateStartMessage(input: StartMessageInput): Promise<string> {
    return this.generateLiveMessage(
      'start',
      [
        `집중 세션 길이: ${input.sessionMinutes}분`,
        `등록된 목표 수: ${input.goalCount}개`
      ].join('\n'),
      `좋아, 지금부터 ${input.sessionMinutes}분이야. 각자 목표 하나에만 집중해보자.`
    );
  }

  async generateBreakReturnMessage(input: { breakMinutes: number }): Promise<string> {
    return this.generateLiveMessage(
      'break_return',
      `방금 ${input.breakMinutes}분 휴식이 끝났어.`,
      '다들 잘 쉬었지? 다시 모여서 남은 시간 마저 달려보자.'
    );
  }

  async generateFocusRecoveryMessage(input: FocusRecoveryInput): Promise<string> {
    const statusLabel = input.status === 'away' ? '자리 비움' : '집중 흐트러짐';
    return this.generateLiveMessage(
      'focus_recovery',
      [
        `참가자: ${input.nickname}`,
        `상태: ${statusLabel}`,
        `현재 목표: ${input.goal ?? '등록된 목표 없음'}`
      ].join('\n'),
      `${input.nickname}, 잠깐 흐름이 끊긴 것 같아. 돌아오면 목표의 다음 한 단계만 바로 시작해보자.`
    );
  }

  async generateRetrospective(input: RetrospectiveInput): Promise<RetrospectiveText> {
    const fallback = this.templateRetrospective(input);

    if (!this.generator) return fallback;

    try {
      const raw = await this.generator.generateText(this.buildRetrospectivePrompt(input));
      const parsed = this.parseRetrospectiveOutput(raw);
      return parsed ?? fallback;
    } catch (error) {
      this.logGeneratorFailure('summary', error);
      return fallback;
    }
  }

  async generateHiddenMissionPrompt(input: HiddenMissionPromptInput = {}): Promise<string> {
    const fallback = this.templateHiddenMissionPrompt(input);
    return this.generateFacePartyText(
      'hidden_mission',
      this.buildHiddenMissionPrompt(input),
      fallback
    );
  }

  async generatePokerBluffPrompt(input: PokerBluffPromptInput = {}): Promise<PokerBluffPrompt> {
    const fallback = this.templatePokerBluffPrompt(input);

    if (!this.generator) return fallback;

    try {
      const raw = await this.generator.generateText(this.buildPokerBluffPrompt(input));
      return this.parsePokerBluffOutput(raw) ?? fallback;
    } catch (error) {
      this.logGeneratorFailure('poker_bluff', error);
      return fallback;
    }
  }

  async generateCopycatSeedExpressions(input: CopycatSeedInput = {}): Promise<string[]> {
    const fallback = this.templateCopycatSeedExpressions(input);

    if (!this.generator) return fallback;

    try {
      const raw = await this.generator.generateText(this.buildCopycatSeedPrompt(input));
      const parsed = this.parseLineList(raw, input.count ?? 4);
      return parsed.length > 0 ? parsed : fallback;
    } catch (error) {
      this.logGeneratorFailure('copycat_seed', error);
      return fallback;
    }
  }

  async generateGameIntroMessage(input: FacePartyGameMessageInput): Promise<string> {
    return this.generateFacePartyText(
      'game_intro',
      this.buildFacePartyMessagePrompt('intro', input),
      this.templateGameIntroMessage(input)
    );
  }

  async generateGameRevealMessage(input: FacePartyGameMessageInput): Promise<string> {
    return this.generateFacePartyText(
      'game_reveal',
      this.buildFacePartyMessagePrompt('reveal', input),
      this.templateGameRevealMessage(input)
    );
  }

  async generateGameSummaryMessage(input: FacePartyGameMessageInput): Promise<string> {
    return this.generateFacePartyText(
      'game_summary',
      this.buildFacePartyMessagePrompt('summary', input),
      this.templateGameSummaryMessage(input)
    );
  }

  private templateRetrospective(input: RetrospectiveInput): RetrospectiveText {
    const goalFeedback =
      input.goalCompletionRate >= 1
        ? '오늘 목표를 끝까지 달성했어요.'
        : input.goalCompletionRate > 0
          ? '목표 중 일부만 끝내고 세션이 끝났어요.'
          : '목표까지 도달하기엔 시간이 부족했어요.';

    const lumiComment =
      input.goalCompletionRate >= 1
        ? '오늘 목표까지 완료했어! 다음 세션도 이 흐름 이어가보자.'
        : '오늘도 수고했어. 다음엔 시작 5분을 워밍업으로 써보면 더 부드럽게 몰입할 수 있을 거야.';

    return { goalFeedback, lumiComment };
  }

  private buildRetrospectivePrompt(input: RetrospectiveInput): string {
    return [
      '너는 스터디룸 운영자 "루미"야. 방금 끝난 집중 세션의 목표 달성 결과를 회고해줘.',
      `계획한 세션 길이: ${input.sessionMinutes}분`,
      `실제 집중 시간: ${input.focusMinutes}분`,
      `목표 달성률: ${Math.round(input.goalCompletionRate * 100)}%`,
      '아래 형식 그대로 정확히 두 줄만 출력해. 다른 설명이나 마크다운은 붙이지 마:',
      'FEEDBACK: <목표 달성 결과에 대한 피드백 한 문장>',
      'LUMI: <참가자에게 보내는 따뜻한 한 줄 코멘트, 반말, 이모지 없이>'
    ].join('\n');
  }

  private parseRetrospectiveOutput(rawOutput: string): RetrospectiveText | null {
    const feedback = /FEEDBACK:\s*(.+)/i.exec(rawOutput)?.[1]?.trim();
    const lumi = /LUMI:\s*(.+)/i.exec(rawOutput)?.[1]?.trim();

    if (!feedback || !lumi) {
      return null;
    }

    return { goalFeedback: feedback, lumiComment: lumi };
  }

  private templateHiddenMissionPrompt(input: HiddenMissionPromptInput): string {
    const theme = input.theme ?? 'video call';
    const duration = input.roundSeconds ? `${input.roundSeconds} seconds` : 'this round';
    const target = input.nickname ? `${input.nickname}, ` : '';
    return `${target}during ${duration}, work in one tiny visible cue about ${theme}: touch your chin once, then keep playing naturally.`;
  }

  private templatePokerBluffPrompt(input: PokerBluffPromptInput): PokerBluffPrompt {
    const theme = input.theme ?? 'weekend plans';
    const questionCount = input.questionCount ?? 3;
    const tellHintCount = input.tellHintCount ?? 3;
    const questions = [
      `What is one real detail about your ${theme} story?`,
      `Which part of the ${theme} story would your friends remember?`,
      `What tiny detail would make the ${theme} story easier to picture?`,
      `What changed at the last second in your ${theme} story?`
    ].slice(0, questionCount);
    const tellHints = [
      'Watch for pauses before specific details.',
      'Compare whether gestures match the timing of the story.',
      'Notice if eye contact changes when follow-up questions get concrete.',
      'Listen for repeated wording when the group asks for a timeline.'
    ].slice(0, tellHintCount);

    return { questions, tellHints };
  }

  private templateCopycatSeedExpressions(input: CopycatSeedInput): string[] {
    const theme = input.theme ?? 'quick reaction';
    return [
      `big surprised face for ${theme}`,
      `tiny suspicious side-eye for ${theme}`,
      `silent celebration face for ${theme}`,
      `trying-not-to-laugh face for ${theme}`,
      `serious announcement face for ${theme}`
    ].slice(0, input.count ?? 4);
  }

  private templateGameIntroMessage(input: FacePartyGameMessageInput): string {
    const name = this.faceGameName(input.game);
    const round = input.roundNumber ? ` Round ${input.roundNumber}.` : '';
    return `${name}${round} Keep it light: use only visible cues like timing, gestures, gaze direction, and facial movement. No emotion or lie claims.`;
  }

  private templateGameRevealMessage(input: FacePartyGameMessageInput): string {
    const winner = input.winnerNickname ? `${input.winnerNickname} takes this one.` : 'Reveal time.';
    const signals = this.formatVisibleSignals(input.visibleSignals);
    return `${winner} The useful clues were visible signals only${signals}.`;
  }

  private templateGameSummaryMessage(input: FacePartyGameMessageInput): string {
    const name = this.faceGameName(input.game);
    const players = input.playerCount ? `${input.playerCount} players` : 'the table';
    const signals = this.formatVisibleSignals(input.visibleSignals);
    return `${name} wrapped with ${players}. Best discussion came from visible signals${signals}, without guessing feelings or truthfulness.`;
  }

  private buildHiddenMissionPrompt(input: HiddenMissionPromptInput): string {
    return [
      'Create one private hidden mission for a face party game.',
      `Nickname: ${input.nickname ?? 'player'}`,
      `Theme: ${input.theme ?? 'video call'}`,
      `Round seconds: ${input.roundSeconds ?? 'unspecified'}`,
      `Tone: ${input.tone ?? 'playful'}`,
      'Rules: one short sentence, concrete visible action, no emotion claims, no lie detection, no identity-sensitive traits.',
      'Output only the mission text.'
    ].join('\n');
  }

  private buildPokerBluffPrompt(input: PokerBluffPromptInput): string {
    return [
      'Create poker bluff party-game content for video chat.',
      `Theme: ${input.theme ?? 'weekend plans'}`,
      `Questions: ${input.questionCount ?? 3}`,
      `Visible-signal hints: ${input.tellHintCount ?? 3}`,
      `Tone: ${input.tone ?? 'playful'}`,
      'Privacy rules: do not claim someone is lying, do not infer emotion, intent, health, or identity. Hints must only mention visible signals such as timing, gaze direction, gestures, facial movement, posture, or voice pacing.',
      'Format exactly:',
      'QUESTIONS:',
      '- <question>',
      'HINTS:',
      '- <visible signal hint>'
    ].join('\n');
  }

  private buildCopycatSeedPrompt(input: CopycatSeedInput): string {
    return [
      'Create seed expressions for a copycat face party game.',
      `Theme: ${input.theme ?? 'quick reaction'}`,
      `Count: ${input.count ?? 4}`,
      `Tone: ${input.tone ?? 'playful'}`,
      'Rules: visible face/gesture prompts only. No emotion claims, no diagnosis, no sensitive traits.',
      'Return one seed per line, no numbering.'
    ].join('\n');
  }

  private buildFacePartyMessagePrompt(
    stage: 'intro' | 'reveal' | 'summary',
    input: FacePartyGameMessageInput
  ): string {
    return [
      `Create a ${stage} message for a face party game.`,
      `Game: ${this.faceGameName(input.game)}`,
      `Round: ${input.roundNumber ?? 'unspecified'}`,
      `Players: ${input.playerCount ?? 'unspecified'}`,
      `Winner: ${input.winnerNickname ?? 'unspecified'}`,
      `Visible signals: ${(input.visibleSignals ?? []).join(', ') || 'none provided'}`,
      `Tone: ${input.tone ?? 'friendly'}`,
      'Privacy rules: mention only visible signals. Do not say the app detected emotions, lies, intent, attraction, health, or identity traits.',
      'Output one or two short sentences only.'
    ].join('\n');
  }

  private parsePokerBluffOutput(rawOutput: string): PokerBluffPrompt | null {
    const questions: string[] = [];
    const tellHints: string[] = [];
    let section: 'questions' | 'hints' | null = null;

    for (const line of rawOutput.split(/\r?\n/)) {
      const cleaned = this.cleanListItem(line);
      if (!cleaned) continue;
      if (/^questions:?$/i.test(cleaned)) {
        section = 'questions';
        continue;
      }
      if (/^(hints|tell hints|visible-signal hints):?$/i.test(cleaned)) {
        section = 'hints';
        continue;
      }
      if (section === 'questions') questions.push(cleaned);
      if (section === 'hints') tellHints.push(cleaned);
    }

    return questions.length > 0 && tellHints.length > 0 ? { questions, tellHints } : null;
  }

  private parseLineList(rawOutput: string, limit: number): string[] {
    return rawOutput
      .split(/\r?\n/)
      .map((line) => this.cleanListItem(line))
      .filter(Boolean)
      .slice(0, limit);
  }

  private cleanListItem(line: string): string {
    return line
      .trim()
      .replace(/^[-*]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim();
  }

  private async generateFacePartyText(
    kind: Extract<
      RoomiPromptKind,
      'hidden_mission' | 'game_intro' | 'game_reveal' | 'game_summary'
    >,
    prompt: string,
    fallback: string
  ): Promise<string> {
    if (!this.generator) return fallback;

    try {
      const text = (await this.generator.generateText(prompt)).trim();
      return text || fallback;
    } catch (error) {
      this.logGeneratorFailure(kind, error);
      return fallback;
    }
  }

  private faceGameName(game: FacePartyGameKind): string {
    if (game === 'hidden_mission') return 'Hidden Mission';
    if (game === 'poker_bluff') return 'Poker Bluff';
    return 'Copycat';
  }

  private formatVisibleSignals(signals?: string[]): string {
    if (!signals || signals.length === 0) return '';
    return `: ${signals.join(', ')}`;
  }

  private templateRefinement(rawGoal: string, sessionMinutes: number): GoalRefinement {
    return {
      refinedText: `${sessionMinutes}분 동안 '${rawGoal}'에 집중해서 끝내기`,
      reason: '루미가 기본 형식으로 정리했어요.',
      source: 'template'
    };
  }

  private buildRefinePrompt(rawGoal: string, sessionMinutes: number): string {
    return [
      '너는 스터디룸 운영자 "루미"야.',
      `참가자가 직접 입력한 실제 공부 목표는 "${rawGoal}"야. 예시가 아니니 절대 다른 과목이나 주제로 바꾸지 마.`,
      `세션 길이는 ${sessionMinutes}분이야.`,
      '규칙:',
      `- 반드시 "${rawGoal}"와 같은 주제만 다룰 것`,
      '- 시간 안에 끝낼 수 있게 범위를 구체화할 것',
      '- 따뜻하고 간결한 한 문장, 이모지·따옴표·태그·라벨 없이',
      '- 다듬어진 목표 문장 한 줄만 출력하고 다른 설명은 붙이지 마',
      `다시 한번 확인: 참가자 목표는 "${rawGoal}"야. 다른 주제를 지어내지 말고 이 목표만 다듬어.`
    ].join('\n');
  }

  private sanitizeRefinedText(rawOutput: string): string {
    const cleaned = rawOutput
      .trim()
      .replace(/^<[^>]+>|<\/[^>]+>$/g, '')
      .replace(/^["'“”]|["'“”]$/g, '')
      .trim();

    // Small local models occasionally emit the literal token "undefined"/"null"
    // instead of real text; treat that as a failed generation, not valid output.
    if (/^(undefined|null)$/i.test(cleaned)) {
      return '';
    }

    return cleaned;
  }

  private async generateLiveMessage(
    kind: Extract<RoomiPromptKind, 'start' | 'focus_recovery' | 'break_return'>,
    context: string,
    fallback: string
  ): Promise<string> {
    if (!this.generator) return fallback;

    try {
      const text = (await this.generator.generateText(this.buildLivePrompt(kind, context))).trim();
      return text || fallback;
    } catch (error) {
      this.logGeneratorFailure(kind, error);
      return fallback;
    }
  }

  private logGeneratorFailure(kind: RoomiPromptKind, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[RoomiOrchestrator] Ollama ${kind} generation failed: ${message}`);
  }

  private buildLivePrompt(
    kind: Extract<RoomiPromptKind, 'start' | 'focus_recovery' | 'break_return'>,
    context: string
  ): string {
    const instruction =
      kind === 'start'
        ? '방 전체에 보낼 시작 멘트를 작성해줘.'
        : kind === 'break_return'
          ? '휴식이 끝나고 다시 모인 방 전체에 보낼 복귀 안내 멘트를 작성해줘.'
          : '해당 참가자에게만 보낼 집중 회복 멘트를 작성해줘.';

    return [
      '너는 친구 말투의 스터디룸 운영자 "루미"야.',
      instruction,
      '- 비난하지 말고, 바로 할 수 있는 작은 다음 행동을 제안할 것',
      '- 한국어 반말, 1~2문장, 이모지·따옴표 없이',
      context,
      '메시지만 출력해.'
    ].join('\n');
  }
}
