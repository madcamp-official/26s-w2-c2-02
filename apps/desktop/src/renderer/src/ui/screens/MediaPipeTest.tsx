import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, Camera, CircleStop, Play, RotateCcw, Settings, SlidersHorizontal } from 'lucide-react';
import {
  type FocusFeedback,
  resetFocusFeedback,
  sendFocusFeedback
} from '../../focus-ml-client';
import {
  defaultRuleSettings,
  focusSnapshotFromMl,
  round,
  type FocusLabel,
  type LandmarkPoint,
  type RuleSettings
} from '../../focus-pipeline';
import {
  useFocusDetection,
  type FocusDetectionMode,
  type FocusDetectionStatus,
  type MlPredictionSnapshot,
  type MlPredictionStatus
} from '../../use-focus-detection';
import type { ScreenProps } from './types';

type TestStatus = 'idle' | 'loading' | 'running' | 'stopped' | 'error';
type MlFeedbackStatus = 'idle' | 'sending' | 'sent' | 'dismissed' | 'error';
type MlFeedbackResetStatus = 'idle' | 'resetting' | 'reset' | 'error';

const mediapipeTestUserId = 'mediapipe-test-user';
const mediapipeTestSessionId = 'mediapipe-test-session';

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
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraStatus, setCameraStatus] = useState<TestStatus>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [ruleSettings, setRuleSettings] = useState<RuleSettings>(defaultRuleSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [decisionMode, setDecisionMode] = useState<FocusDetectionMode>('rule');
  const [mlFeedbackStatus, setMlFeedbackStatus] = useState<MlFeedbackStatus>('idle');
  const [mlFeedbackError, setMlFeedbackError] = useState<string | null>(null);
  const [mlFeedbackResetStatus, setMlFeedbackResetStatus] =
    useState<MlFeedbackResetStatus>('idle');
  const [mlFeedbackResetMessage, setMlFeedbackResetMessage] = useState<string | null>(null);

  const clearOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const drawLandmarks = useCallback((landmarks: LandmarkPoint[][]) => {
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
  }, []);

  const identity = useMemo(
    () => ({ userId: mediapipeTestUserId, sessionId: mediapipeTestSessionId }),
    []
  );

  const {
    status: detectionStatus,
    error: detectionError,
    focusSnapshot,
    detectionSnapshot,
    mlPrediction,
    mlStatus: mlPredictionStatus,
    mlError
  } = useFocusDetection({
    track,
    enabled: track !== null,
    mode: decisionMode,
    identity,
    settings: ruleSettings,
    mlWindowSeconds,
    onLandmarks: drawLandmarks
  });

  const status = mergeTestStatus(cameraStatus, detectionStatus);
  const error = cameraError ?? detectionError;

  // A fresh window prediction reopens the confirm prompt for that window.
  useEffect(() => {
    if (!mlPrediction) {
      return;
    }

    setMlFeedbackStatus('idle');
    setMlFeedbackError(null);
    setMlFeedbackResetStatus('idle');
    setMlFeedbackResetMessage(null);
  }, [mlPrediction?.windowId]);

  const releaseCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((mediaTrack) => mediaTrack.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      releaseCamera();
    };
  }, [releaseCamera]);

  // The camera opens before the landmarker loads, so a model failure has to
  // release it here. Copy the message out first: dropping the track tears the
  // hook down, which clears its own error.
  useEffect(() => {
    if (detectionStatus !== 'error' || !detectionError) {
      return;
    }

    setCameraError(detectionError);
    setCameraStatus('error');
    releaseCamera();
    setTrack(null);
  }, [detectionError, detectionStatus, releaseCamera]);

  const stop = () => {
    setTrack(null);
    releaseCamera();
    clearOverlay();
    setMlFeedbackStatus('idle');
    setMlFeedbackError(null);
    setMlFeedbackResetStatus('idle');
    setMlFeedbackResetMessage(null);
    setCameraStatus((current) => (current === 'error' ? current : 'stopped'));
  };

  const start = async () => {
    setCameraStatus('loading');
    setCameraError(null);

    try {
      await window.roomi?.media.ensureAccess();

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

      setTrack(stream.getVideoTracks()[0] ?? null);
      setCameraStatus('running');
    } catch (reason) {
      console.error('MediaPipe test failed:', reason);
      stop();
      setCameraStatus('error');
      setCameraError(
        reason instanceof Error
          ? reason.message
          : '카메라 또는 MediaPipe 모델을 초기화하지 못했습니다. 개발자 콘솔의 MediaPipe test failed 로그를 확인해주세요.'
      );
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

  const resetMlFeedback = async () => {
    setMlFeedbackResetStatus('resetting');
    setMlFeedbackResetMessage(null);
    setMlFeedbackError(null);

    try {
      const result = await resetFocusFeedback(mediapipeTestUserId);
      setMlFeedbackStatus('idle');
      setMlFeedbackResetStatus('reset');
      setMlFeedbackResetMessage(formatFeedbackResetMessage(result));
    } catch (reason) {
      setMlFeedbackResetStatus('error');
      setMlFeedbackResetMessage(
        reason instanceof Error ? reason.message : 'ML 피드백을 초기화하지 못했어요.'
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
            <button
              type="button"
              className="btn btn--ghost"
              disabled={decisionMode !== 'ml' || mlFeedbackResetStatus === 'resetting'}
              onClick={resetMlFeedback}
            >
              {mlFeedbackResetStatus === 'resetting' ? '초기화 중...' : '피드백 초기화'}
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
          {mlFeedbackResetMessage && decisionMode === 'ml' ? (
            <p
              className={
                mlFeedbackResetStatus === 'error'
                  ? 'mediapipe-test__error'
                  : 'ml-feedback__sent'
              }
            >
              {mlFeedbackResetMessage}
            </p>
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

function formatFeedbackResetMessage(result: unknown): string {
  if (!isRecord(result)) {
    return 'ML 피드백을 초기화했어요.';
  }

  const deletedFeedbackCount =
    typeof result.deletedFeedbackCount === 'number' ? result.deletedFeedbackCount : null;
  const calibrationReset =
    typeof result.calibrationReset === 'boolean' ? result.calibrationReset : null;

  if (deletedFeedbackCount === null && calibrationReset === null) {
    return 'ML 피드백을 초기화했어요.';
  }

  const countText =
    deletedFeedbackCount === null ? '피드백 기록' : `피드백 ${deletedFeedbackCount}건`;
  const calibrationText =
    calibrationReset === false ? '개인화 값은 유지됐어요.' : '개인화 값도 초기화됐어요.';

  return `${countText}을 삭제했고, ${calibrationText}`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The camera and the landmarker start independently, so the screen stays in
 * "초기화 중" until both are up.
 */
function mergeTestStatus(camera: TestStatus, detection: FocusDetectionStatus): TestStatus {
  if (camera === 'error' || detection === 'error') {
    return 'error';
  }

  if (camera !== 'running') {
    return camera;
  }

  return detection === 'running' ? 'running' : 'loading';
}
