import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, Camera, CircleStop, Play, RotateCcw, Settings, SlidersHorizontal } from 'lucide-react';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import {
  type FocusFeedback,
  type FeatureWindowV1,
  type MlFocusLabel,
  type PredictResponse,
  predictFocusWindow,
  sendFocusFeedback
} from '../../focus-ml-client';
import faceLandmarkerModel from '../../assets/mediapipe/face_landmarker.task?url';
import wasmBinaryPath from '../../assets/mediapipe/vision_wasm_internal.wasm?url';
import wasmLoaderPath from '../../assets/mediapipe/vision_wasm_internal.js?url';
import type { ScreenProps } from './types';

const wasmFileset = {
  wasmBinaryPath,
  wasmLoaderPath
};

type TestStatus = 'idle' | 'loading' | 'running' | 'stopped' | 'error';
type FocusDecisionMode = 'rule' | 'ml';
type MlPredictionStatus = 'idle' | 'collecting' | 'predicting' | 'ready' | 'fallback';
type MlFeedbackStatus = 'idle' | 'sending' | 'sent' | 'dismissed' | 'error';
type FocusLabel = 'focused' | 'distracted' | 'away' | 'sleepy' | 'uncertain' | 'paused';
type FocusSignalName = 'face_missing' | 'eyes_closed' | 'head_turned' | 'head_down';

type LandmarkPoint = {
  x: number;
  y: number;
};

type RuleSettings = {
  windowSeconds: number;
  focusedThreshold: number;
  faceMissingSeconds: number;
  eyesClosedSeconds: number;
  headTurnedSeconds: number;
  headDownSeconds: number;
  eyeAspectRatioThreshold: number;
  headTurnRatioThreshold: number;
  headDownRatioThreshold: number;
  faceMissingPenalty: number;
  eyesClosedPenalty: number;
  headTurnedPenalty: number;
  headDownPenalty: number;
};

type FrameSignals = {
  timestamp: number;
  facePresent: boolean;
  eyeAspectRatio: number;
  headYawRatio: number;
  headPitchRatio: number;
  eyesClosed: boolean;
  headTurned: boolean;
  headDown: boolean;
};

type FocusSnapshot = {
  label: FocusLabel;
  score: number;
  activeSignals: FocusSignalName[];
  durations: Record<FocusSignalName, number>;
  current: Omit<FrameSignals, 'timestamp'>;
};

type MlPredictionSnapshot = {
  featureWindow: FeatureWindowV1;
  response: PredictResponse;
  windowId: string;
  windowEnd: string;
};

type DetectionSnapshot = {
  faces: number;
  landmarks: number;
  fps: number;
  lastUpdatedAt: string;
};

const defaultRuleSettings: RuleSettings = {
  windowSeconds: 30,
  focusedThreshold: 70,
  faceMissingSeconds: 5,
  eyesClosedSeconds: 3,
  headTurnedSeconds: 10,
  headDownSeconds: 10,
  eyeAspectRatioThreshold: 0.19,
  headTurnRatioThreshold: 0.18,
  headDownRatioThreshold: 0.36,
  faceMissingPenalty: 70,
  eyesClosedPenalty: 45,
  headTurnedPenalty: 30,
  headDownPenalty: 35
};

const emptyDetectionSnapshot: DetectionSnapshot = {
  faces: 0,
  landmarks: 0,
  fps: 0,
  lastUpdatedAt: '-'
};

const emptyFocusSnapshot: FocusSnapshot = {
  label: 'paused',
  score: 0,
  activeSignals: ['face_missing'],
  durations: {
    face_missing: 0,
    eyes_closed: 0,
    head_turned: 0,
    head_down: 0
  },
  current: {
    facePresent: false,
    eyeAspectRatio: 0,
    headYawRatio: 0,
    headPitchRatio: 0,
    eyesClosed: false,
    headTurned: false,
    headDown: false
  }
};

const mlWindowSeconds = 20;

const focusLabelText: Record<FocusLabel, string> = {
  focused: '집중중',
  distracted: '주의 필요',
  away: '자리비움',
  sleepy: '졸림 의심',
  uncertain: '판단 보류',
  paused: '대기'
};

const focusLabelDescription: Record<FocusLabel, string> = {
  focused: '얼굴이 안정적으로 잡히고 이상 신호가 기준치보다 낮아요.',
  distracted: '고개 방향이나 숙임 신호가 설정 기준 이상 지속됐어요.',
  away: '얼굴이 일정 시간 이상 감지되지 않았어요.',
  sleepy: '눈 감김 신호가 설정 기준 이상 지속됐어요.',
  uncertain: '신호가 약하거나 짧아서 아직 확정하지 않았어요.',
  paused: 'MediaPipe 분석을 시작하면 label이 갱신돼요.'
};

