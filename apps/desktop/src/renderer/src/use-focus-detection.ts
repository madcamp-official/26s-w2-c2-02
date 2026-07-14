import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import faceLandmarkerModel from './assets/mediapipe/face_landmarker.task?url';
import wasmBinaryPath from './assets/mediapipe/vision_wasm_internal.wasm?url';
import wasmLoaderPath from './assets/mediapipe/vision_wasm_internal.js?url';
import {
  predictFocusWindow,
  type FeatureWindowV1,
  type PredictResponse
} from './focus-ml-client';
import {
  buildFeatureWindow,
  classifyFocus,
  defaultRuleSettings,
  emptyFocusSnapshot,
  extractFrameSignals,
  updateSignalWindow,
  type FocusIdentity,
  type FocusSnapshot,
  type FrameSignals,
  type LandmarkPoint,
  type RuleSettings
} from './focus-pipeline';
import {
  expressionSignalsFromBlendshapes,
  type BlendshapeCategory
} from './expression-pipeline';
import type { ExpressionSignals } from '@roomi/shared';

/**
 * Drives the MediaPipe face landmarker over a caller-supplied video track and
 * turns it into a focus label. The caller owns the track, so the study room can
 * hand over the track Daily already opened instead of competing for the camera.
 */

const wasmFileset = {
  wasmBinaryPath,
  wasmLoaderPath
};

const defaultMlWindowSeconds = 20;

export type FocusDetectionMode = 'rule' | 'ml';

export type FocusDetectionStatus = 'idle' | 'loading' | 'running' | 'error';

export type MlPredictionStatus = 'idle' | 'collecting' | 'predicting' | 'ready' | 'fallback';

export type MlPredictionSnapshot = {
  featureWindow: FeatureWindowV1;
  response: PredictResponse;
  windowId: string;
  windowEnd: string;
};

export type DetectionSnapshot = {
  faces: number;
  landmarks: number;
  fps: number;
  lastUpdatedAt: string;
};

export type UseFocusDetectionOptions = {
  /** Video track to analyse. Detection stays idle while this is null. */
  track: MediaStreamTrack | null;
  enabled: boolean;
  mode: FocusDetectionMode;
  identity: FocusIdentity;
  settings?: RuleSettings;
  mlWindowSeconds?: number;
  /** Called every analysed frame with normalised landmarks, for overlay drawing. */
  onLandmarks?: (landmarks: LandmarkPoint[][]) => void;
};

export const emptyDetectionSnapshot: DetectionSnapshot = {
  faces: 0,
  landmarks: 0,
  fps: 0,
  lastUpdatedAt: '-'
};

