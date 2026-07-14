import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Coffee,
  LogOut,
  Mic,
  MicOff,
  MoreHorizontal,
  Video,
  VideoOff
} from 'lucide-react';
import { RoomiMascot, type RoomiMood } from '../components/RoomiMascot';
import { InviteCodeCard } from '../components/InviteCodeCard';
import {
  type Goal,
  type Participant,
  type Room,
  type RoomiMessage,
  type StudySession,
  type VideoJoinInfo
} from '@roomi/shared';
import type { ScreenProps } from './types';
import { useDailyRoom } from '../../use-daily-room';

/**
 * Study Room · Live Session (Figma 47:2).
 * NOTE: No screenshot was available (Figma read quota exhausted). Layout is
 * inferred from the AGENTS.md IA (video grid, timer, goals, Lumi panel,
 * personal confirm message, controls). Verify against Figma.
 */
interface StudyRoomProps extends ScreenProps {
  currentParticipantId: string;
  isHost: boolean;
  onEndSession: () => void;
  onLeaveRoom: () => void;
  onToggleGoalAchieved: (achieved: boolean) => void;
  participants: Participant[];
  goals: Goal[];
  roomiMessages: RoomiMessage[];
  room: Room;
  currentSession?: StudySession;
  videoJoin?: VideoJoinInfo;
}

const statusLabel: Record<Participant['status'], string> = {
  online: '집중중',
  focused: '집중중',
  distracted: '주의 필요',
  away: '자리비움',
  break: '휴식중',
  paused: '감지 정지'
};

function participantInitial(nickname: string) {
  return nickname.trim().slice(0, 1) || '?';
}

function roomiMessageLabel(message: RoomiMessage | undefined) {
  if (!message) return '집중 안내';

  switch (message.kind) {
    case 'start':
      return '세션 시작';
    case 'focus_recovery':
      return '개인 집중 알림';
    case 'break_return':
      return '복귀 안내';
    case 'summary':
      return '세션 안내';
    default:
      return '루미의 제안';
  }
}

/** LIVE 안내 패널에서 루미가 지을 표정. 최근 메시지 종류에 따라 감정을 바꾼다. */
function moodForRoomiMessage(message: RoomiMessage | undefined): RoomiMood {
  switch (message?.kind) {
    case 'break_return':
      return 'wink'; // 휴식 잘 다녀왔지? 반갑게 윙크
    case 'focus_recovery':
      return 'angry'; // 확인을 마친 뒤: "자, 다시 불붙여보자!"
    case 'goal_refine':
      return 'curious'; // 목표를 함께 들여다보는 중
    case 'start':
    case 'summary':
    default:
      return 'smile';
  }
}

export function remainingSessionSeconds(session: StudySession, timestamp = Date.now()) {
  const endsAt = Date.parse(session.startedAt) + session.plannedMinutes * 60_000;
  return Math.max(0, Math.ceil((endsAt - timestamp) / 1_000));
}

export function formatSessionTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function participantsInStudyRoom(participants: Participant[]) {
  return participants.filter((participant) => participant.status !== 'online');
}

export function reconcilePendingCameraState(
  reported: boolean,
  pending: boolean | undefined
): { cameraOn: boolean; pending: boolean | undefined } {
  return pending !== undefined && pending !== reported
    ? { cameraOn: pending, pending }
    : { cameraOn: reported, pending: undefined };
}

export function setDailyCameraEnabled(
  enabled: boolean,
  call: { setLocalVideo: (enabled: boolean) => unknown },
  restart: () => void
) {
  if (enabled) {
    restart();
    return;
  }

  call.setLocalVideo(false);
}

