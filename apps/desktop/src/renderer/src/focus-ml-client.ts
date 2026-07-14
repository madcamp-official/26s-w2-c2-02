export type MlFocusLabel = 'focused' | 'distracted' | 'away' | 'break_or_paused';

export type PromptKind = 'correction' | 'exploration';

export type FocusFeaturesV1 = {
  facePresenceRatio: number;
  avgFaceDetectionConfidence: number;
  eyeClosedRatio: number;
  headYawMean: number;
  headYawStd: number;
  headPitchMean: number;
  headPitchStd: number;
  headDownRatio: number;
  headTurnedRatio: number;
  lowConfidenceRatio: number;
  motionAmount: number;
  ruleBasedScoreMean: number;
  ruleBasedScoreMin: number;
};

export type FeatureWindowV1 = {
  windowId: string;
  userId: string;
  sessionId: string;
  windowStart: string;
  windowEnd: string;
  durationSec: number;
  features: FocusFeaturesV1;
  ruleBasedLabel?: MlFocusLabel;
};

export type PredictResponse = {
  modelVersion: string;
  label: MlFocusLabel;
  score: number;
  probabilities: Record<MlFocusLabel, number>;
  confidence: number;
  shouldPrompt: boolean;
  promptKind: PromptKind | null;
  reasons: string[];
};

const focusLabels: MlFocusLabel[] = ['focused', 'distracted', 'away', 'break_or_paused'];

export class MlFocusClientError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'MlFocusClientError';
  }
}

export async function predictFocusWindow(
  featureWindow: FeatureWindowV1,
  options: {
    baseUrl?: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  } = {}
): Promise<PredictResponse> {
  const baseUrl =
    options.baseUrl ?? import.meta.env.VITE_ROOMI_API_URL ?? 'http://localhost:4100';
  const fetcher = options.fetcher ?? fetch;
  const controller = options.timeoutMs ? new AbortController() : undefined;
  const timeout = controller
    ? globalThis.setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;

  try {
    const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/focus/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(featureWindow),
      signal: controller?.signal
    });

    if (!response.ok) {
      throw new MlFocusClientError(`ML focus predict failed with ${response.status} from ${baseUrl}`);
    }

    return parsePredictResponse(await response.json());
  } catch (reason) {
    if (reason instanceof MlFocusClientError) {
      throw reason;
    }
    const detail = reason instanceof Error ? reason.message : 'ML focus predict failed';
    throw new MlFocusClientError(
      `중앙 API를 통해 ML 서버에 연결할 수 없습니다. VITE_ROOMI_API_URL=${baseUrl} 중앙 API와 ML proxy 상태를 확인해주세요. (${detail})`,
      reason
    );
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function parsePredictResponse(value: unknown): PredictResponse {
  if (!isRecord(value)) {
    throw new MlFocusClientError('ML focus predict response is not an object');
  }

  const label = value.label;
  if (!isMlFocusLabel(label)) {
    throw new MlFocusClientError('ML focus predict response has invalid label');
  }

  const probabilities = parseProbabilities(value.probabilities);
  const shouldPrompt = Boolean(value.shouldPrompt);

  return {
    modelVersion: typeof value.modelVersion === 'string' ? value.modelVersion : 'unknown',
    label,
    score: finiteUnit(value.score),
    probabilities,
    confidence: finiteUnit(value.confidence),
    shouldPrompt,
    promptKind: parsePromptKind(value.promptKind, shouldPrompt),
    reasons: Array.isArray(value.reasons)
      ? value.reasons.filter((reason): reason is string => typeof reason === 'string')
      : []
  };
}

function parsePromptKind(value: unknown, shouldPrompt: boolean): PromptKind | null {
  if (value === 'correction' || value === 'exploration') {
    return value;
  }
  return shouldPrompt ? 'correction' : null;
}

function parseProbabilities(value: unknown): Record<MlFocusLabel, number> {
  const source = isRecord(value) ? value : {};

  return focusLabels.reduce(
    (probabilities, label) => ({
      ...probabilities,
      [label]: finiteUnit(source[label])
    }),
    {} as Record<MlFocusLabel, number>
  );
}

function isMlFocusLabel(value: unknown): value is MlFocusLabel {
  return typeof value === 'string' && focusLabels.includes(value as MlFocusLabel);
}

function finiteUnit(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