export function useFocusDetection({
  track,
  enabled,
  mode,
  identity,
  settings = defaultRuleSettings,
  mlWindowSeconds = defaultMlWindowSeconds,
  onLandmarks
}: UseFocusDetectionOptions) {
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const signalWindowRef = useRef<FrameSignals[]>([]);
  const previousNoseRef = useRef<LandmarkPoint | null>(null);
  const mlWindowStartRef = useRef<number | null>(null);
  const mlPredictionRequestRef = useRef(0);

  // Read through refs inside the frame loop so slider tweaks and identity
  // changes apply on the next frame without tearing down the landmarker.
  const settingsRef = useRef(settings);
  const modeRef = useRef(mode);
  const identityRef = useRef(identity);
  const onLandmarksRef = useRef(onLandmarks);
  const mlWindowSecondsRef = useRef(mlWindowSeconds);

  const [status, setStatus] = useState<FocusDetectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [focusSnapshot, setFocusSnapshot] = useState<FocusSnapshot>(emptyFocusSnapshot);
  const [detectionSnapshot, setDetectionSnapshot] =
    useState<DetectionSnapshot>(emptyDetectionSnapshot);
  const [mlPrediction, setMlPrediction] = useState<MlPredictionSnapshot | null>(null);
  const [mlStatus, setMlStatus] = useState<MlPredictionStatus>('idle');
  const [mlError, setMlError] = useState<string | null>(null);
  const [expressionSignals, setExpressionSignals] = useState<ExpressionSignals | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useEffect(() => {
    onLandmarksRef.current = onLandmarks;
  }, [onLandmarks]);

  useEffect(() => {
    mlWindowSecondsRef.current = mlWindowSeconds;
  }, [mlWindowSeconds]);

  useEffect(() => {
    modeRef.current = mode;
    if (mode === 'ml' && status === 'running') {
      setMlStatus((current) => (current === 'predicting' ? current : 'collecting'));
    }
  }, [mode, status]);

  const maybePredictWithMl = useCallback(
    async (windowFrames: FrameSignals[], ruleSnapshot: FocusSnapshot, now: number) => {
      if (modeRef.current !== 'ml' || windowFrames.length === 0) {
        return;
      }

      mlWindowStartRef.current ??= now;

      if (now - mlWindowStartRef.current < mlWindowSecondsRef.current * 1000) {
        setMlStatus((current) => (current === 'predicting' ? current : 'collecting'));
        return;
      }

      const windowStart = mlWindowStartRef.current;
      const frameWindow = windowFrames.filter((frame) => frame.timestamp >= windowStart);
      mlWindowStartRef.current = now;
      const requestId = mlPredictionRequestRef.current + 1;
      mlPredictionRequestRef.current = requestId;
      setMlStatus('predicting');
      setMlError(null);

      try {
        const featureWindow = buildFeatureWindow(
          frameWindow,
          ruleSnapshot,
          windowStart,
          now,
          identityRef.current
        );
        const response = await predictFocusWindow(featureWindow);

        if (mlPredictionRequestRef.current !== requestId) {
          return;
        }

        setMlPrediction({
          featureWindow,
          response,
          windowId: featureWindow.windowId,
          windowEnd: new Date().toLocaleTimeString()
        });
        setMlStatus('ready');
      } catch (reason) {
        if (mlPredictionRequestRef.current !== requestId) {
          return;
        }

        setMlStatus('fallback');
        setMlError(reason instanceof Error ? reason.message : 'ML 서버 예측을 사용할 수 없습니다.');
      }
    },
    []
  );

  const detectFrame = useCallback(() => {
    const landmarker = landmarkerRef.current;
    const video = videoRef.current;

    if (!landmarker || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      frameRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);
    const landmarks = result.faceLandmarks as LandmarkPoint[][];
    const blendshapeCategories = result.faceBlendshapes?.[0]?.categories as
      | BlendshapeCategory[]
      | undefined;
    const matrix = result.facialTransformationMatrixes?.[0]?.data as
      | readonly number[]
      | undefined;
    const lastFrameAt = lastFrameAtRef.current;
    const fps = lastFrameAt ? Math.round(1000 / Math.max(1, now - lastFrameAt)) : 0;
    lastFrameAtRef.current = now;

    onLandmarksRef.current?.(landmarks);

    const currentSettings = settingsRef.current;
    const frameSignals = extractFrameSignals(
      landmarks[0],
      currentSettings,
      now,
      previousNoseRef.current
    );
    previousNoseRef.current = landmarks[0]?.[1] ?? previousNoseRef.current;
    signalWindowRef.current = updateSignalWindow(
      signalWindowRef.current,
      frameSignals,
      currentSettings
    );

    setDetectionSnapshot({
      faces: landmarks.length,
      landmarks: landmarks.reduce((count, face) => count + face.length, 0),
      fps,
      lastUpdatedAt: new Date().toLocaleTimeString()
    });
    const ruleSnapshot = classifyFocus(signalWindowRef.current, currentSettings);
    setFocusSnapshot(ruleSnapshot);
    setExpressionSignals(
      expressionSignalsFromBlendshapes(blendshapeCategories, matrix, Date.now())
    );
    void maybePredictWithMl(signalWindowRef.current, ruleSnapshot, now);

    frameRef.current = requestAnimationFrame(detectFrame);
  }, [maybePredictWithMl]);

  useEffect(() => {
    if (!enabled || !track) {
      return undefined;
    }

    let cancelled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    videoRef.current = video;

    setStatus('loading');
    setError(null);

    void (async () => {
      try {
        const landmarker = landmarkerRef.current ?? (await createFaceLandmarker());

        if (cancelled) {
          return;
        }

        landmarkerRef.current = landmarker;
        await video.play();

        if (cancelled) {
          return;
        }

        setStatus('running');
        frameRef.current = requestAnimationFrame(detectFrame);
      } catch (reason) {
        if (cancelled) {
          return;
        }

        console.error('Focus detection failed to start:', reason);
        setStatus('error');
        setError(
          reason instanceof Error
            ? reason.message
            : 'MediaPipe 모델을 초기화하지 못했습니다. 개발자 콘솔 로그를 확인해주세요.'
        );
      }
    })();

    return () => {
      cancelled = true;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      video.srcObject = null;
      videoRef.current = null;
      lastFrameAtRef.current = null;
      signalWindowRef.current = [];
      previousNoseRef.current = null;
      mlWindowStartRef.current = null;
      // Invalidate in-flight predictions so a late response cannot revive state.
      mlPredictionRequestRef.current += 1;

      setStatus('idle');
      setError(null);
      setFocusSnapshot(emptyFocusSnapshot);
      setDetectionSnapshot(emptyDetectionSnapshot);
      setMlPrediction(null);
      setMlStatus('idle');
      setMlError(null);
      setExpressionSignals(null);
    };
  }, [detectFrame, enabled, track]);

  // The landmarker is expensive to build, so it outlives start/stop cycles and
  // is only released when the screen goes away.
  useEffect(() => {
    return () => {
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  return {
    status,
    error,
    focusSnapshot,
    detectionSnapshot,
    mlPrediction,
    mlStatus,
    mlError,
    expressionSignals
  };
}

async function createFaceLandmarker() {
  const baseOptions = {
    modelAssetPath: faceLandmarkerModel
  };

  try {
    return await FaceLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        ...baseOptions,
        delegate: 'GPU'
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    });
  } catch (gpuReason) {
    console.warn('MediaPipe GPU delegate failed. Falling back to CPU.', gpuReason);
    return FaceLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        ...baseOptions,
        delegate: 'CPU'
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    });
  }
}
