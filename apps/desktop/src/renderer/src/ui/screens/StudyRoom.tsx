import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  Coffee,
  Eye,
  EyeOff,
  Flag,
  LogOut,
  Mic,
  MicOff,
  MoreHorizontal,
  Play,
  Send,
  Video,
  VideoOff
} from 'lucide-react';
import {
  type ChatMessage,
  type ExpressionSignals,
  type FocusRankingEntry,
  type GameKind,
  type GameSession,
  type Goal,
  type HiddenMission,
  type MissionResult,
  type Participant,
  type ParticipantStatus,
  type Room,
  type RoomActivityKind,
  type RoomiMessage,
  type StudySession,
  type VideoJoinInfo
} from '@roomi/shared';
import { InviteCodeCard } from '../components/InviteCodeCard';
import { RoomiMascot } from '../components/RoomiMascot';
import type { ScreenProps } from './types';
import { useDailyRoom } from '../../use-daily-room';
import {
  defaultRuleSettings,
  type FocusLabel,
  type FocusSnapshot
} from '../../focus-pipeline';
import { useFocusDetection } from '../../use-focus-detection';
import {
  missionResultFromCounter,
  updateHiddenMissionCounter,
  type MissionCounterState
} from '../../expression-pipeline';

type DailyParticipantMediaLike = {
  tracks?: {
    video?: {
      state?: string;
      track?: MediaStreamTrack;
    };
  };
};

type DistractionCardKind = 'memory' | 'quick_choice' | 'odd_expression';

type DistractionCard = {
  id: string;
  kind: DistractionCardKind;
  title: string;
  prompt: string;
  choices: string[];
  answer: string;
};

const distractionCardMinDelayMs = 10_000;
const distractionCardMaxDelayMs = 30_000;
const accusationWindowMs = 1_500;
const accusationCooldownMs = 10_000;

type KeyedMissionCounterState = MissionCounterState & {
  missionKey: string;
};

type MissionAccusationPrompt = {
  targetId: string;
  missionId: string;
  choices: string[];
  answer: string;
};

interface StudyRoomProps extends ScreenProps {
  currentParticipantId: string;
  isHost: boolean;
  onEndSession: () => void;
  onLeaveRoom: () => void;
  onToggleGoalAchieved: (achieved: boolean) => void;
  onUpdatePresence: (status: ParticipantStatus) => void;
  onStartBreak: () => void | Promise<void>;
  onStartGame?: (kind: GameKind) => void;
  onSubmitMissionResult?: (result: MissionResult) => void;
  onWinByMissionGuess?: (winnerId: string, targetId: string, missionId: string) => void;
  onSubmitBluffBet?: (targetId: string, predictsCrack: boolean) => void;
  onSubmitBluffSignals?: (signals: ExpressionSignals) => void;
  onAdvanceRelay?: (toId: string, similarity: number) => void;
  onReadyNextRound?: () => void;
  onSendChatMessage?: (text: string) => void;
  participants: Participant[];
  goals: Goal[];
  roomiMessages: RoomiMessage[];
  chatMessages: ChatMessage[];
  focusRanking?: FocusRankingEntry[];
  room: Room;
  currentSession?: StudySession;
  currentGame?: GameSession;
  privateMission?: HiddenMission;
  videoJoin?: VideoJoinInfo;
}

const statusLabel: Record<ParticipantStatus, string> = {
  online: '대기',
  focused: '참여 중',
  distracted: '주의 이탈',
  away: '자리 비움',
  break: '휴식',
  paused: '눈 감김'
};

/**
 * Hiding your face is itself a move in the face games, so a game room flips to
 * `자리 비움` the instant detection loses the face. Study rooms keep the 5 second
 * default: a sip of water or a hand crossing the face is not leaving, and focus
 * time stops accruing for anyone marked away.
 */
const gameRoomRuleSettings = {
  ...defaultRuleSettings,
  faceMissingSeconds: 0
};

export function ruleSettingsForActivity(activityKind: RoomActivityKind) {
  return activityKind === 'study' ? defaultRuleSettings : gameRoomRuleSettings;
}

const distractionCards: Omit<DistractionCard, 'id'>[] = [
  {
    kind: 'memory',
    title: '순간 기억',
    prompt: '루미가 방금 띄운 숫자를 고르세요.',
    choices: ['3', '7', '9'],
    answer: '7'
  },
  {
    kind: 'quick_choice',
    title: '빠른 선택',
    prompt: '가장 큰 숫자를 고르세요.',
    choices: ['18', '31', '27'],
    answer: '31'
  },
  {
    kind: 'odd_expression',
    title: '다른 표정 찾기',
    prompt: '하나만 다른 표정을 고르세요.',
    choices: ['🙂', '🙂', '😐', '🙂'],
    answer: '😐'
  }
];

export function participantsInStudyRoom(participants: Participant[]) {
  return participants.filter((participant) => participant.status !== 'online');
}

export function remainingSessionSeconds(session: StudySession, timestamp = Date.now()) {
  const durationMs = session.plannedMinutes * 60_000;
  return Math.max(0, Math.ceil((Date.parse(session.startedAt) + durationMs - timestamp) / 1_000));
}

export function formatSessionTime(totalSeconds: number) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function focusLabelToParticipantStatus(label: FocusLabel): ParticipantStatus {
  if (label === 'focused') return 'focused';
  if (label === 'away') return 'away';
  if (label === 'sleepy' || label === 'paused') return 'paused';
  return 'distracted';
}

