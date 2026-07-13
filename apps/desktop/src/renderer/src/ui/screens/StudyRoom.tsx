import { useEffect, useRef, useState } from 'react';
import {
  Coffee,
  LogOut,
  Mic,
  MicOff,
  MoreHorizontal,
  PauseCircle,
  Video,
  VideoOff
} from 'lucide-react';
import { RoomiMascot } from '../components/RoomiMascot';
import { formatInviteCode, type Participant, type Room, type VideoJoinInfo } from '@roomi/shared';
import type { ScreenProps } from './types';
import { useDailyRoom } from '../../use-daily-room';

/**
 * Study Room · Live Session (Figma 47:2).
 * NOTE: No screenshot was available (Figma read quota exhausted). Layout is
 * inferred from the AGENTS.md IA (video grid, timer, goals, Lumi panel,
 * personal confirm message, detection pause, controls). Verify against Figma.
 */
interface StudyRoomProps extends ScreenProps {
  currentParticipantId: string;
  isHost: boolean;
  onEndSession: () => void;
  onLeaveRoom: () => void;
  participants: Participant[];
  room: Room;
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

function defaultGoalFor(participant: Participant) {
  return participant.role === 'host' ? '세션 흐름 정리하기' : '이번 세션 목표 집중하기';
}

export function StudyRoom({
  currentParticipantId,
  isHost,
  onEndSession,
  onLeaveRoom,
  participants,
  room,
  videoJoin,
  go
}: StudyRoomProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const {
    callObject,
    localMedia,
    participantsByRoomiId,
    status: dailyStatus
  } = useDailyRoom(videoJoin);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isHostMenuOpen, setIsHostMenuOpen] = useState(false);
  const [isEndConfirmOpen, setIsEndConfirmOpen] = useState(false);
  const currentParticipant =
    participants.find((participant) => participant.id === currentParticipantId) ?? participants[0];

  useEffect(() => {
    if (!callObject) {
      return;
    }

    setIsMicOn(localMedia.audio);
    setIsCameraOn(localMedia.video);
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
      callObject.setLocalVideo(next);
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
          <div className="study__stage-head">
            <div className="study__stage-title">집중 세션 진행 중</div>
            <div className="study__stage-meta">
              <span className="pill pill--purple">방 코드 {formatInviteCode(room.inviteCode)}</span>
              <span className="badge badge--wait">
                {participants.length}명 참여
              </span>
            </div>
          </div>

          <div className="study__grid" aria-label="참가자 영상 영역">
            {participants.map((participant) => {
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
          <div className="study-card">
            <div className="study-timer__label">집중 중</div>
            <div className="study-timer__value">42:18</div>
            <div className="study-timer__bar">
              <div className="study-timer__fill" style={{ width: '58%' }} />
            </div>
          </div>

          <div className="study-card">
            <div className="study-card__title">오늘 목표</div>
            {participants.map((participant) => (
              <div className="goal" key={participant.id}>
                <span className="goal__who">{participant.nickname}</span>
                <span className="goal__text">{defaultGoalFor(participant)}</span>
              </div>
            ))}
          </div>

          <div className="study-card study-lumi">
            <div className="study-lumi__head">
              <RoomiMascot size={22} />
              루미
            </div>
            <p className="study-lumi__text">
              지금 흐름 좋아! 남은 시간엔 목표 한 가지에만 집중해보자.
            </p>
          </div>
        </aside>
      </div>

      {/* 개인 확인 메시지 */}
      <div className="confirm" role="dialog" aria-label="집중 확인">
        <div className="confirm__head">
          <RoomiMascot size={22} />
          {currentParticipant?.nickname ?? '나'}, 아직 집중 중이야?
        </div>
        <p className="confirm__text">잠깐 자리를 비운 것 같아. 맞다면 알려줘, 아니면 계속 갈게.</p>
        <div className="confirm__actions">
          <button type="button" className="btn btn--primary">
            집중 중이야
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => go('break')}>
            잠깐 쉴게
          </button>
        </div>
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
        <button type="button" className="ctrl" aria-label="감지 일시정지">
          <PauseCircle size={20} />
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

function DailyParticipantMedia({
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

  useEffect(() => {
    if (!videoRef.current || !videoTrack) {
      return;
    }

    videoRef.current.srcObject = new MediaStream([videoTrack]);
    void videoRef.current.play().catch((error) => {
      console.error('Daily video playback failed:', error);
    });
  }, [videoTrack]);

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
      {isVideoPlayable && (isCameraOn || !isMe) ? (
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
