export type RoomiPromptKind =
  | 'goal_refine'
  | 'start'
  | 'focus_recovery'
  | 'break_return'
  | 'summary';

export class RoomiOrchestrator {
  async generateMessage(kind: RoomiPromptKind, userText: string) {
    return `[${kind}] ${userText}`;
  }
}