export function participantStatusLabel(
  participant: Pick<Participant, 'status'>,
  focusSnapshot?: Partial<FocusSnapshot>
) {
  if (focusSnapshot) {
    const activeSignals = new Set(focusSnapshot.activeSignals ?? []);
    if (focusSnapshot.current?.facePresent === false || activeSignals.has('face_missing')) {
      return '얼굴 없음';
    }
    if (activeSignals.has('eyes_closed') || focusSnapshot.label === 'sleepy') {
      return '눈 감김';
    }
    if (activeSignals.has('head_down')) {
      return '고개 숙임';
    }
    if (activeSignals.has('head_turned')) {
      return '시선 이탈';
    }
    if (activeSignals.has('yawning')) {
      return '하품';
    }
    if (focusSnapshot.label === 'uncertain') {
      return '집중 흔들림';
    }
    if (focusSnapshot.label === 'distracted') {
      return '주의 이탈';
    }
  }

  return statusLabel[participant.status];
}

function tileDotClass(status: ParticipantStatus) {
  if (status === 'away') return 'tile__dot--away';
  if (status === 'distracted') return 'tile__dot--distracted';
  if (status === 'paused') return 'tile__dot--paused';
  return '';
}

export function reconcilePendingCameraState(reported: boolean, requested: boolean) {
  return reported === requested
    ? { cameraOn: reported, pending: undefined }
    : { cameraOn: requested, pending: true };
}

export function setDailyCameraEnabled(
  enabled: boolean,
  callObject: Pick<NonNullable<ReturnType<typeof useDailyRoom>['callObject']>, 'setLocalVideo'>,
  restart: () => void
) {
  if (enabled) {
    restart();
    return;
  }

  callObject.setLocalVideo(false);
}

export function shouldUseLocalCameraFallback(
  videoJoin: VideoJoinInfo | undefined,
  _cameraOn: boolean,
  dailyVideoTrack: MediaStreamTrack | null
) {
  return !videoJoin || !dailyVideoTrack;
}

export function DailyParticipantMedia({
  fallbackInitial,
  fallbackTrack,
  isCameraOn,
  isMe,
  participant
}: {
  fallbackInitial: string;
  isCameraOn: boolean;
  isMe: boolean;
  participant?: DailyParticipantMediaLike;
  fallbackTrack?: MediaStreamTrack;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const track =
    participant?.tracks?.video?.state === 'playable'
      ? participant.tracks.video.track
      : fallbackTrack;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !track || !isCameraOn) return;
    if (typeof MediaStream === 'undefined') return;

    video.srcObject = new MediaStream([track]);
    void video.play().catch(() => {});

    return () => {
      video.srcObject = null;
    };
  }, [track, isCameraOn]);

  if (!track || !isCameraOn) {
    return <span className="tile__avatar">{fallbackInitial}</span>;
  }

  return (
    <video
      ref={videoRef}
      className="tile__video"
      muted={isMe}
      playsInline
      aria-label={isMe ? '내 웹캠 미리보기' : `${fallbackInitial} 웹캠 미리보기`}
    />
  );
}

