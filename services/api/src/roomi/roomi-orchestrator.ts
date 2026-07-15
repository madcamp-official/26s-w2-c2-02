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
  | 'game_reaction'
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

export type FacePartyGameReactionInput = FacePartyGameMessageInput & {
  event:
    | 'mission_success'
    | 'mission_fail'
    | 'bluff_bet'
    | 'bluff_cracked'
    | 'bluff_held'
    | 'relay_advanced';
  actorNickname?: string;
  targetNickname?: string;
  points?: number;
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
      const parsed = this.parsePokerBluffOutput(raw);
      return parsed && this.isKoreanText([...parsed.questions, ...parsed.tellHints].join(' '))
        ? parsed
        : fallback;
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
      return parsed.length > 0 && this.isKoreanText(parsed.join(' ')) ? parsed : fallback;
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

  async generateGameReactionMessage(input: FacePartyGameReactionInput): Promise<string> {
    return this.generateFacePartyText(
      'game_reaction',
      this.buildFacePartyReactionPrompt(input),
      this.templateGameReactionMessage(input)
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
    const theme = input.theme ?? '화상 통화';
    const duration = input.roundSeconds ? `${input.roundSeconds}초 동안` : '이번 라운드 동안';
    const target = input.nickname ? `${input.nickname}, ` : '';
    return `${target}${duration} ${theme} 이야기를 하면서 턱을 한 번 가볍게 만지고 자연스럽게 이어가.`;
  }

  private templatePokerBluffPrompt(input: PokerBluffPromptInput): PokerBluffPrompt {
    const theme = input.theme ?? '주말 계획';
    const questionCount = input.questionCount ?? 3;
    const tellHintCount = input.tellHintCount ?? 3;
    const questions = [
      `${theme} 이야기에서 실제로 있었던 작은 디테일 하나는 뭐야?`,
      `${theme} 이야기를 친구들이 기억한다면 어떤 장면일 것 같아?`,
      `${theme} 이야기를 더 선명하게 만드는 사소한 단서는 뭐야?`,
      `${theme} 계획에서 마지막 순간에 바뀐 점이 있었어?`
    ].slice(0, questionCount);
    const tellHints = [
      '구체적인 디테일을 말하기 전 멈칫하는 타이밍을 보세요.',
      '손짓과 이야기 순서가 자연스럽게 맞는지 비교해보세요.',
      '질문이 구체적일 때 시선 방향이 바뀌는지 살펴보세요.',
      '시간 순서를 물었을 때 같은 표현을 반복하는지 들어보세요.'
    ].slice(0, tellHintCount);

    return { questions, tellHints };
  }

  private templateCopycatSeedExpressions(input: CopycatSeedInput): string[] {
    const theme = input.theme ?? '빠른 리액션';
    return [
      `${theme}에 맞춰 크게 놀란 표정 짓기`,
      `${theme}에 맞춰 살짝 의심하는 옆눈질하기`,
      `${theme}에 맞춰 조용히 기뻐하는 표정 짓기`,
      `${theme}에 맞춰 웃음을 참는 표정 짓기`,
      `${theme}에 맞춰 진지하게 발표하는 표정 짓기`
    ].slice(0, input.count ?? 4);
  }

  private templateGameIntroMessage(input: FacePartyGameMessageInput): string {
    const name = this.faceGameName(input.game);
    const round = input.roundNumber ? ` ${input.roundNumber}라운드.` : '';
    return `${name}${round} 가볍게 시작해보자. 타이밍, 제스처, 시선 방향, 표정 움직임처럼 눈에 보이는 단서만 사용할게.`;
  }

  private templateGameRevealMessage(input: FacePartyGameMessageInput): string {
    const winner = input.winnerNickname ? `${input.winnerNickname}이 이번 라운드를 가져갔어.` : '공개 시간이야.';
    const signals = this.formatVisibleSignals(input.visibleSignals);
    return `${winner} 참고한 단서는 눈에 보이는 신호뿐이야${signals}.`;
  }

  private templateGameReactionMessage(input: FacePartyGameReactionInput): string {
    const actor = input.actorNickname ?? '누군가';
    const target = input.targetNickname ? ` ${input.targetNickname}에게` : '';
    const points = input.points ? ` +${input.points}점.` : '';
    const signals = this.formatVisibleSignals(input.visibleSignals);

    if (input.event === 'mission_success') {
      return `${actor}의 비밀 미션 성공${signals}.${points}`;
    }
    if (input.event === 'mission_fail') {
      return `${actor}의 비밀 미션 기록이 공개됐어${signals}. 공개 때 참고할 단서가 됐어.`;
    }
    if (input.event === 'bluff_bet') {
      return `${actor}가${target} 블러프 판정을 걸었어. 타이밍, 제스처, 표정 움직임만 보자.`;
    }
    if (input.event === 'bluff_cracked') {
      return `${actor}의 포커페이스가 흔들렸어${signals}.${points}`;
    }
    if (input.event === 'bluff_held') {
      return `${actor}가 포커페이스를 지켰어${signals}.${points}`;
    }
    return `${actor}가${target} 카피캣 릴레이를 넘겼어${signals}.${points}`;
  }

  private templateGameSummaryMessage(input: FacePartyGameMessageInput): string {
    const name = this.faceGameName(input.game);
    const players = input.playerCount ? `${input.playerCount}명` : '이번 방';
    const signals = this.formatVisibleSignals(input.visibleSignals);
    return `${name}이 ${players}과 함께 끝났어. 감정이나 진실 여부를 추측하지 않고 보이는 신호만 참고했어${signals}.`;
  }

  private buildHiddenMissionPrompt(input: HiddenMissionPromptInput): string {
    return [
      '표정 파티 게임에서 사용할 개인 비밀 미션을 하나 만들어줘.',
      `닉네임: ${input.nickname ?? '참가자'}`,
      `주제: ${input.theme ?? '화상 통화'}`,
      `라운드 시간: ${input.roundSeconds ?? '미지정'}초`,
      `톤: ${input.tone ?? '장난스럽고 가벼움'}`,
      '규칙: 한국어 한 문장만 출력. 구체적으로 눈에 보이는 행동만 지시. 감정, 거짓말 탐지, 정체성 민감 특성은 언급하지 마.',
      '미션 문장만 출력해.'
    ].join('\n');
  }

  private buildPokerBluffPrompt(input: PokerBluffPromptInput): string {
    return [
      '화상 통화용 포커페이스 블러프 게임 콘텐츠를 만들어줘.',
      `주제: ${input.theme ?? '주말 계획'}`,
      `질문 수: ${input.questionCount ?? 3}`,
      `보이는 신호 힌트 수: ${input.tellHintCount ?? 3}`,
      `톤: ${input.tone ?? '장난스럽고 가벼움'}`,
      '규칙: 반드시 한국어로만 출력. 누가 거짓말한다고 단정하지 말고 감정, 의도, 건강, 정체성을 추론하지 마. 힌트는 타이밍, 시선 방향, 제스처, 표정 움직임, 자세, 말 속도처럼 보이거나 들리는 신호만 말해.',
      '형식은 정확히 이렇게:',
      'QUESTIONS:',
      '- <한국어 질문>',
      'HINTS:',
      '- <한국어 보이는 신호 힌트>'
    ].join('\n');
  }

  private buildCopycatSeedPrompt(input: CopycatSeedInput): string {
    return [
      '표정 카피캣 릴레이 게임에서 따라 할 표정/제스처 씨앗을 만들어줘.',
      `주제: ${input.theme ?? '빠른 리액션'}`,
      `개수: ${input.count ?? 4}`,
      `톤: ${input.tone ?? '장난스럽고 가벼움'}`,
      '규칙: 반드시 한국어로만 출력. 보이는 얼굴 움직임이나 제스처만 지시. 감정 단정, 진단, 민감 특성은 금지.',
      '번호 없이 한 줄에 하나씩 출력해.'
    ].join('\n');
  }

  private buildFacePartyMessagePrompt(
    stage: 'intro' | 'reveal' | 'summary',
    input: FacePartyGameMessageInput
  ): string {
    return [
      `표정 파티 게임의 ${stage} 진행 멘트를 만들어줘.`,
      `게임: ${this.faceGameName(input.game)}`,
      `라운드: ${input.roundNumber ?? '미지정'}`,
      `참가자 수: ${input.playerCount ?? '미지정'}`,
      `승자: ${input.winnerNickname ?? '미지정'}`,
      `보이는 신호: ${(input.visibleSignals ?? []).join(', ') || '제공 없음'}`,
      `톤: ${input.tone ?? '친근함'}`,
      '규칙: 반드시 한국어로만 출력. 보이는 신호만 언급하고 감정, 거짓말, 의도, 호감, 건강, 정체성 특성을 탐지했다고 말하지 마.',
      '짧은 한두 문장만 출력해.'
    ].join('\n');
  }

  private buildFacePartyReactionPrompt(input: FacePartyGameReactionInput): string {
    return [
      '표정 파티 게임 진행자 루미의 짧은 실시간 반응을 만들어줘.',
      `게임: ${this.faceGameName(input.game)}`,
      `이벤트: ${input.event}`,
      `행동한 참가자: ${input.actorNickname ?? '미지정'}`,
      `대상 참가자: ${input.targetNickname ?? '미지정'}`,
      `점수: ${input.points ?? '없음'}`,
      `보이는 신호: ${(input.visibleSignals ?? []).join(', ') || '제공 없음'}`,
      `톤: ${input.tone ?? '장난스럽고 가벼움'}`,
      '규칙: 반드시 한국어로만 출력. 게임 행동과 보이는 신호만 언급하고 감정, 거짓말, 의도, 호감, 건강, 정체성 특성을 탐지했다고 말하지 마.',
      '짧은 한 문장만 출력해.'
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
      'hidden_mission' | 'game_intro' | 'game_reaction' | 'game_reveal' | 'game_summary'
    >,
    prompt: string,
    fallback: string
  ): Promise<string> {
    if (!this.generator) return fallback;

    try {
      const text = (await this.generator.generateText(prompt)).trim();
      return text && this.isKoreanText(text) ? text : fallback;
    } catch (error) {
      this.logGeneratorFailure(kind, error);
      return fallback;
    }
  }

  private faceGameName(game: FacePartyGameKind): string {
    if (game === 'hidden_mission') return '숨은 표정 미션';
    if (game === 'poker_bluff') return '포커페이스 블러프';
    return '카피캣 릴레이';
  }

  private formatVisibleSignals(signals?: string[]): string {
    if (!signals || signals.length === 0) return '';
    return `: ${signals.join(', ')}`;
  }

  private isKoreanText(text: string): boolean {
    return /[가-힣]/.test(text);
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