export function StudyRoom({
  currentParticipantId,
  isHost,
  onEndSession,
  onLeaveRoom,
  onToggleGoalAchieved,
  participants,
  goals,
  roomiMessages,
  room,
  currentSession,
  videoJoin,
  go
}: StudyRoomProps) {
  const studyParticipants = participantsInStudyRoom(participants);
  const gridColumns = Math.max(1, Math.ceil(Math.sqrt(studyParticipants.length || 1)));
  const gridStyle = { '--tile-cols': gridColumns } as CSSProperties;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCameraStateRef = useRef<boolean | undefined>(undefined);
  const {
    callObject,
    localMedia,
    participantsByRoomiId,
    status: dailyStatus,
    restart: restartDailyRoom
  } = useDailyRoom(videoJoin);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isHostMenuOpen, setIsHostMenuOpen] = useState(false);
  const [isEndConfirmOpen, setIsEndConfirmOpen] = useState(false);
  const [dismissedFocusMessageId, setDismissedFocusMessageId] = useState<string>();
  const [timestamp, setTimestamp] = useState(() => Date.now());
  const currentParticipant =
    studyParticipants.find((participant) => participant.id === currentParticipantId) ??
    studyParticipants[0];
  const plannedSeconds = (currentSession?.plannedMinutes ?? room.settings.sessionMinutes) * 60;
  const remainingSeconds = currentSession
    ? remainingSessionSeconds(currentSession, timestamp)
    : plannedSeconds;
  // The server already sends personal messages only to their recipient. Keep the
  // same rule in the view as a defensive guard for local/demo room state.
  const latestRoomiMessage = [...roomiMessages]
    .reverse()
    .find(
      (message) =>
        !message.targetParticipantId || message.targetParticipantId === currentParticipantId
    );
  const focusRecoveryMessage = [...roomiMessages]
    .reverse()
    .find(
      (message) =>
        message.kind === 'focus_recovery' &&
        message.targetParticipantId === currentParticipantId &&
        message.id !== dismissedFocusMessageId
    );
  // 집중 흐트러짐을 확인하는 동안엔 걱정스러운 표정, 그 외엔 메시지 종류에 맞춘 표정.
  const panelMood: RoomiMood = focusRecoveryMessage
    ? 'sad'
    : moodForRoomiMessage(latestRoomiMessage);

  useEffect(() => {
    const interval = window.setInterval(() => setTimestamp(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!callObject) {
      return;
    }

    setIsMicOn(localMedia.audio);
    const cameraState = reconcilePendingCameraState(
      localMedia.video,
      pendingCameraStateRef.current
    );
    pendingCameraStateRef.current = cameraState.pending;
    setIsCameraOn(cameraState.cameraOn);
  }, [callObject, localMedia.audio, localMedia.video]);

  useEffect(() => {
    if (videoJoin) {
      return undefined;
    }

    let cancelled = false;

    async function connectLocalMedia() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    }

    void connectLocalMedia();

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, [videoJoin]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isCameraOn]);

  const toggleAudio = () => {
    const next = !isMicOn;
    if (callObject) {
      callObject.setLocalAudio(next);
    } else {
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
    }
    setIsMicOn(next);
  };

  const toggleVideo = () => {
    const next = !isCameraOn;
    if (callObject) {
      pendingCameraStateRef.current = next;
      setDailyCameraEnabled(next, callObject, restartDailyRoom);
    } else {
      localStreamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });
    }
    setIsCameraOn(next);
  };

  return (
    <div className="screen screen--app">
      <div className="study__body">
        <section className="study__stage">
          <section className="study-timer-card" aria-label="집중 세션 타이머">
            <div>
              <div className="study-timer__label">
                집중 1라운드 · {room.settings.sessionMinutes}분 세션
              </div>
              <time className="study-timer__value" aria-label="남은 집중 시간">
                {formatSessionTime(remainingSeconds)}
              </time>
            </div>
            <div className="study-timer-card__meta">
              <span>남은 시간</span>
              <span className="study-timer-card__participants">
                <i />
                {studyParticipants.length} / {room.settings.maxParticipants}명 집중 중
              </span>
            </div>
          </section>

          <div className="study__grid" style={gridStyle} aria-label="참가자 영상 영역">
            {studyParticipants.map((participant) => {
              const isMe = participant.id === currentParticipantId;
              const isAway = participant.status === 'away' || participant.status === 'break';

              return (
                <div className={`tile${isMe ? ' tile--me' : ''}`} key={participant.id}>
                {videoJoin ? (
                  <DailyParticipantMedia
                    isCameraOn={isCameraOn}
                    participant={participantsByRoomiId.get(participant.id)}
                    fallbackInitial={participantInitial(participant.nickname)}
                    isMe={isMe}
                  />
                ) : isMe && isCameraOn ? (
                  <video
                    ref={localVideoRef}
                    className="tile__video"
                    autoPlay
                    muted
                    playsInline
                    aria-label="내 웹캠 미리보기"
                  />
                ) : (
                  <div className="tile__avatar">{participantInitial(participant.nickname)}</div>
                )}
                <div className="tile__foot">
                  <span className="tile__name">
                    {isMe ? (
                      isMicOn ? (
                        <Mic size={13} />
                      ) : (
                        <MicOff size={13} />
                      )
                    ) : (
                      <Mic size={13} />
                    )}
                    {participant.nickname}
                    {isMe && ' (나)'}
                  </span>
                  <span className="tile__status">
                    <span className={`tile__dot${isAway ? ' tile__dot--away' : ''}`} />
                    {statusLabel[participant.status]}
                  </span>
                </div>
              </div>
              );
            })}
          </div>
        </section>

        <aside className="study__panel">
          <InviteCodeCard inviteCode={room.inviteCode} />
          <section className="study-card study-lumi" aria-label="루미의 실시간 안내">
            <div className="study-lumi__head">
              <RoomiMascot size={30} mood={panelMood} />
              <div>
                <strong>루미</strong>
                <span>AI 스터디 운영자</span>
              </div>
              <span className="study-lumi__live">LIVE</span>
            </div>
            <div
              key={latestRoomiMessage?.id ?? 'default'}
              className="study-lumi__bubble"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="study-lumi__label">{roomiMessageLabel(latestRoomiMessage)}</span>
              <p className="study-lumi__text">
                {latestRoomiMessage?.text ??
                  '좋아, 지금부터 목표 한 가지에만 집중해보자. 흐름이 끊기면 내가 먼저 알려줄게.'}
              </p>
            </div>
          </section>

          {focusRecoveryMessage && (
            <section className="confirm" role="dialog" aria-label="집중 확인" aria-modal="false">
              <span className="confirm__label">루미 확인</span>
              <div className="confirm__head">
                <RoomiMascot size={22} mood="surprise" />
                루미의 집중 확인
              </div>
              <p className="confirm__text">{focusRecoveryMessage.text}</p>
              <div className="confirm__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setDismissedFocusMessageId(focusRecoveryMessage.id)}
                >
                  맞아
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setDismissedFocusMessageId(focusRecoveryMessage.id);
                    go('break');
                  }}
                >
                  오탐이야
                </button>
              </div>
            </section>
          )}

          <div className="study-card">
            <div className="study-card__title">오늘 목표</div>
            {participants.map((participant) => {
              const goal = goals.find((item) => item.participantId === participant.id);
              const isSelf = participant.id === currentParticipantId;

              return (
                <div className="goal" key={participant.id}>
                  <span className="goal__who">{participant.nickname}</span>
                  <span className="goal__text">
                    {goal?.rawText ?? '아직 목표를 입력하지 않았어요.'}
                  </span>
                  {isSelf && goal && (
                    <label className="goal__achieved">
                      <input
                        type="checkbox"
                        checked={goal.achieved ?? false}
                        onChange={(event) => onToggleGoalAchieved(event.target.checked)}
                      />
                      달성
                    </label>
                  )}
                </div>
              );
            })}
          </div>

        </aside>
      </div>

      <div className="study__controls">
        <button
          type="button"
          className={`ctrl${isMicOn ? ' ctrl--active' : ' ctrl--muted'}`}
          aria-label={isMicOn ? '마이크 끄기' : '마이크 켜기'}
          aria-pressed={isMicOn}
          onClick={toggleAudio}
        >
          {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <button
          type="button"
          className={`ctrl${isCameraOn ? ' ctrl--active' : ' ctrl--muted'}`}
          aria-label={isCameraOn ? '카메라 끄기' : '카메라 켜기'}
          aria-pressed={isCameraOn}
          onClick={toggleVideo}
        >
          {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
        <button type="button" className="ctrl" aria-label="휴식" onClick={() => go('break')}>
          <Coffee size={20} />
        </button>
        {isHost && (
          <div className="host-actions">
            <button
              type="button"
              className="ctrl"
              aria-expanded={isHostMenuOpen}
              aria-label="방장 메뉴"
              onClick={() => setIsHostMenuOpen((isOpen) => !isOpen)}
            >
              <MoreHorizontal size={20} />
            </button>
            {isHostMenuOpen && (
              <div className="host-menu" role="menu" aria-label="방장 전용 액션">
                <button
                  type="button"
                  className="host-menu__item host-menu__item--danger"
                  role="menuitem"
                  onClick={() => {
                    setIsHostMenuOpen(false);
                    setIsEndConfirmOpen(true);
                  }}
                >
                  세션 종료
                </button>
              </div>
            )}
          </div>
        )}
        <button type="button" className="ctrl ctrl--leave" aria-label="나가기" onClick={onLeaveRoom}>
          <LogOut size={20} />
        </button>
      </div>

      {dailyStatus === 'joining' && <div className="study__call-status">화상 세션 연결 중</div>}
      {dailyStatus === 'error' && (
        <div className="study__call-status study__call-status--error">
          화상 세션 연결에 실패했어요
        </div>
      )}

      {isEndConfirmOpen && (
        <div className="session-end-modal" role="dialog" aria-modal="true" aria-label="세션 종료 확인">
          <div className="session-end-modal__panel">
            <div className="session-end-modal__title">모두의 세션을 종료할까요?</div>
            <p className="session-end-modal__text">
              방장만 할 수 있는 액션이에요. 종료하면 모든 참가자가 회고 화면으로 이동해요.
            </p>
            <div className="session-end-modal__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setIsEndConfirmOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  setIsEndConfirmOpen(false);
                  onEndSession();
                }}
              >
                세션 종료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DailyParticipantMedia({
  fallbackInitial,
  isCameraOn,
  isMe,
  participant
}: {
  fallbackInitial: string;
  isCameraOn: boolean;
  isMe: boolean;
  participant?: {
    tracks?: {
      audio?: { persistentTrack?: MediaStreamTrack; state?: string; track?: MediaStreamTrack };
      video?: { persistentTrack?: MediaStreamTrack; state?: string; track?: MediaStreamTrack };
    };
  };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoTrack = participant?.tracks?.video?.track ?? participant?.tracks?.video?.persistentTrack;
  const audioTrack = participant?.tracks?.audio?.track ?? participant?.tracks?.audio?.persistentTrack;
  const isVideoPlayable = participant?.tracks?.video?.state === 'playable';
  const shouldShowVideo = Boolean(isVideoPlayable && (isCameraOn || !isMe));

  useEffect(() => {
    if (!videoRef.current || !videoTrack || !shouldShowVideo) {
      return;
    }

    videoRef.current.srcObject = new MediaStream([videoTrack]);
    void videoRef.current.play().catch((error) => {
      console.error('Daily video playback failed:', error);
    });
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [shouldShowVideo, videoTrack]);

  useEffect(() => {
    if (!audioRef.current || !audioTrack || isMe) {
      return;
    }

    audioRef.current.srcObject = new MediaStream([audioTrack]);
    void audioRef.current.play().catch((error) => {
      console.error('Daily audio playback failed:', error);
    });
  }, [audioTrack, isMe]);

  return (
    <>
      {shouldShowVideo ? (
        <video
          ref={videoRef}
          className="tile__video"
          autoPlay
          muted={isMe}
          playsInline
          aria-label={isMe ? '내 웹캠 미리보기' : undefined}
        />
      ) : (
        <div className="tile__avatar">{fallbackInitial}</div>
      )}
      {!isMe && <audio ref={audioRef} autoPlay />}
    </>
  );
}