export function StudyRoom({
  currentParticipantId,
  isHost,
  onEndSession,
  onLeaveRoom,
  onToggleGoalAchieved,
  onUpdatePresence,
  onStartBreak,
  onStartGame,
  onSubmitMissionResult,
  onWinByMissionGuess,
  onSubmitBluffBet,
  onSubmitBluffSignals,
  onAdvanceRelay,
  onReadyNextRound,
  onSendChatMessage,
  participants,
  goals,
  roomiMessages,
  chatMessages,
  focusRanking = [],
  room,
  currentSession,
  currentGame,
  privateMission,
  videoJoin
}: StudyRoomProps) {
  const [timestamp, setTimestamp] = useState(Date.now());
  const [audioOn, setAudioOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [hostMenuOpen, setHostMenuOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [bluffTargetId, setBluffTargetId] = useState('');
  const [relayTargetId, setRelayTargetId] = useState('');
  const [relaySimilarity, setRelaySimilarity] = useState(0.75);
  const [chatDraft, setChatDraft] = useState('');
  const [resultsOpen, setResultsOpen] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [missionState, setMissionState] = useState<KeyedMissionCounterState>({
    missionKey: '',
    count: 0,
    previousActive: false
  });
  const [distractionCard, setDistractionCard] = useState<DistractionCard | null>(null);
  const [distractionSolvedId, setDistractionSolvedId] = useState<string | null>(null);
  const [distractionVisible, setDistractionVisible] = useState(true);
  const [distractionWrong, setDistractionWrong] = useState(false);
  const [distractionCycle, setDistractionCycle] = useState(0);
  const [activeMissionActorId, setActiveMissionActorId] = useState<string | null>(null);
  const [accusationPrompt, setAccusationPrompt] = useState<MissionAccusationPrompt | null>(null);
  const [accusationCooldownUntil, setAccusationCooldownUntil] = useState(0);
  const previousMissionCountsRef = useRef<Map<string, number>>(new Map());
  const reportedMissionRef = useRef<{ missionId: string; count: number; success: boolean } | null>(null);
  const { callObject, localMedia, participantsByRoomiId, restart } =
    useDailyRoom(videoJoin);
  const localDailyParticipant = participantsByRoomiId.get(currentParticipantId);
  const localFallbackVideoTrack = getVideoTracks(localStream)[0] ?? null;
  const dailyVideoTrack =
    localDailyParticipant?.tracks?.video?.state === 'playable'
      ? (localDailyParticipant.tracks.video.track ?? null)
      : null;
  const localVideoTrack = dailyVideoTrack ?? localFallbackVideoTrack;
  const focusDetection = useFocusDetection({
    enabled: cameraOn && typeof MediaStream !== 'undefined',
    track: localVideoTrack ?? null,
    mode: 'rule',
    identity: {
      userId: currentParticipantId,
      sessionId: currentGame?.id ?? currentSession?.id ?? room.id
    },
    settings: ruleSettingsForActivity(room.settings.activityKind)
  });
  const missionKey = currentGame && privateMission ? `${currentGame.round.id}:${privateMission.id}` : '';

  useEffect(() => {
    const interval = window.setInterval(() => setTimestamp(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const needsLocalCameraFallback = shouldUseLocalCameraFallback(
      videoJoin,
      cameraOn,
      dailyVideoTrack
    );
    if (!needsLocalCameraFallback || !navigator.mediaDevices?.getUserMedia) return undefined;

    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        setLocalStream(stream);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      setLocalStream((stream) => {
        stream?.getTracks().forEach((track) => track.stop());
        return null;
      });
    };
  }, [dailyVideoTrack, videoJoin]);

  useEffect(() => {
    const nextStatus = focusLabelToParticipantStatus(focusDetection.focusSnapshot.label);
    if (focusDetection.status === 'running') onUpdatePresence(nextStatus);
  }, [focusDetection.focusSnapshot.label, focusDetection.status, onUpdatePresence]);

  useEffect(() => {
    setMissionState({ missionKey, count: 0, previousActive: false });
    reportedMissionRef.current = null;
  }, [missionKey]);

  useEffect(() => {
    setDistractionCycle(0);
    setDistractionCard(null);
    setDistractionSolvedId(null);
    setDistractionVisible(false);
    setDistractionWrong(false);
    previousMissionCountsRef.current = new Map();
    setActiveMissionActorId(null);
    setAccusationPrompt(null);
    setAccusationCooldownUntil(0);
  }, [currentGame?.round.id]);

  useEffect(() => {
    const shouldShowDistraction =
      currentGame?.kind === 'hidden_mission' &&
      currentGame.status === 'in_round';

    if (!shouldShowDistraction || !currentGame) {
      setDistractionCard(null);
      setDistractionSolvedId(null);
      setDistractionVisible(false);
      setDistractionWrong(false);
      return;
    }

    if (distractionCard && distractionSolvedId !== distractionCard.id) return;

    setDistractionSolvedId(null);
    setDistractionVisible(false);
    setDistractionWrong(false);

    const delayMs =
      distractionCardMinDelayMs +
      Math.floor(Math.random() * (distractionCardMaxDelayMs - distractionCardMinDelayMs + 1));
    const timerId = window.setTimeout(() => {
      const card = createDistractionCard(currentGame.round.id, currentGame.round.index);
      setDistractionCard(card);
      setDistractionSolvedId(null);
      setDistractionVisible(true);
      setDistractionWrong(false);
    }, delayMs);

    return () => window.clearTimeout(timerId);
  }, [
    currentGame?.id,
    currentGame?.kind,
    currentGame?.round.id,
    currentGame?.round.index,
    currentGame?.status,
    distractionCard,
    distractionCycle,
    distractionSolvedId
  ]);

  useEffect(() => {
    if (currentGame?.kind !== 'hidden_mission' || currentGame.status !== 'in_round') {
      previousMissionCountsRef.current = new Map();
      setActiveMissionActorId(null);
      setAccusationPrompt(null);
      return;
    }

    let latestActorId: string | null = null;
    const nextCounts = new Map(previousMissionCountsRef.current);
    for (const result of currentGame.missionResults ?? []) {
      const previousCount = previousMissionCountsRef.current.get(result.playerId) ?? 0;
      if (result.count > previousCount) latestActorId = result.playerId;
      nextCounts.set(result.playerId, result.count);
    }
    previousMissionCountsRef.current = nextCounts;
    if (!latestActorId) return;

    setActiveMissionActorId(latestActorId);
    const timerId = window.setTimeout(() => {
      setActiveMissionActorId((current) => (current === latestActorId ? null : current));
    }, accusationWindowMs);

    return () => window.clearTimeout(timerId);
  }, [currentGame?.kind, currentGame?.missionResults, currentGame?.round.id, currentGame?.status]);

  const distractionLocksMission = Boolean(
    distractionCard &&
      currentGame?.kind === 'hidden_mission' &&
      currentGame.status === 'in_round' &&
      distractionSolvedId !== distractionCard.id
  );

  useEffect(() => {
    if (
      !privateMission ||
      currentGame?.status !== 'in_round' ||
      !focusDetection.expressionSignals ||
      distractionLocksMission
    ) return;

    setMissionState((current) => {
      const currentState =
        current.missionKey === missionKey
          ? current
          : { missionKey, count: 0, previousActive: false };
      const nextState = updateHiddenMissionCounter(
        currentState,
        privateMission.verify,
        privateMission.target,
        focusDetection.expressionSignals!
      );
      return { ...nextState, missionKey };
    });
  }, [currentGame?.status, distractionLocksMission, focusDetection.expressionSignals, missionKey, privateMission]);

  useEffect(() => {
    if (!privateMission || currentGame?.status !== 'in_round' || !onSubmitMissionResult) return;
    if (missionState.missionKey !== missionKey) return;

    const result = missionResultFromCounter({
      playerId: currentParticipantId,
      missionId: privateMission.id,
      verify: privateMission.verify,
      target: privateMission.target,
      state: missionState
    });
    const previousReport = reportedMissionRef.current;
    const alreadyReported =
      previousReport?.missionId === privateMission.id &&
      previousReport.count === result.count &&
      previousReport.success === result.success;
    if (alreadyReported) return;

    if (result.count > 0 || result.success) {
      reportedMissionRef.current = {
        missionId: privateMission.id,
        count: result.count,
        success: result.success
      };
      onSubmitMissionResult(result);
    }
  }, [currentGame?.status, currentParticipantId, missionState, onSubmitMissionResult, privateMission]);

  const displayParticipants = useMemo(() => {
    const activeParticipants = participantsInStudyRoom(participants);

    if (currentGame || room.status === 'studying' || room.status === 'break') {
      return participants;
    }

    return activeParticipants.length > 0 ? activeParticipants : participants;
  }, [currentGame, participants, room.status]);
  const remainingSeconds = currentSession
    ? remainingSessionSeconds(currentSession, timestamp)
    : currentGame?.status === 'between_round' && currentGame.nextRoundStartsAt
      ? Math.max(0, Math.ceil((Date.parse(currentGame.nextRoundStartsAt) - timestamp) / 1_000))
      : currentGame?.round.endsAt
        ? Math.max(0, Math.ceil((Date.parse(currentGame.round.endsAt) - timestamp) / 1_000))
      : room.settings.sessionMinutes * 60;
  const latestMessage = roomiMessages.at(-1);
  const goalByParticipant = new Map(goals.map((goal) => [goal.participantId, goal]));
  const myGoal = goalByParticipant.get(currentParticipantId);
  const otherParticipants = participants.filter((participant) => participant.id !== currentParticipantId);
  const selectableParticipants = otherParticipants.length > 0 ? otherParticipants : participants;
  const activeBluffTargetId =
    bluffTargetId || selectableParticipants[0]?.id || currentParticipantId;
  const activeRelayTargetId =
    relayTargetId || selectableParticipants[0]?.id || currentParticipantId;
  const configuredGameKind = room.settings.defaultGameKind;
  const myBluffBet = currentGame?.bluffBets?.find(
    (bet) => bet.participantId === currentParticipantId
  );
  const isStudyMode = room.settings.activityKind === 'study';
  const goalCardTitle = isStudyMode ? '공부 목표' : '플레이 스타일';
  const emptyGoalText = isStudyMode ? '등록된 목표가 없어요' : '등록된 플레이 스타일이 없어요';
  const ranking = rankGameScores(currentGame, participants);
  const readyParticipantIds = new Set(currentGame?.nextRoundReadyParticipantIds ?? []);
  const isNextRoundWaiting = currentGame?.status === 'between_round';
  const isGameEnded = currentGame?.status === 'reveal';
  const hasMarkedNextReady = readyParticipantIds.has(currentParticipantId);
  const latestRoundWinner = currentGame ? roundWinnerName(currentGame, participants) : undefined;
  const gameTimerLabel = isGameEnded ? '게임 상태' : isNextRoundWaiting ? '다음 라운드' : '현재 라운드';
  const gameTimerValue = currentGame
    ? isGameEnded
      ? '게임 종료'
      : isNextRoundWaiting
      ? `${currentGame.round.index + 1}라운드 시작까지 ${formatSessionTime(remainingSeconds)}`
      : `${currentGame.round.index}/${currentGame.totalRounds ?? 1}라운드`
    : `${room.settings.roundCount ?? 1}라운드 예정`;
  const tileCols = Math.min(2, Math.max(1, Math.ceil(Math.sqrt(displayParticipants.length))));
  const visibleChatMessages = chatMessages.slice(-8);

  const toggleAudio = () => {
    callObject?.setLocalAudio(!audioOn);
    getAudioTracks(localStream).forEach((track) => {
      track.enabled = !audioOn;
    });
    setAudioOn((current) => !current);
  };

  const toggleCamera = () => {
    const next = !cameraOn;
    if (callObject) setDailyCameraEnabled(next, callObject, restart);
    getVideoTracks(localStream).forEach((track) => {
      track.enabled = next;
    });
    setCameraOn(next);
  };

  const answerDistractionCard = (choice: string) => {
    if (!distractionCard) return;
    if (choice === distractionCard.answer) {
      setDistractionSolvedId(distractionCard.id);
      setDistractionCard(null);
      setDistractionVisible(false);
      setDistractionWrong(false);
      setDistractionCycle((current) => current + 1);
      return;
    }

    setDistractionWrong(true);
  };

  const accuseMissionActor = (targetId: string) => {
    if (!currentGame || Date.now() < accusationCooldownUntil) return;
    if (targetId !== activeMissionActorId) return;
    const mission = currentGame.missions?.find((item) => item.playerId === targetId);
    if (!mission) return;
    setAccusationPrompt({
      targetId,
      missionId: mission.id,
      answer: mission.prompt,
      choices: missionGuessChoices(mission, currentGame.missions ?? [])
    });
    setActiveMissionActorId(null);
  };

  const answerMissionAccusation = (choice: string) => {
    if (!accusationPrompt) return;
    if (choice === accusationPrompt.answer) {
      onWinByMissionGuess?.(
        currentParticipantId,
        accusationPrompt.targetId,
        accusationPrompt.missionId
      );
      setAccusationPrompt(null);
      return;
    }

    setAccusationPrompt(null);
    setActiveMissionActorId(null);
    setAccusationCooldownUntil(Date.now() + accusationCooldownMs);
  };

  const submitChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text) return;
    onSendChatMessage?.(text);
    setChatDraft('');
  };

  return (
    <div className="screen screen--app screen--study">
      <div className="study__body">
        <main className="study__stage">
          <section className="study-timer-card">
            <div>
              <span className="study-timer__label">{isStudyMode ? '공부 시간' : gameTimerLabel}</span>
              <strong className={`study-timer__value${!isStudyMode ? ' study-timer__value--game' : ''}`}>
                {isStudyMode ? (
                  formatSessionTime(remainingSeconds)
                ) : (
                  <>
                    {isNextRoundWaiting && latestRoundWinner && currentGame && (
                      <span className="study-timer__round-winner">
                        {currentGame.round.index}라운드 {latestRoundWinner} 우승
                      </span>
                    )}
                    {gameTimerValue}
                  </>
                )}
              </strong>
            </div>
            <div className="study-timer-card__meta">
              <span className="study-timer-card__participants">
                <i /> {displayParticipants.length}/{room.settings.maxParticipants}
              </span>
              <span>
                {isStudyMode
                  ? '공부하기'
                  : currentGame
                    ? gameKindLabel(currentGame.kind)
                    : '게임 시작 전'}
              </span>
              {!isStudyMode && isNextRoundWaiting && (
                <button
                  type="button"
                  className="btn btn--primary btn--compact"
                  disabled={hasMarkedNextReady}
                  onClick={onReadyNextRound}
                >
                  {hasMarkedNextReady ? '준비 완료' : '다음 라운드 준비'}
                </button>
              )}
            </div>
          </section>

          <div className="study__grid-wrap">
            {distractionCard && distractionSolvedId !== distractionCard.id && (
              <button
                type="button"
                className="study-distraction-toggle"
                onClick={() => setDistractionVisible((current) => !current)}
              >
                {distractionVisible ? '화상 타일 보기' : '방해 카드 보기'}
                <span>미션 잠금</span>
              </button>
            )}
            <section className="study__grid" style={{ '--tile-cols': tileCols } as CSSProperties}>
              {displayParticipants.map((participant) => {
                const isMe = participant.id === currentParticipantId;
                const dailyParticipant = participantsByRoomiId.get(participant.id);
                return (
                  <article className={`tile${isMe ? ' tile--me' : ''}`} key={participant.id}>
                    <DailyParticipantMedia
                      fallbackInitial={participant.nickname.slice(0, 1).toUpperCase()}
                      isCameraOn={isMe ? cameraOn : true}
                      isMe={isMe}
                      participant={dailyParticipant as DailyParticipantMediaLike | undefined}
                      fallbackTrack={isMe ? localFallbackVideoTrack ?? undefined : undefined}
                    />
                    <footer className="tile__foot">
                      <span className="tile__name">
                        {participant.nickname}
                        {isMe ? ' (나)' : ''}
                      </span>
                      <span className="tile__status">
                        <i className={`tile__dot ${tileDotClass(participant.status)}`} />
                        {participantStatusLabel(
                          participant,
                          isMe ? focusDetection.focusSnapshot : undefined
                        )}
                      </span>
                    </footer>
                  </article>
                );
              })}
            </section>
            {distractionCard && distractionVisible && distractionSolvedId !== distractionCard.id && (
              <section
                className={`study-distraction${distractionWrong ? ' study-distraction--wrong' : ''}`}
                aria-label="루미 방해 카드"
              >
                <div className="study-distraction__panel">
                  <span className="study-distraction__eyebrow">루미 방해 카드</span>
                  <h2>{distractionCard.title}</h2>
                  <p>{distractionCard.prompt}</p>
                  <div className="study-distraction__choices">
                    {distractionCard.choices.map((choice, index) => (
                      <button
                        type="button"
                        className="btn btn--soft"
                        key={`${choice}-${index}`}
                        onClick={() => answerDistractionCard(choice)}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                  {distractionWrong && (
                    <p className="study-distraction__feedback">다시 골라야 미션 잠금이 풀려요.</p>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setDistractionVisible(false)}
                  >
                    잠깐 숨기기
                  </button>
                </div>
              </section>
            )}
          </div>

        </main>

        <aside className="study__panel">
          <InviteCodeCard inviteCode={room.inviteCode} />

          <section className="study-card study-lumi">
            <div className="study-lumi__head">
              <RoomiMascot size={42} mood={privateMission ? 'wink' : 'curious'} />
              <div>
                <strong>루미 진행자</strong>
                <span>{currentGame ? '라운드 진행 중' : isStudyMode ? '공부 진행 중' : '게임 대기 중'}</span>
              </div>
              <span className="study-lumi__live">실시간</span>
            </div>
            <div className="study-lumi__bubble">
              <span className="study-lumi__label">메시지</span>
              <p className="study-lumi__text">
                {latestMessage?.text ??
                  (privateMission
                    ? '공개 시간 전까지 미션은 비밀로 지켜줘.'
                    : isStudyMode
                      ? '오늘 목표에 맞춰 차분히 집중해보자.'
                      : gameWaitingMessage(configuredGameKind))}
              </p>
            </div>
          </section>

          {currentGame?.kind === 'hidden_mission' && currentGame.status === 'in_round' && (
            <section className="study-card study-accuse" aria-label="미션 수행자 지목">
              <div className="study-card__head">
                <h2 className="study-card__title">지목</h2>
                {timestamp < accusationCooldownUntil && (
                  <span className="study-accuse__cooldown">
                    {Math.ceil((accusationCooldownUntil - timestamp) / 1_000)}초
                  </span>
                )}
              </div>
              <div className="study-accuse__grid">
                {participants.slice(0, 4).map((participant) => {
                  const disabled =
                    timestamp < accusationCooldownUntil ||
                    participant.id !== activeMissionActorId ||
                    Boolean(accusationPrompt);
                  return (
                    <button
                      type="button"
                      className="study-accuse__button"
                      disabled={disabled}
                      key={participant.id}
                      onClick={() => accuseMissionActor(participant.id)}
                    >
                      {participant.nickname}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="study-card study-chat" aria-label="채팅">
            <h2 className="study-card__title">채팅</h2>
            <div className="study-chat__messages">
              {visibleChatMessages.map((message) => (
                <div
                  className={`study-chat__message${
                    message.participantId === currentParticipantId ? ' study-chat__message--me' : ''
                  }`}
                  key={message.id}
                >
                  <span>{message.nickname}</span>
                  <p>{message.text}</p>
                </div>
              ))}
              {visibleChatMessages.length === 0 && (
                <p className="study-focus__meta">아직 채팅이 없어요.</p>
              )}
            </div>
            <form className="study-chat__form" onSubmit={submitChat}>
              <input
                aria-label="채팅 입력"
                value={chatDraft}
                maxLength={300}
                onChange={(event) => setChatDraft(event.currentTarget.value)}
                placeholder="대화 이어가기"
              />
              <button
                type="submit"
                className="btn btn--primary btn--icon"
                aria-label="채팅 보내기"
                disabled={!chatDraft.trim()}
              >
                <Send size={16} />
              </button>
            </form>
          </section>

          {isStudyMode ? (
            <>
              <section className="study-card">
                <h2 className="study-card__title">{goalCardTitle}</h2>
                {participants.map((participant) => {
                  const goal = goalByParticipant.get(participant.id);
                  const isMe = participant.id === currentParticipantId;
                  return (
                    <div className="goal goal--stacked" key={participant.id}>
                      <span className="goal__who">{participant.nickname}</span>
                      <p className="goal__text">
                        <strong className="goal__owner">
                          {participant.nickname}
                        </strong>
                        <span className="goal__note">{goal?.rawText ?? emptyGoalText}</span>
                      </p>
                      {isMe && (
                        <label className="goal__achieved">
                          <input
                            type="checkbox"
                            checked={Boolean(myGoal?.achieved)}
                            onChange={(event) => onToggleGoalAchieved(event.currentTarget.checked)}
                          />
                          <Flag size={14} />
                          달성
                        </label>
                      )}
                    </div>
                  );
                })}
              </section>

              {focusRanking.length > 0 && (
                <section className="study-card" aria-label="실시간 집중 순위">
                  <h2 className="study-card__title">실시간 집중 순위</h2>
                  <ol className="retro-ranking">
                    {focusRanking.map((entry, index) => {
                      const isSelf = entry.participantId === currentParticipantId;
                      return (
                        <li
                          className={`retro-ranking__row${
                            isSelf ? ' retro-ranking__row--self' : ''
                          }`}
                          key={entry.participantId}
                        >
                          <span className="retro-ranking__rank">{index + 1}</span>
                          <span className="retro-ranking__who">
                            {entry.nickname}
                            {isSelf && ' (나)'}
                            {entry.left && ' (나감)'}
                          </span>
                          <span className="retro-ranking__minutes">{entry.focusMinutes}분</span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}
            </>
          ) : (
            <section className="study-card">
              <div className="study-card__head">
                <h2 className="study-card__title">현재 순위</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setResultsOpen(true)}
                >
                  자세히 보기
                </button>
              </div>
              {ranking.map((entry) => (
                <div className="goal game-rank-row" key={entry.participant.id}>
                  <span className="goal__who">{entry.rank}위</span>
                  <p className="goal__text">
                    <strong className="goal__owner">{entry.participant.nickname}</strong>
                    {isNextRoundWaiting && (
                      <span className="goal__note game-rank-row__status">
                        {readyParticipantIds.has(entry.participant.id) ? '다음 라운드 준비 완료' : '준비 대기 중'}
                      </span>
                    )}
                  </p>
                  <strong>{entry.points}</strong>
                </div>
              ))}
              {!currentGame && <p className="study-focus__meta">게임이 시작되면 순위가 표시돼요.</p>}
            </section>
          )}

          {!isStudyMode && (
            <section className="study-card">
              <h2 className="study-card__title">게임 조작</h2>
              {!currentGame && isHost && (
                <>
                  <div className="goal">
                    <span className="goal__who">
                      <Play size={16} />
                    </span>
                    <p className="goal__text">
                      {gameKindLabel(configuredGameKind)}
                      <br />
                      <span className="study-focus__meta">방을 만들 때 정한 게임이에요.</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn--primary btn--block"
                    onClick={() => onStartGame?.(configuredGameKind)}
                  >
                    <Play size={16} /> {gameKindLabel(configuredGameKind)} 시작
                  </button>
                </>
              )}
              {!currentGame && !isHost && (
                <p className="study-focus__meta">방장이 게임을 시작하기를 기다리는 중이에요.</p>
              )}
              {currentGame?.kind === 'hidden_mission' && currentGame.status === 'in_round' && (
                privateMission ? (
                  <div className="goal">
                    <span className="goal__who">
                      <EyeOff size={16} />
                    </span>
                    <p className="goal__text">
                      {privateMission.prompt}
                      <br />
                      진행: {missionState.count}/{privateMission.target}
                      {distractionLocksMission && (
                        <>
                          <br />
                          <span className="study-focus__meta">방해 카드를 풀어야 미션이 다시 진행돼요.</span>
                        </>
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="study-focus__meta">개인 미션을 기다리는 중이에요.</p>
                )
              )}
              {currentGame?.kind === 'poker_bluff' && (
                <>
                  <div className="goal">
                    <span className="goal__who">판정</span>
                    <select
                      className="goal__text"
                      aria-label="블러프 대상"
                      value={activeBluffTargetId}
                      onChange={(event) => setBluffTargetId(event.currentTarget.value)}
                    >
                      {selectableParticipants.map((participant) => (
                        <option value={participant.id} key={participant.id}>
                          {participant.nickname}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="session-end-modal__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => onSubmitBluffBet?.(activeBluffTargetId, false)}
                    >
                      버틸 것 같아요
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => onSubmitBluffBet?.(activeBluffTargetId, true)}
                    >
                      흔들릴 것 같아요
                    </button>
                  </div>
                  {myBluffBet && (
                    <p className="study-focus__meta">
                      내 판정: {participantName(participants, myBluffBet.targetId)} 님이{' '}
                      {myBluffBet.predictsCrack ? '흔들릴 것 같아요' : '버틸 것 같아요'}
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn btn--primary btn--block"
                    onClick={() =>
                      onSubmitBluffSignals?.(
                        focusDetection.expressionSignals ?? emptyExpressionSignals()
                      )
                    }
                  >
                    표정 판정 보내기
                  </button>
                  {currentGame.bluffResult && (
                    <p className="study-focus__meta">
                      결과: {participantName(participants, currentGame.bluffResult.targetId)} 님이{' '}
                      {currentGame.bluffResult.cracked
                        ? `${tellLabel(currentGame.bluffResult.tell)} 신호에서 흔들렸어요`
                        : '끝까지 버텼어요'}
                    </p>
                  )}
                </>
              )}
              {currentGame?.kind === 'copycat_relay' && (
                <>
                  <div className="goal">
                    <span className="goal__who">대상</span>
                    <select
                      className="goal__text"
                      aria-label="릴레이 대상"
                      value={activeRelayTargetId}
                      onChange={(event) => setRelayTargetId(event.currentTarget.value)}
                    >
                      {selectableParticipants.map((participant) => (
                        <option value={participant.id} key={participant.id}>
                          {participant.nickname}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="goal__achieved">
                    유사도 {Math.round(relaySimilarity * 100)}%
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(relaySimilarity * 100)}
                      onChange={(event) => setRelaySimilarity(Number(event.currentTarget.value) / 100)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn--primary btn--block"
                    onClick={() => onAdvanceRelay?.(activeRelayTargetId, relaySimilarity)}
                  >
                    릴레이 넘기기
                  </button>
                  {(currentGame.relayLinks ?? []).map((link, index) => (
                    <p className="study-focus__meta" key={`${link.fromId}-${link.toId}-${index}`}>
                      {participantName(participants, link.fromId)} →{' '}
                      {participantName(participants, link.toId)} - {Math.round(link.similarity * 100)}%
                    </p>
                  ))}
                </>
              )}
            </section>
          )}

        </aside>
      </div>

      <div className="study__controls" aria-label="통화 조작">
        <button
          type="button"
          className={`ctrl${audioOn && localMedia.audio ? ' ctrl--active' : ' ctrl--muted'}`}
          onClick={toggleAudio}
          aria-label={audioOn ? '마이크 끄기' : '마이크 켜기'}
        >
          {audioOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <button
          type="button"
          className={`ctrl${cameraOn ? ' ctrl--active' : ' ctrl--muted'}`}
          onClick={toggleCamera}
          aria-label={cameraOn ? '카메라 끄기' : '카메라 켜기'}
        >
          {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
        {isStudyMode && (
          <button type="button" className="ctrl" onClick={() => void onStartBreak()} aria-label="휴식 시작">
            <Coffee size={20} />
          </button>
        )}
        {isHost && (
          <div className="host-actions">
            <button
              type="button"
              className="ctrl"
              aria-label="방장 메뉴"
              onClick={() => setHostMenuOpen((current) => !current)}
            >
              <MoreHorizontal size={20} />
            </button>
            {hostMenuOpen && (
              <div className="host-menu" role="menu">
                <button
                  type="button"
                  className="host-menu__item host-menu__item--danger"
                  role="menuitem"
                  onClick={() => setConfirmEnd(true)}
                >
                  세션 종료
                </button>
              </div>
            )}
          </div>
        )}
        <button type="button" className="ctrl ctrl--leave" onClick={onLeaveRoom} aria-label="나가기">
          <LogOut size={20} />
        </button>
      </div>

      {confirmEnd && (
        <div className="session-end-modal" role="dialog" aria-label="세션 종료 확인">
          <div className="session-end-modal__panel">
            <h2 className="session-end-modal__title">
              {currentGame ? '라운드를 종료할까요?' : '공부를 종료할까요?'}
            </h2>
            <p className="session-end-modal__text">
              {currentGame
                ? '루미가 현재 게임 결과를 공개하고 회고 화면으로 이동해요.'
                : '루미가 현재 공부 세션을 마무리하고 회고 화면으로 이동해요.'}
            </p>
            <div className="session-end-modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmEnd(false)}>
                취소
              </button>
              <button type="button" className="btn btn--danger" onClick={onEndSession}>
                세션 종료
              </button>
            </div>
          </div>
        </div>
      )}
      {accusationPrompt && (
        <div className="session-end-modal" role="dialog" aria-label="미션 맞추기">
          <div className="session-end-modal__panel mission-guess-modal">
            <h2 className="session-end-modal__title">
              {participantName(participants, accusationPrompt.targetId)}의 미션은?
            </h2>
            <div className="mission-guess-modal__choices">
              {accusationPrompt.choices.map((choice) => (
                <button
                  type="button"
                  className="btn btn--soft"
                  key={choice}
                  onClick={() => answerMissionAccusation(choice)}
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {resultsOpen && (
        <div className="session-end-modal" role="dialog" aria-label="게임 결과 상세">
          <div className="session-end-modal__panel game-results-modal">
            <h2 className="session-end-modal__title">게임 결과 상세</h2>
            <section className="game-results__section">
              <h3>종합 순위</h3>
              {ranking.map((entry) => (
                <div className="game-results__row" key={entry.participant.id}>
                  <span>{entry.rank}위</span>
                  <strong>{entry.participant.nickname}</strong>
                  <b>{entry.points}점</b>
                </div>
              ))}
              {ranking.length === 0 && <p className="study-focus__meta">아직 점수가 없어요.</p>}
            </section>
            {isNextRoundWaiting && (
              <section className="game-results__section">
                <h3>다음 라운드 준비</h3>
                {participants.map((participant) => (
                  <div className="game-results__row" key={participant.id}>
                    <strong>{participant.nickname}</strong>
                    <span>{readyParticipantIds.has(participant.id) ? '준비 완료' : '대기 중'}</span>
                  </div>
                ))}
              </section>
            )}
            <section className="game-results__section">
              <h3>라운드별 결과</h3>
              {(currentGame?.completedRounds ?? []).map((round) => (
                <div className="game-results__round" key={round.roundIndex}>
                  <strong>{round.roundIndex}라운드</strong>
                  {rankScores(round.scores, participants).map((entry) => (
                    <div className="game-results__row" key={entry.participant.id}>
                      <span>{entry.rank}위</span>
                      <span>{entry.participant.nickname}</span>
                      <b>{entry.points}점</b>
                    </div>
                  ))}
                </div>
              ))}
              {(currentGame?.completedRounds ?? []).length === 0 && (
                <p className="study-focus__meta">완료된 라운드가 아직 없어요.</p>
              )}
            </section>
            <section className="game-results__section">
              <h3>오늘의 플레이 스타일</h3>
              {participants.map((participant) => {
                const goal = goalByParticipant.get(participant.id);
                return (
                  <div className="game-results__row" key={participant.id}>
                    <strong>{participant.nickname}</strong>
                    <span>{goal?.rawText ?? emptyGoalText}</span>
                  </div>
                );
              })}
            </section>
            <div className="session-end-modal__actions">
              <button type="button" className="btn btn--primary" onClick={() => setResultsOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function rankGameScores(game: GameSession | undefined, participants: Participant[]) {
  return rankScores(game?.scores ?? [], participants);
}

function roundWinnerName(game: GameSession, participants: Participant[]) {
  const completedRounds = game.completedRounds ?? [];
  const latestRound = completedRounds.at(-1);
  if (!latestRound) return undefined;

  const previousRound = completedRounds.at(-2);
  const previousScores = new Map(
    previousRound?.scores.map((score) => [score.participantId, score.points]) ?? []
  );
  const roundScores = latestRound.scores.map((score) => ({
    participantId: score.participantId,
    points: score.points - (previousScores.get(score.participantId) ?? 0)
  }));
  const winner = rankScores(roundScores, participants)[0];
  return winner && winner.points > 0 ? winner.participant.nickname : undefined;
}

function rankScores(scores: GameSession['scores'], participants: Participant[]) {
  const participantOrder = new Map(participants.map((participant, index) => [participant.id, index]));
  return scores
    .map((score) => {
      const participant = participants.find((item) => item.id === score.participantId);
      return participant ? { participant, points: score.points } : undefined;
    })
    .filter((entry): entry is { participant: Participant; points: number } => Boolean(entry))
    .sort(
      (left, right) =>
        right.points - left.points ||
        (participantOrder.get(left.participant.id) ?? 0) -
          (participantOrder.get(right.participant.id) ?? 0)
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function gameKindLabel(kind: GameSession['kind']) {
  if (kind === 'hidden_mission') return '숨은 표정 미션';
  if (kind === 'poker_bluff') return '포커페이스 블러프';
  return '카피캣 릴레이';
}

function gameWaitingMessage(kind: GameKind) {
  if (kind === 'hidden_mission') {
    return '숨은 표정 미션을 시작하면 각자 비밀 미션을 받고 표정 카운트가 열려.';
  }
  if (kind === 'poker_bluff') {
    return '포커페이스 블러프를 시작하면 누가 흔들릴지 예측하고 보이는 신호로 판정해.';
  }
  return '카피캣 릴레이를 시작하면 표정과 제스처를 이어받아 얼마나 비슷한지 겨뤄.';
}

function tellLabel(tell: 'smile' | 'jaw' | 'brow' | null) {
  if (tell === 'smile') return '미소';
  if (tell === 'jaw') return '입 벌림';
  if (tell === 'brow') return '눈썹';
  return '보이는 표정';
}

function participantName(participants: Participant[], participantId: string) {
  return participants.find((participant) => participant.id === participantId)?.nickname ?? '참가자';
}

function emptyExpressionSignals(): ExpressionSignals {
  return {
    timestamp: Date.now(),
    smile: 0,
    jawOpen: 0,
    winkLeft: false,
    winkRight: false,
    browRaise: 0,
    cheekPuff: 0,
    mouthPucker: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0
  };
}

function createDistractionCard(roundId: string, roundIndex: number): DistractionCard {
  const template = distractionCards[(Math.max(1, roundIndex) - 1) % distractionCards.length]!;
  return {
    id: `${roundId}:${template.kind}:${Date.now()}`,
    ...template
  };
}

function missionGuessChoices(answer: HiddenMission, missions: HiddenMission[]) {
  const fallbackPrompts = [
    '상대가 볼 때마다 자연스럽게 미소 짓기',
    '대화 중 한 번 윙크하기',
    '고개를 끄덕이며 동의하는 척하기',
    '눈썹을 올리며 놀란 표정 짓기',
    '입을 살짝 벌리고 생각하는 척하기'
  ];
  const prompts = [
    answer.prompt,
    ...missions
      .filter((mission) => mission.id !== answer.id)
      .map((mission) => mission.prompt),
    ...fallbackPrompts
  ];
  const uniquePrompts = Array.from(new Set(prompts)).slice(0, 4);
  return uniquePrompts.sort((left, right) => left.localeCompare(right));
}

function getAudioTracks(stream: MediaStream | null): MediaStreamTrack[] {
  if (!stream) return [];
  if (typeof stream.getAudioTracks === 'function') return stream.getAudioTracks();
  return typeof stream.getTracks === 'function' ? stream.getTracks() : [];
}

function getVideoTracks(stream: MediaStream | null): MediaStreamTrack[] {
  if (!stream) return [];
  if (typeof stream.getVideoTracks === 'function') return stream.getVideoTracks();
  return typeof stream.getTracks === 'function' ? stream.getTracks() : [];
}
