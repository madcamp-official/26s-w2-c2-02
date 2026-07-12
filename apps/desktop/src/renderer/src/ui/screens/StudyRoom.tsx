import { useEffect, useRef, useState } from 'react';
import { Coffee, Mic, MicOff, PauseCircle, Video, VideoOff } from 'lucide-react';
import { RoomiMascot } from '../components/RoomiMascot';
import { AppBar } from '../components/AppBar';
import type { ScreenProps } from './types';

/**
 * Study Room · Live Session (Figma 47:2).
 * NOTE: No screenshot was available (Figma read quota exhausted). Layout is
 * inferred from the AGENTS.md IA (video grid, timer, goals, Lumi panel,
 * personal confirm message, detection pause, controls). Verify against Figma.
 */
const tiles = [
  { name: '소요', initial: '소', status: '집중중', away: false, me: true, muted: false },
  { name: '채훈', initial: '채', status: '집중중', away: false, me: false, muted: false },
  { name: '민지', initial: '민', status: '자리비움', away: true, me: false, muted: true },
  { name: '지호', initial: '지', status: '집중중', away: false, me: false, muted: false }
];

const goals = [
  { who: '소요', text: '수학 문제집 5장 풀기' },
  { who: '채훈', text: 'Socket.IO 방 상태 동기화' },
  { who: '민지', text: '영어 단어 60개 암기' }
];

export function StudyRoom({ go }: ScreenProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isCameraOn]);

  const toggleAudio = () => {
    const next = !isMicOn;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsMicOn(next);
  };

  const toggleVideo = () => {
    const next = !isCameraOn;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsCameraOn(next);
  };

  return (
    <div className="screen screen--app">
      <AppBar right={<span className="pill pill--purple">방 코드 4821</span>} />

      <div className="study__body">
        <section className="study__stage">
          <div className="study__stage-head">
            <div className="study__stage-title">집중 세션 진행 중</div>
            <span className="badge badge--wait">4명 참여</span>
          </div>

          <div className="study__grid" aria-label="참가자 영상 영역">
            {tiles.map((t) => (
              <div className={`tile${t.me ? ' tile--me' : ''}`} key={t.name}>
                {t.me && isCameraOn ? (
                  <video
                    ref={localVideoRef}
                    className="tile__video"
                    autoPlay
                    muted
                    playsInline
                    aria-label="내 웹캠 미리보기"
                  />
                ) : (
                  <div className="tile__avatar">{t.initial}</div>
                )}
                <div className="tile__foot">
                  <span className="tile__name">
                    {t.me ? (
                      isMicOn ? (
                        <Mic size={13} />
                      ) : (
                        <MicOff size={13} />
                      )
                    ) : t.muted ? (
                      <MicOff size={13} />
                    ) : (
                      <Mic size={13} />
                    )}
                    {t.name}
                    {t.me && ' (나)'}
                  </span>
                  <span className="tile__status">
                    <span className={`tile__dot${t.away ? ' tile__dot--away' : ''}`} />
                    {t.status}
                  </span>
                </div>
              </div>
            ))}
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
            {goals.map((g) => (
              <div className="goal" key={g.who}>
                <span className="goal__who">{g.who}</span>
                <span className="goal__text">{g.text}</span>
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
          소요, 아직 집중 중이야?
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
        <button type="button" className="ctrl--end" onClick={() => go('retrospective')}>
          세션 종료
        </button>
      </div>
    </div>
  );
}
