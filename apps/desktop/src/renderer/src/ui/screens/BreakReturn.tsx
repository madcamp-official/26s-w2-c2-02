import { useEffect, useRef, useState } from 'react';
import { Users, User } from 'lucide-react';
import { RoomiMascot } from '../components/RoomiMascot';
import { type Room, type StudySession } from '@roomi/shared';
import type { ScreenProps } from './types';
import { formatSessionTime } from './StudyRoom';

interface BreakReturnProps extends ScreenProps {
  room: Room;
  currentSession?: StudySession;
  isHost: boolean;
  onReturnToStudy: () => void | Promise<void>;
  onExtendBreak: () => void | Promise<void>;
}

function remainingBreakSeconds(session: StudySession, timestamp: number) {
  if (!session.breakEndsAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(session.breakEndsAt) - timestamp) / 1_000));
}

/** Break & Return · 휴식/복귀 (Figma 68:41). Room-wide breaks share a server-synced
 * countdown and are host-controlled; individual breaks are self-serve with no timer. */
export function BreakReturn({
  room,
  currentSession,
  isHost,
  onReturnToStudy,
  onExtendBreak
}: BreakReturnProps) {
  const isRoomBreak = room.settings.breakMode === 'room';
  const [timestamp, setTimestamp] = useState(() => Date.now());
  const autoReturnedRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => setTimestamp(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const remainingSeconds =
    isRoomBreak && currentSession ? remainingBreakSeconds(currentSession, timestamp) : undefined;

  // The host drives the shared clock; once it hits zero, end the break for everyone
  // instead of leaving the room stuck at 00:00.
  useEffect(() => {
    if (!isHost || remainingSeconds === undefined) return;
    if (remainingSeconds > 0 || autoReturnedRef.current) return;
    autoReturnedRef.current = true;
    void onReturnToStudy();
  }, [isHost, remainingSeconds, onReturnToStudy]);

  return (
    <div className="screen screen--break">
      <div className="break__wrap">
        <div className="break__status">휴식 중</div>
        <div className="break__meta">
          <span className="pill pill--purple">방 코드 {room.inviteCode}</span>
        </div>
        <p className="break__hint">{isRoomBreak ? '다 같이 쉬는 시간' : '나 혼자 쉬는 시간'}</p>
        {remainingSeconds !== undefined ? (
          <div className="break__timer">{formatSessionTime(remainingSeconds)}</div>
        ) : (
          <div className="break__timer break__timer--free">자유 휴식</div>
        )}
        <p className="break__subhint">
          {isRoomBreak ? '휴식이 끝나면 루미가 다시 모아줄게요' : '준비되면 언제든 돌아와도 돼요'}
        </p>

        <div className="break__lumi">
          <RoomiMascot size={64} mood="wink" />
          <div className="break__bubble">
            <div className="break__bubble-label">루미의 응원</div>
            <p className="break__bubble-text">
              물 한 잔 마시고 어깨 쭉 펴자! 이제 슬슬 돌아올 준비 하면 딱 좋아
            </p>
          </div>
        </div>

        <div className="break__options">
          <div className={`break-option${isRoomBreak ? ' break-option--active' : ''}`}>
            <span className="break-option__icon">
              <Users size={18} />
            </span>
            <div className="break-option__title">방 전체 휴식</div>
            <p className="break-option__desc">모두 같은 시간에 쉬고 같은 시간에 다시 모여요.</p>
            <div className={`break-option__foot${isRoomBreak ? ' break-option__foot--active' : ' break-option__foot--muted'}`}>
              {isRoomBreak ? '지금 이 방식이에요' : '방장이 바꿀 수 있어요'}
            </div>
          </div>

          <div className={`break-option${isRoomBreak ? '' : ' break-option--active'}`}>
            <span className="break-option__icon">
              <User size={18} />
            </span>
            <div className="break-option__title">개인 자율 휴식</div>
            <p className="break-option__desc">각자 원할 때 잠깐 쉬고 자유롭게 복귀해요.</p>
            <div className={`break-option__foot${isRoomBreak ? ' break-option__foot--muted' : ' break-option__foot--active'}`}>
              {isRoomBreak ? '방장이 바꿀 수 있어요' : '지금 이 방식이에요'}
            </div>
          </div>
        </div>

        <div className="break__actions">
          {isRoomBreak ? (
            isHost ? (
              <>
                <button type="button" className="btn btn--ghost" onClick={() => void onExtendBreak()}>
                  5분 더 쉬기
                </button>
                <button type="button" className="btn btn--primary" onClick={() => void onReturnToStudy()}>
                  지금 바로 복귀하기
                </button>
              </>
            ) : (
              <p className="break__wait-note" role="status">
                방장이 휴식을 끝내면 자동으로 모여요.
              </p>
            )
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => void onReturnToStudy()}>
              지금 바로 복귀하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
