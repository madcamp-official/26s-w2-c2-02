export type LumiPromptKind =
  | 'goal_refine'
  | 'start'
  | 'focus_recovery'
  | 'break_return'
  | 'summary';

export class LumiOrchestrator {
  async generateMessage(kind: LumiPromptKind, userText: string) {
    return `[${kind}] ${userText}`;
  }
}
