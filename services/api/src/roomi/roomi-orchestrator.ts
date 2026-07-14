import type { GoalRefinement } from '@roomi/shared';

export type RoomiPromptKind =
  | 'goal_refine'
  | 'start'
  | 'focus_recovery'
  | 'break_return'
  | 'summary';

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
    kind: Extract<RoomiPromptKind, 'start' | 'focus_recovery'>,
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
    kind: Extract<RoomiPromptKind, 'start' | 'focus_recovery'>,
    context: string
  ): string {
    const instruction =
      kind === 'start'
        ? '방 전체에 보낼 시작 멘트를 작성해줘.'
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