const mlStatusText: Record<MlPredictionStatus, string> = {
  idle: 'ML 대기',
  collecting: '20초 window 수집 중',
  predicting: 'ML 예측 중',
  ready: 'ML 예측 표시',
  fallback: '로컬 판정 유지'
};

const settingGroups: Array<{
  title: string;
  description: string;
  controls: Array<{
    key: keyof RuleSettings;
    label: string;
    min: number;
    max: number;
    step: number;
    unit: string;
  }>;
}> = [
  {
    title: '판정 시간',
    description: '각 신호가 몇 초 이상 이어질 때 label에 반영할지 정합니다.',
    controls: [
      { key: 'windowSeconds', label: '분석 window', min: 10, max: 60, step: 5, unit: '초' },
      { key: 'faceMissingSeconds', label: '얼굴 없음', min: 1, max: 20, step: 1, unit: '초' },
      { key: 'eyesClosedSeconds', label: '눈 감김', min: 1, max: 10, step: 1, unit: '초' },
      { key: 'headTurnedSeconds', label: '고개 돌림', min: 1, max: 30, step: 1, unit: '초' },
      { key: 'headDownSeconds', label: '고개 숙임', min: 1, max: 30, step: 1, unit: '초' }
    ]
  },
  {
    title: 'MediaPipe feature 기준',
    description: 'landmark에서 계산한 값이 어느 정도일 때 이상 신호로 볼지 정합니다.',
    controls: [
      {
        key: 'eyeAspectRatioThreshold',
        label: '눈 감김 EAR',
        min: 0.12,
        max: 0.3,
        step: 0.01,
        unit: ''
      },
      {
        key: 'headTurnRatioThreshold',
        label: '고개 돌림 비율',
        min: 0.08,
        max: 0.35,
        step: 0.01,
        unit: ''
      },
      {
        key: 'headDownRatioThreshold',
        label: '고개 숙임 비율',
        min: 0.24,
        max: 0.5,
        step: 0.01,
        unit: ''
      }
    ]
  },
  {
    title: '점수 감점',
    description: '각 신호가 활성화됐을 때 집중도 점수에서 뺄 값을 정합니다.',
    controls: [
      { key: 'focusedThreshold', label: '집중 label 기준', min: 40, max: 95, step: 1, unit: '점' },
      { key: 'faceMissingPenalty', label: '얼굴 없음 감점', min: 0, max: 100, step: 1, unit: '점' },
      { key: 'eyesClosedPenalty', label: '눈 감김 감점', min: 0, max: 100, step: 1, unit: '점' },
      { key: 'headTurnedPenalty', label: '고개 돌림 감점', min: 0, max: 100, step: 1, unit: '점' },
      { key: 'headDownPenalty', label: '고개 숙임 감점', min: 0, max: 100, step: 1, unit: '점' }
    ]
  }
];

