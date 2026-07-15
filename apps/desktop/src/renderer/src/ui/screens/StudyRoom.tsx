import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  Video,
  VideoOff
} from 'lucide-react';
import {
  type ExpressionSignals,
  type GameKind,
  type GameSession,
  type Goal,
  type HiddenMission,
  type MissionResult,
  type Participant,
  type ParticipantStatus,
  type Room,
  type RoomiMessage,
  type StudySession,
  type VideoJoinInfo
} from '@roomi/shared';
import { InviteCodeCard } from '../components/InviteCodeCard';
import { RoomiMascot } from '../components/RoomiMascot';
import type { ScreenProps } from './types';
import { useDailyRoom } from '../../use-daily-room';
import { type FocusLabel } from '../../focus-pipeline';
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
  onSubmitBluffBet?: (targetId: string, predictsCrack: boolean) => void;
  onSubmitBluffSignals?: (signals: ExpressionSignals) => void;
  onAdvanceRelay?: (toId: string, similarity: number) => void;
  participants: Participant[];
  goals: Goal[];
  roomiMessages: RoomiMessage[];
  room: Room;
  currentSession?: StudySession;
  currentGame?: GameSession;
  privateMission?: HiddenMission;
  videoJoin?: VideoJoinInfo;
}

const statusLabel: Record<ParticipantStatus, string> = {
  online: 'Lobby',
  focused: 'Playing',
  distracted: 'Reacting',
  away: 'Away',
  break: 'Break',
  paused: 'Paused'
};

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
  onSubmitBluffBet,
  onSubmitBluffSignals,
  onAdvanceRelay,
  participants,
  goals,
  roomiMessages,
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
  const [selectedGameKind, setSelectedGameKind] = useState<GameKind>('hidden_mission');
  const [bluffTargetId, setBluffTargetId] = useState('');
  const [relayTargetId, setRelayTargetId] = useState('');
  const [relaySimilarity, setRelaySimilarity] = useState(0.75);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [missionState, setMissionState] = useState<MissionCounterState>({
    count: 0,
    previousActive: false
  });
  const reportedMissionRef = useRef<string | null>(null);
  const { callObject, localMedia, participantsByRoomiId, status, restart } =
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
    }
  });

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
    if (!privateMission || !focusDetection.expressionSignals) return;

    setMissionState((current) =>
      updateHiddenMissionCounter(
        current,
        privateMission.verify,
        privateMission.target,
        focusDetection.expressionSignals!
      )
    );
  }, [focusDetection.expressionSignals, privateMission]);

  useEffect(() => {
    if (!privateMission || !onSubmitMissionResult) return;
    if (reportedMissionRef.current === privateMission.id) return;

    const result = missionResultFromCounter({
      playerId: currentParticipantId,
      missionId: privateMission.id,
      verify: privateMission.verify,
      target: privateMission.target,
      state: missionState
    });

    if (result.success || privateMission.verify === 'no_jaw_open') {
      reportedMissionRef.current = privateMission.id;
      onSubmitMissionResult(result);
    }
  }, [currentParticipantId, missionState, onSubmitMissionResult, privateMission]);

  const displayParticipants = useMemo(() => {
    const activeParticipants = participantsInStudyRoom(participants);

    if (currentGame || room.status === 'studying' || room.status === 'break') {
      return participants;
    }

    return activeParticipants.length > 0 ? activeParticipants : participants;
  }, [currentGame, participants, room.status]);
  const remainingSeconds = currentSession
    ? remainingSessionSeconds(currentSession, timestamp)
    : currentGame?.round.endsAt
      ? Math.max(0, Math.ceil((Date.parse(currentGame.round.endsAt) - timestamp) / 1_000))
      : room.settings.sessionMinutes * 60;
  const latestMessage = roomiMessages.at(-1);
  const goalByParticipant = new Map(goals.map((goal) => [goal.participantId, goal]));
  const myGoal = goalByParticipant.get(currentParticipantId);
  const myScore = currentGame?.scores.find((score) => score.participantId === currentParticipantId);
  const otherParticipants = participants.filter((participant) => participant.id !== currentParticipantId);
  const selectableParticipants = otherParticipants.length > 0 ? otherParticipants : participants;
  const activeBluffTargetId =
    bluffTargetId || selectableParticipants[0]?.id || currentParticipantId;
  const activeRelayTargetId =
    relayTargetId || selectableParticipants[0]?.id || currentParticipantId;
  const myBluffBet = currentGame?.bluffBets?.find(
    (bet) => bet.participantId === currentParticipantId
  );
  const tileCols = Math.min(2, Math.max(1, Math.ceil(Math.sqrt(displayParticipants.length))));

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

  return (
    <div className="screen screen--app">
      <div className="study__body">
        <main className="study__stage">
          <section className="study-timer-card">
            <div>
              <span className="study-timer__label">Face party round</span>
              <strong className="study-timer__value">{formatSessionTime(remainingSeconds)}</strong>
            </div>
            <div className="study-timer-card__meta">
              <span className="study-timer-card__participants">
                <i /> {displayParticipants.length}/{room.settings.maxParticipants}
              </span>
              <span>{currentGame ? gameKindLabel(currentGame.kind) : 'No game running'}</span>
            </div>
          </section>

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
                      <i
                        className={`tile__dot${participant.status === 'away' ? ' tile__dot--away' : ''}`}
                      />
                      {statusLabel[participant.status]}
                    </span>
                  </footer>
                </article>
              );
            })}
          </section>

          <div className={`study__call-status${status === 'error' ? ' study__call-status--error' : ''}`}>
            {videoJoin ? `Daily: ${status}` : 'Local demo mode. Video joins after the API is available.'}
          </div>
        </main>

        <aside className="study__panel">
          <InviteCodeCard inviteCode={room.inviteCode} />

          <section className="study-card study-lumi">
            <div className="study-lumi__head">
              <RoomiMascot size={42} mood={privateMission ? 'wink' : 'curious'} />
              <div>
                <strong>Roomi host</strong>
                <span>{currentGame ? 'Round live' : 'Waiting for game'}</span>
              </div>
              <span className="study-lumi__live">LIVE</span>
            </div>
            <div className="study-lumi__bubble">
              <span className="study-lumi__label">Prompt</span>
              <p className="study-lumi__text">
                {latestMessage?.text ??
                  (privateMission
                    ? 'Keep your mission secret until the reveal.'
                    : 'Start a hidden mission round and watch the faces.')}
              </p>
            </div>
          </section>

          <section className="study-card">
            <h2 className="study-card__title">Game controls</h2>
            {!currentGame && isHost && (
              <>
                <div className="goal">
                  <span className="goal__who">
                    <Play size={16} />
                  </span>
                  <select
                    className="goal__text"
                    aria-label="Game mode"
                    value={selectedGameKind}
                    onChange={(event) => setSelectedGameKind(event.currentTarget.value as GameKind)}
                  >
                    <option value="hidden_mission">Hidden mission</option>
                    <option value="poker_bluff">Poker-face bluff</option>
                    <option value="copycat_relay">Copycat relay</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={() => onStartGame?.(selectedGameKind)}
                >
                  <Play size={16} /> Start {gameKindLabel(selectedGameKind)}
                </button>
              </>
            )}
            {!currentGame && !isHost && (
              <p className="study-focus__meta">Waiting for the host.</p>
            )}
            {currentGame?.kind === 'hidden_mission' && (
              privateMission ? (
                <div className="goal">
                  <span className="goal__who">
                    <EyeOff size={16} />
                  </span>
                  <p className="goal__text">
                    {privateMission.prompt}
                    <br />
                    Count: {missionState.count}/{privateMission.target}
                  </p>
                </div>
              ) : (
                <p className="study-focus__meta">Waiting for a private mission.</p>
              )
            )}
            {currentGame?.kind === 'poker_bluff' && (
              <>
                <div className="goal">
                  <span className="goal__who">Bet</span>
                  <select
                    className="goal__text"
                    aria-label="Bluff target"
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
                    Will hold
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => onSubmitBluffBet?.(activeBluffTargetId, true)}
                  >
                    Will crack
                  </button>
                </div>
                {myBluffBet && (
                  <p className="study-focus__meta">
                    Your bet: {participantName(participants, myBluffBet.targetId)}{' '}
                    {myBluffBet.predictsCrack ? 'cracks' : 'holds'}
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
                  Submit tell check
                </button>
                {currentGame.bluffResult && (
                  <p className="study-focus__meta">
                    Result: {participantName(participants, currentGame.bluffResult.targetId)}{' '}
                    {currentGame.bluffResult.cracked ? `cracked on ${currentGame.bluffResult.tell}` : 'held'}
                  </p>
                )}
              </>
            )}
            {currentGame?.kind === 'copycat_relay' && (
              <>
                <div className="goal">
                  <span className="goal__who">To</span>
                  <select
                    className="goal__text"
                    aria-label="Relay target"
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
                  Similarity {Math.round(relaySimilarity * 100)}%
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
                  Advance relay
                </button>
                {(currentGame.relayLinks ?? []).map((link, index) => (
                  <p className="study-focus__meta" key={`${link.fromId}-${link.toId}-${index}`}>
                    {participantName(participants, link.fromId)} to{' '}
                    {participantName(participants, link.toId)} - {Math.round(link.similarity * 100)}%
                  </p>
                ))}
              </>
            )}
          </section>

          <section className="study-card">
            <h2 className="study-card__title">Scoreboard</h2>
            {(currentGame?.scores ?? []).map((score) => {
              const participant = participants.find((item) => item.id === score.participantId);
              return (
                <div className="goal" key={score.participantId}>
                  <span className="goal__who">{participant?.nickname.slice(0, 2) ?? '??'}</span>
                  <p className="goal__text">{participant?.nickname ?? 'Player'}</p>
                  <strong>{score.points}</strong>
                </div>
              );
            })}
            {!currentGame && <p className="study-focus__meta">Scores appear after the round starts.</p>}
            {myScore && <p className="study-focus__meta">Your score: {myScore.points}</p>}
          </section>

          <section className="study-card">
            <h2 className="study-card__title">Personal goal</h2>
            <label className="goal__achieved">
              <input
                type="checkbox"
                checked={Boolean(myGoal?.achieved)}
                onChange={(event) => onToggleGoalAchieved(event.currentTarget.checked)}
              />
              <Flag size={14} />
              {myGoal?.rawText ?? 'No goal submitted'}
            </label>
          </section>
        </aside>
      </div>

      <div className="study__controls" aria-label="Call controls">
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
        <button type="button" className="ctrl" onClick={() => void onStartBreak()} aria-label="Break">
          <Coffee size={20} />
        </button>
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
            <h2 className="session-end-modal__title">End this round?</h2>
            <p className="session-end-modal__text">
              Roomi will reveal the current game state and move everyone to the recap.
            </p>
            <div className="session-end-modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmEnd(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn--danger" onClick={onEndSession}>
                세션 종료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function gameKindLabel(kind: GameSession['kind']) {
  if (kind === 'hidden_mission') return 'Hidden mission';
  if (kind === 'poker_bluff') return 'Poker-face bluff';
  return 'Copycat relay';
}

function participantName(participants: Participant[], participantId: string) {
  return participants.find((participant) => participant.id === participantId)?.nickname ?? 'Player';
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
