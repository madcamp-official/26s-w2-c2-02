import type { GoalRefinement } from '@roomi/shared';

export type RoomiPromptKind =
  | 'goal_refine'
  | 'start'
  | 'focus_recovery'
  | 'break_return'
  | 'summary';

/**
 * Single seam between the app and any LLM text provider. GeminiClient implements
 * this; tests inject a fake. Everything that needs generated text goes through
 * RoomiOrchestrator, which owns per-kind prompts and template fallbacks.
 */
export interface TextGenerator {
  generateText(prompt: string): Promise<string>;
}

export class RoomiOrchestrator {
  constructor(private readonly generator?: TextGenerator) {}

  async refineGoal(rawGoal: string, sessionMinutes: number): Promise<GoalRefinement> {
    if (this.generator) {
      try {
        const refinedText = (
          await this.generator.generateText(this.buildRefinePrompt(rawGoal, sessionMinutes))
        ).trim();

        if (refinedText) {
          return {
            refinedText,
            reason: '루미가 목표를 구체적인 실행 계획으로 다듬었어요.',
            source: 'gemini'
          };
        }
      } catch {
        // Any failure (no key, network, rate limit, timeout) falls through to the
        // deterministic template so the waiting-room flow never blocks on the LLM.
      }
    }

    return this.templateRefinement(rawGoal, sessionMinutes);
  }

  async generateMessage(kind: RoomiPromptKind, userText: string) {
    return `[${kind}] ${userText}`;
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
      '너는 스터디룸 운영자 "루미"야. 참가자의 거친 공부 목표를 그 자리에서 실천 가능한',
      `한 문장 목표로 다듬어줘. 세션 길이는 ${sessionMinutes}분이야.`,
      '- 시간 안에 끝낼 수 있게 범위를 구체화할 것',
      '- 따뜻하고 간결한 한 문장, 이모지·따옴표 없이',
      '- 목표 문장만 출력하고 다른 설명은 붙이지 마',
      `참가자 목표: ${rawGoal}`
    ].join('\n');
  }
}