export function MediaPipeTest({ go }: ScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const signalWindowRef = useRef<FrameSignals[]>([]);
  const previousNoseRef = useRef<LandmarkPoint | null>(null);
  const settingsRef = useRef<RuleSettings>(defaultRuleSettings);
  const modeRef = useRef<FocusDecisionMode>('rule');
  const mlWindowStartRef = useRef<number | null>(null);
  const mlPredictionRequestRef = useRef(0);

  const [status, setStatus] = useState<TestStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [detectionSnapshot, setDetectionSnapshot] =
    useState<DetectionSnapshot>(emptyDetectionSnapshot);
  const [focusSnapshot, setFocusSnapshot] = useState<FocusSnapshot>(emptyFocusSnapshot);
  const [ruleSettings, setRuleSettings] = useState<RuleSettings>(defaultRuleSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [decisionMode, setDecisionMode] = useState<FocusDecisionMode>('rule');
  const [mlPredictionStatus, setMlPredictionStatus] = useState<MlPredictionStatus>('idle');
  const [mlPrediction, setMlPrediction] = useState<MlPredictionSnapshot | null>(null);
  const [mlError, setMlError] = useState<string | null>(null);
  const [mlFeedbackStatus, setMlFeedbackStatus] = useState<MlFeedbackStatus>('idle');
  const [mlFeedbackError, setMlFeedbackError] = useState<string | null>(null);

  useEffect(() => {
    settingsRef.current = ruleSettings;
  }, [ruleSettings]);

  useEffect(() => {
    modeRef.current = decisionMode;
    if (decisionMode === 'ml' && status === 'running') {
      setMlPredictionStatus((current) => (current === 'predicting' ? current : 'collecting'));
    }
  }, [decisionMode, status]);

  const stop = (updateStatus = true) => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    lastFrameAtRef.current = null;
    signalWindowRef.current = [];
    previousNoseRef.current = null;
    mlWindowStartRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (updateStatus) {
      setDetectionSnapshot(emptyDetectionSnapshot);
      setFocusSnapshot(emptyFocusSnapshot);
      setMlPrediction(null);
      setMlPredictionStatus('idle');
      setMlError(null);
      setMlFeedbackStatus('idle');
      setMlFeedbackError(null);
      setStatus((current) => (current === 'error' ? current : 'stopped'));
    }
  };

  useEffect(() => {
    return () => {
      stop(false);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  const drawLandmarks = (landmarks: Array<Array<LandmarkPoint>>) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!video || !canvas || !context || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#57d38c';
    context.strokeStyle = '#8a7df0';
    context.lineWidth = 2;

    landmarks.forEach((face) => {
      face.forEach((point) => {
        context.beginPath();
        context.arc(point.x * canvas.width, point.y * canvas.height, 1.5, 0, Math.PI * 2);
        context.fill();
      });

      const xs = face.map((point) => point.x * canvas.width);
      const ys = face.map((point) => point.y * canvas.height);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      const width = Math.max(...xs) - left;
      const height = Math.max(...ys) - top;
      context.strokeRect(left, top, width, height);
    });
  };

  const detectFrame = () => {
    const landmarker = landmarkerRef.current;
    const video = videoRef.current;

    if (!landmarker || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      frameRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);
    const landmarks = result.faceLandmarks as Array<Array<LandmarkPoint>>;
    const lastFrameAt = lastFrameAtRef.current;
    const fps = lastFrameAt ? Math.round(1000 / Math.max(1, now - lastFrameAt)) : 0;
    lastFrameAtRef.current = now;

    drawLandmarks(landmarks);

    const settings = settingsRef.current;
    const frameSignals = extractFrameSignals(landmarks[0], settings, now, previousNoseRef.current);
    previousNoseRef.current = landmarks[0]?.[1] ?? previousNoseRef.current;
    signalWindowRef.current = updateSignalWindow(signalWindowRef.current, frameSignals, settings);

    setDetectionSnapshot({
      faces: landmarks.length,
      landmarks: landmarks.reduce((count, face) => count + face.length, 0),
      fps,
      lastUpdatedAt: new Date().toLocaleTimeString()
    });
    const ruleSnapshot = classifyFocus(signalWindowRef.current, settings);
    setFocusSnapshot(ruleSnapshot);
    void maybePredictWithMl(signalWindowRef.current, ruleSnapshot, now);

    frameRef.current = requestAnimationFrame(detectFrame);
  };

  const maybePredictWithMl = async (
    windowFrames: FrameSignals[],
    ruleSnapshot: FocusSnapshot,
    now: number
  ) => {
    if (modeRef.current !== 'ml' || windowFrames.length === 0) {
      return;
    }

    mlWindowStartRef.current ??= now;

    if (now - mlWindowStartRef.current < mlWindowSeconds * 1000) {
      setMlPredictionStatus((current) => (current === 'predicting' ? current : 'collecting'));
      return;
    }

    const frameWindow = windowFrames.filter((frame) => frame.timestamp >= mlWindowStartRef.current!);
    const windowStart = mlWindowStartRef.current;
    mlWindowStartRef.current = now;
    const requestId = mlPredictionRequestRef.current + 1;
    mlPredictionRequestRef.current = requestId;
    setMlPredictionStatus('predicting');
    setMlError(null);

    try {
      const featureWindow = buildFeatureWindow(frameWindow, ruleSnapshot, windowStart, now);
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
      setMlPredictionStatus('ready');
      setMlFeedbackStatus('idle');
      setMlFeedbackError(null);
    } catch (reason) {
      if (mlPredictionRequestRef.current !== requestId) {
        return;
      }

      setMlPredictionStatus('fallback');
      setMlError(reason instanceof Error ? reason.message : 'ML 서버 예측을 사용할 수 없습니다.');
    }
  };

  const confirmMlDistraction = async () => {
    if (!mlPrediction) return;

    setMlFeedbackStatus('sending');
    setMlFeedbackError(null);

    try {
      await sendFocusFeedback(buildFocusFeedback(mlPrediction));
      setMlFeedbackStatus('sent');
    } catch (reason) {
      setMlFeedbackStatus('error');
      setMlFeedbackError(
        reason instanceof Error ? reason.message : 'ML 서버에 피드백을 보내지 못했어요.'
      );
    }
  };

  const createFaceLandmarker = async () => {
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
  };

  const start = async () => {
    setStatus('loading');
    setError(null);

    try {
      await window.roomi?.media.ensureAccess();

      const landmarker = landmarkerRef.current ?? (await createFaceLandmarker());

      landmarkerRef.current = landmarker;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus('running');
      frameRef.current = requestAnimationFrame(detectFrame);
    } catch (reason) {
      console.error('MediaPipe test failed:', reason);
      stop();
      setStatus('error');
      setError(
        reason instanceof Error
          ? reason.message
          : '카메라 또는 MediaPipe 모델을 초기화하지 못했습니다. 개발자 콘솔의 MediaPipe test failed 로그를 확인해주세요.'
      );
    }
  };

  const updateSetting = (key: keyof RuleSettings, value: number) => {
    setRuleSettings((current) => ({
      ...current,
      [key]: value
    }));
  };

  const isBusy = status === 'loading';
  const isRunning = status === 'running';
  const visibleFocusSnapshot =
    decisionMode === 'ml' && mlPrediction
      ? focusSnapshotFromMl(mlPrediction.response, focusSnapshot)
      : focusSnapshot;
  const shouldShowMlFeedback =
    decisionMode === 'ml' &&
    mlPrediction?.response.shouldPrompt === true &&
    mlPrediction.response.label !== 'focused' &&
    mlFeedbackStatus !== 'sent' &&
    mlFeedbackStatus !== 'dismissed';
  const labelClassName = `focus-label focus-label--${visibleFocusSnapshot.label}`;
  const focusScoreWidth = useMemo(
    () => `${Math.max(0, Math.min(100, visibleFocusSnapshot.score))}%`,
    [visibleFocusSnapshot.score]
  );

  return (
    <div className="screen screen--app mediapipe-test">
      <header className="mediapipe-test__header">
        <button
          type="button"
          className="btn btn--ghost mediapipe-test__back"
          onClick={() => {
            stop();
            go('onboarding-create');
          }}
        >
          <ArrowLeft size={16} />
          돌아가기
        </button>
        <div>
          <p className="screen-kicker">MediaPipe 테스트</p>
          <h1 className="mediapipe-test__title">집중도 판정 모드 테스트</h1>
        </div>
        <span className={`badge ${isRunning ? 'badge--green' : 'badge--wait'}`}>
          {isRunning ? '실행 중' : isBusy ? '초기화 중' : '대기'}
        </span>
      </header>

      <section className="mediapipe-test__body">
        <div className="mediapipe-test__stage" aria-label="웹캠 MediaPipe 미리보기">
          <video ref={videoRef} className="mediapipe-test__video" playsInline muted />
          <canvas ref={canvasRef} className="mediapipe-test__overlay" />
          {!isRunning && (
            <div className="mediapipe-test__empty">
              <Camera size={32} />
              <span>시작하면 웹캠 화면, 얼굴 landmark, 집중도 label이 표시됩니다.</span>
            </div>
          )}
        </div>

        <aside className="mediapipe-test__panel">
          <div className="mediapipe-test__controls">
            <button
              type="button"
              className="btn btn--primary"
              disabled={isBusy || isRunning}
              onClick={start}
            >
              <Play size={16} />
              시작
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!isRunning}
              onClick={() => stop()}
            >
              <CircleStop size={16} />
              중지
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings size={16} />
              기준 조정
            </button>
          </div>

          <div className="decision-mode" aria-label="집중도 판정 모드">
            <button
              type="button"
              className={`decision-mode__option${decisionMode === 'rule' ? ' decision-mode__option--active' : ''}`}
              onClick={() => setDecisionMode('rule')}
            >
              <SlidersHorizontal size={15} />
              Rule-Based
            </button>
            <button
              type="button"
              className={`decision-mode__option${decisionMode === 'ml' ? ' decision-mode__option--active' : ''}`}
              onClick={() => setDecisionMode('ml')}
            >
              <Bot size={15} />
              ML 서버
            </button>
          </div>

          {error ? <p className="mediapipe-test__error">{error}</p> : null}
          {mlError && decisionMode === 'ml' ? <p className="mediapipe-test__error">{mlError}</p> : null}
          {mlFeedbackError && decisionMode === 'ml' ? (
            <p className="mediapipe-test__error">{mlFeedbackError}</p>
          ) : null}

          {shouldShowMlFeedback ? (
            <section className="ml-feedback" role="dialog" aria-label="ML 집중 확인" aria-modal="false">
              <div>
                <span className="ml-feedback__label">ML 확인</span>
                <h2 className="ml-feedback__title">혹시 집중 안하고 있어?</h2>
                <p className="ml-feedback__text">
                  방금 window에서 {focusLabelText[visibleFocusSnapshot.label]} 상태로 예측됐어.
                </p>
              </div>
              <div className="ml-feedback__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={mlFeedbackStatus === 'sending'}
                  onClick={confirmMlDistraction}
                >
                  {mlFeedbackStatus === 'sending' ? '보내는 중...' : '맞아, 집중 안 했어'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={mlFeedbackStatus === 'sending'}
                  onClick={() => setMlFeedbackStatus('dismissed')}
                >
                  아니, 집중 중이야
                </button>
              </div>
            </section>
          ) : null}
          {mlFeedbackStatus === 'sent' ? (
            <p className="ml-feedback__sent">피드백을 ML 서버에 보냈어요.</p>
          ) : null}

          <section className="focus-card" aria-label="현재 집중도 판정">
            <div className="focus-card__head">
              <div>
                <div className="focus-card__eyebrow">
                  {decisionMode === 'ml' && mlPrediction ? 'ML 서버 label' : '현재 label'}
                </div>
                <div className={labelClassName}>{focusLabelText[visibleFocusSnapshot.label]}</div>
              </div>
              <div className="focus-score">
                <span>{visibleFocusSnapshot.score}</span>
                <small>/100</small>
              </div>
            </div>
            <p className="focus-card__text">
              {decisionMode === 'ml'
                ? getMlCardDescription(mlPredictionStatus, mlPrediction)
                : focusLabelDescription[visibleFocusSnapshot.label]}
            </p>
            <div className="focus-scorebar" aria-label={`집중도 ${visibleFocusSnapshot.score}점`}>
              <div className="focus-scorebar__fill" style={{ width: focusScoreWidth }} />
            </div>
          </section>

          <dl className="mediapipe-test__stats">
            <div>
              <dt>감지된 얼굴</dt>
              <dd>{detectionSnapshot.faces}</dd>
            </div>
            <div>
              <dt>landmark 수</dt>
              <dd>{detectionSnapshot.landmarks}</dd>
            </div>
            <div>
              <dt>처리 FPS</dt>
              <dd>{detectionSnapshot.fps}</dd>
            </div>
            <div>
              <dt>최근 갱신</dt>
              <dd>{detectionSnapshot.lastUpdatedAt}</dd>
            </div>
            <div>
              <dt>판정 모드</dt>
              <dd>{decisionMode === 'ml' ? mlStatusText[mlPredictionStatus] : 'Rule-Based'}</dd>
            </div>
            {decisionMode === 'ml' && mlPrediction ? (
              <div>
                <dt>모델</dt>
                <dd>{mlPrediction.response.modelVersion}</dd>
              </div>
            ) : null}
          </dl>

          <div className="focus-feature-grid" aria-label="Rule-Based feature 값">
            <FeatureMeter label="얼굴 없음" value={focusSnapshot.durations.face_missing} unit="초" />
            <FeatureMeter label="눈 감김" value={focusSnapshot.durations.eyes_closed} unit="초" />
            <FeatureMeter label="고개 돌림" value={focusSnapshot.durations.head_turned} unit="초" />
            <FeatureMeter label="고개 숙임" value={focusSnapshot.durations.head_down} unit="초" />
            <FeatureMeter
              label="EAR"
              value={round(focusSnapshot.current.eyeAspectRatio, 2)}
              unit=""
            />
            <FeatureMeter
              label="yaw"
              value={round(focusSnapshot.current.headYawRatio, 2)}
              unit=""
            />
            <FeatureMeter
              label="pitch"
              value={round(focusSnapshot.current.headPitchRatio, 2)}
              unit=""
            />
          </div>

          <p className="mediapipe-test__note">
            Rule-Based는 매 프레임 로컬 기준으로 판정하고, ML 서버 모드는 같은 로컬 feature를 20초
            window로 묶어 feature schema v1 예측을 요청합니다. 서버가 늦거나 실패하면 로컬 판정을
            계속 사용합니다.
          </p>
        </aside>
      </section>

      {isSettingsOpen && (
        <div className="mp-settings-modal" role="dialog" aria-modal="true" aria-label="Rule-Based 기준 조정">
          <div className="mp-settings-modal__panel">
            <div className="mp-settings-modal__head">
              <div>
                <div className="mp-settings-modal__title">Rule-Based 기준 조정</div>
                <p className="mp-settings-modal__desc">
                  숫자를 바꾸면 다음 프레임부터 집중도 label과 점수에 바로 반영됩니다.
                </p>
              </div>
              <button
                type="button"
                className="ctrl"
                aria-label="기준 초기화"
                onClick={() => setRuleSettings(defaultRuleSettings)}
              >
                <RotateCcw size={18} />
              </button>
            </div>

            <div className="mp-settings-modal__body">
              {settingGroups.map((group) => (
                <section className="rule-group" key={group.title}>
                  <h2 className="rule-group__title">{group.title}</h2>
                  <p className="rule-group__desc">{group.description}</p>
                  <div className="rule-controls">
                    {group.controls.map((control) => (
                      <RuleControl
                        key={control.key}
                        label={control.label}
                        max={control.max}
                        min={control.min}
                        step={control.step}
                        unit={control.unit}
                        value={ruleSettings[control.key]}
                        onChange={(value) => updateSetting(control.key, value)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="mp-settings-modal__actions">
              <button type="button" className="btn btn--primary" onClick={() => setIsSettingsOpen(false)}>
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureMeter({ label, unit, value }: { label: string; unit: string; value: number }) {
  return (
    <div className="feature-meter">
      <span>{label}</span>
      <strong>
        {value}
        {unit}
      </strong>
    </div>
  );
}

function RuleControl({
  label,
  max,
  min,
  onChange,
  step,
  unit,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  unit: string;
  value: number;
}) {
  return (
    <label className="rule-control">
      <span className="rule-control__label">{label}</span>
      <div className="rule-control__row">
        <input
          aria-label={label}
          className="rule-control__range"
          max={max}
          min={min}
          step={step}
          type="range"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="rule-control__value">
          <input
            max={max}
            min={min}
            step={step}
            type="number"
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          {unit}
        </span>
      </div>
    </label>
  );
}

function extractFrameSignals(
  face: LandmarkPoint[] | undefined,
  settings: RuleSettings,
  timestamp: number,
  previousNose: LandmarkPoint | null
): FrameSignals {
  if (!face) {
    return {
      timestamp,
      facePresent: false,
      eyeAspectRatio: 0,
      headYawRatio: 0,
      headPitchRatio: 0,
      eyesClosed: false,
      headTurned: false,
      headDown: false
    };
  }

  const bounds = getBounds(face);
  const faceWidth = Math.max(0.001, bounds.width);
  const faceHeight = Math.max(0.001, bounds.height);
  const nose = face[1] ?? face[Math.floor(face.length / 2)];
  const leftEar = calculateEyeAspectRatio(face, [33, 160, 158, 133, 153, 144]);
  const rightEar = calculateEyeAspectRatio(face, [362, 385, 387, 263, 373, 380]);
  const eyeAspectRatio = (leftEar + rightEar) / 2;
  const eyeCenterY = averagePoints(face, [33, 133, 362, 263]).y;
  const faceCenterX = bounds.left + faceWidth / 2;
  const headYawRatio = (nose.x - faceCenterX) / faceWidth;
  const headPitchRatio = (nose.y - eyeCenterY) / faceHeight;
  const motionBoost =
    previousNose === null
      ? 0
      : distance(nose, previousNose) > 0.018
        ? 0.01
        : 0;

  return {
    timestamp,
    facePresent: true,
    eyeAspectRatio,
    headYawRatio,
    headPitchRatio,
    eyesClosed: eyeAspectRatio < settings.eyeAspectRatioThreshold,
    headTurned: Math.abs(headYawRatio) > settings.headTurnRatioThreshold + motionBoost,
    headDown: headPitchRatio > settings.headDownRatioThreshold
  };
}

function updateSignalWindow(
  windowFrames: FrameSignals[],
  nextFrame: FrameSignals,
  settings: RuleSettings
) {
  const earliest = nextFrame.timestamp - settings.windowSeconds * 1000;
  return [...windowFrames, nextFrame].filter((frame) => frame.timestamp >= earliest);
}

function classifyFocus(windowFrames: FrameSignals[], settings: RuleSettings): FocusSnapshot {
  const latest = windowFrames.at(-1);

  if (!latest) {
    return emptyFocusSnapshot;
  }

  const durations = {
    face_missing: getLatestDuration(windowFrames, (frame) => !frame.facePresent),
    eyes_closed: getLatestDuration(windowFrames, (frame) => frame.eyesClosed),
    head_turned: getLatestDuration(windowFrames, (frame) => frame.headTurned),
    head_down: getLatestDuration(windowFrames, (frame) => frame.headDown)
  };
  const activeSignals: FocusSignalName[] = [];
  let penalty = 0;

  if (durations.face_missing >= settings.faceMissingSeconds) {
    activeSignals.push('face_missing');
    penalty += settings.faceMissingPenalty;
  }
  if (durations.eyes_closed >= settings.eyesClosedSeconds) {
    activeSignals.push('eyes_closed');
    penalty += settings.eyesClosedPenalty;
  }
  if (durations.head_turned >= settings.headTurnedSeconds) {
    activeSignals.push('head_turned');
    penalty += settings.headTurnedPenalty;
  }
  if (durations.head_down >= settings.headDownSeconds) {
    activeSignals.push('head_down');
    penalty += settings.headDownPenalty;
  }

  const score = clamp(Math.round(100 - penalty), 0, 100);
  const label = getFocusLabel(score, activeSignals, settings);

  return {
    label,
    score,
    activeSignals,
    durations,
    current: {
      facePresent: latest.facePresent,
      eyeAspectRatio: latest.eyeAspectRatio,
      headYawRatio: latest.headYawRatio,
      headPitchRatio: latest.headPitchRatio,
      eyesClosed: latest.eyesClosed,
      headTurned: latest.headTurned,
      headDown: latest.headDown
    }
  };
}

function buildFeatureWindow(
  windowFrames: FrameSignals[],
  ruleSnapshot: FocusSnapshot,
  windowStart: number,
  windowEnd: number
): FeatureWindowV1 {
  const durationSec = clamp(round((windowEnd - windowStart) / 1000, 1), 5, 60);
  const frames = windowFrames.length > 0 ? windowFrames : [];
  const detectedFrames = frames.filter((frame) => frame.facePresent);
  const facePresenceRatio = ratio(detectedFrames.length, frames.length);
  const eyeClosedRatio = ratio(
    detectedFrames.filter((frame) => frame.eyesClosed).length,
    detectedFrames.length
  );
  const headDownRatio = ratio(
    detectedFrames.filter((frame) => frame.headDown).length,
    detectedFrames.length
  );
  const headTurnedRatio = ratio(
    detectedFrames.filter((frame) => frame.headTurned).length,
    detectedFrames.length
  );
  const headYawDegrees = detectedFrames.map((frame) => frame.headYawRatio * 90);
  const headPitchDegrees = detectedFrames.map((frame) => frame.headPitchRatio * 90);
  const motionAmount = getMotionAmount(detectedFrames);
  const ruleScore = clamp(ruleSnapshot.score / 100, 0, 1);
  const windowEndDate = new Date();
  const windowStartDate = new Date(windowEndDate.getTime() - durationSec * 1000);

  return {
    windowId: cryptoRandomId(),
    userId: 'mediapipe-test-user',
    sessionId: 'mediapipe-test-session',
    windowStart: windowStartDate.toISOString(),
    windowEnd: windowEndDate.toISOString(),
    durationSec,
    features: {
      facePresenceRatio,
      avgFaceDetectionConfidence: facePresenceRatio,
      eyeClosedRatio,
      headYawMean: round(mean(headYawDegrees), 3),
      headYawStd: round(populationStd(headYawDegrees), 3),
      headPitchMean: round(mean(headPitchDegrees), 3),
      headPitchStd: round(populationStd(headPitchDegrees), 3),
      headDownRatio,
      headTurnedRatio,
      lowConfidenceRatio: round(1 - facePresenceRatio, 3),
      motionAmount,
      ruleBasedScoreMean: ruleScore,
      ruleBasedScoreMin: ruleScore
    },
    ruleBasedLabel: toMlFocusLabel(ruleSnapshot.label)
  };
}

function focusSnapshotFromMl(response: PredictResponse, fallback: FocusSnapshot): FocusSnapshot {
  return {
    ...fallback,
    label: fromMlFocusLabel(response.label),
    score: Math.round(clamp(response.score, 0, 1) * 100)
  };
}

function buildFocusFeedback(prediction: MlPredictionSnapshot): FocusFeedback {
  const actualLabel = prediction.response.label === 'away' ? 'away' : 'distracted';

  return {
    windowId: prediction.windowId,
    userId: prediction.featureWindow.userId,
    sessionId: prediction.featureWindow.sessionId,
    predictedLabel: prediction.response.label,
    actualLabel,
    wasActuallyFocused: false,
    promptKind: prediction.response.promptKind,
    source: 'mediapipe-test',
    createdAt: new Date().toISOString()
  };
}

function getMlCardDescription(
  status: MlPredictionStatus,
  prediction: MlPredictionSnapshot | null
): string {
  if (!prediction) {
    return status === 'predicting'
      ? 'ML 서버에 feature window 예측을 요청하고 있어요.'
      : 'ML 서버 모드는 20초 단위 feature window가 쌓인 뒤 예측 label을 표시해요.';
  }

  const promptText = prediction.response.shouldPrompt
    ? prediction.response.promptKind === 'exploration'
      ? 'exploration 확인 대상'
      : 'correction 확인 대상'
    : 'prompt 없음';

  return `${prediction.windowEnd} window 예측입니다. confidence ${round(
    prediction.response.confidence,
    2
  )}, ${promptText}.`;
}

function toMlFocusLabel(label: FocusLabel): MlFocusLabel {
  if (label === 'away') {
    return 'away';
  }

  if (label === 'sleepy' || label === 'paused') {
    return 'break_or_paused';
  }

  if (label === 'distracted' || label === 'uncertain') {
    return 'distracted';
  }

  return 'focused';
}

function fromMlFocusLabel(label: MlFocusLabel): FocusLabel {
  if (label === 'break_or_paused') {
    return 'sleepy';
  }

  return label;
}

function getMotionAmount(frames: FrameSignals[]) {
  if (frames.length < 2) {
    return 0;
  }

  const deltas = frames.slice(1).map((frame, index) => {
    const previous = frames[index];
    return Math.hypot(
      frame.headYawRatio - previous.headYawRatio,
      frame.headPitchRatio - previous.headPitchRatio
    );
  });

  return round(mean(deltas) * 100, 3);
}

function mean(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function populationStd(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? round(clamp(numerator / denominator, 0, 1), 3) : 0;
}

function cryptoRandomId() {
  return globalThis.crypto?.randomUUID?.() ?? `window-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFocusLabel(
  score: number,
  activeSignals: FocusSignalName[],
  settings: RuleSettings
): FocusLabel {
  if (activeSignals.includes('face_missing')) {
    return 'away';
  }

  if (activeSignals.includes('eyes_closed')) {
    return 'sleepy';
  }

  if (
    activeSignals.includes('head_turned') ||
    activeSignals.includes('head_down') ||
    score < settings.focusedThreshold
  ) {
    return score >= settings.focusedThreshold - 10 ? 'uncertain' : 'distracted';
  }

  return 'focused';
}

function getLatestDuration(
  windowFrames: FrameSignals[],
  predicate: (frame: FrameSignals) => boolean
) {
  const latest = windowFrames.at(-1);

  if (!latest || !predicate(latest)) {
    return 0;
  }

  let start = latest.timestamp;

  for (let index = windowFrames.length - 1; index >= 0; index -= 1) {
    const frame = windowFrames[index];
    if (!predicate(frame)) {
      break;
    }
    start = frame.timestamp;
  }

  return round((latest.timestamp - start) / 1000, 1);
}

function calculateEyeAspectRatio(face: LandmarkPoint[], indices: [number, number, number, number, number, number]) {
  const [left, upperLeft, upperRight, right, lowerRight, lowerLeft] = indices.map(
    (index) => face[index]
  );

  if (!left || !upperLeft || !upperRight || !right || !lowerRight || !lowerLeft) {
    return 1;
  }

  const verticalA = distance(upperLeft, lowerLeft);
  const verticalB = distance(upperRight, lowerRight);
  const horizontal = distance(left, right);
  return (verticalA + verticalB) / (2 * Math.max(0.001, horizontal));
}

function getBounds(points: LandmarkPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  };
}

function averagePoints(face: LandmarkPoint[], indices: number[]) {
  const points = indices.map((index) => face[index]).filter(Boolean);

  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function distance(a: LandmarkPoint, b: LandmarkPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision: number) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}
