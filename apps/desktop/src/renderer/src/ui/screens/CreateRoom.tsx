import { useState } from 'react';
import { Copy } from 'lucide-react';
import { formatInviteCode, type RoomSettings } from '@roomi/shared';
import type { ScreenProps } from './types';

/**
 * Create Room · 방 만들기 설정 (Figma 71:41).
 * NOTE: No screenshot was available (Figma read quota exhausted). Layout is
 * inferred from the AGENTS.md IA (session time, break mode, score visibility,
 * invite code). Verify against Figma.
 */
interface CreateRoomProps extends ScreenProps {
  error?: string;
  inviteCode: string;
  onCreateRoom: (settings: RoomSettings) => void;
}

export function CreateRoom({ error, inviteCode, onCreateRoom }: CreateRoomProps) {
  const [minutes, setMinutes] = useState(50);
  const [breakMode, setBreakMode] = useState<'room' | 'individual'>('room');
  const [scorePublic, setScorePublic] = useState(true);
  const [allowHide, setAllowHide] = useState(true);

  const createRoom = () => {
    onCreateRoom({
      sessionMinutes: minutes,
      breakMode,
      defaultScoreVisibility: scorePublic ? 'public' : 'private',
      maxParticipants: 4,
      authMode: 'nickname_code',
      videoProvider: 'daily',
      roomiTone: 'friendly_casual',
      rankingMetric: 'focus_minutes',
      videoRequired: true,
      detectionPauseAllowed: allowHide
    });
  };

  return (
    <div className="screen screen--app">
      <div className="create__body">
        <div className="create__card">
          <div className="screen-meta screen-meta--end">
            <span className="pill pill--purple">현재 코드 {formatInviteCode(inviteCode)}</span>
          </div>
          <h1 className="create__title">방을 만들어볼까요?</h1>
          <p className="create__subtitle">세션 규칙을 정하면 초대 코드가 만들어져요.</p>

          <div className="create__section">
            <div className="create__section-label">세션 시간</div>
            <div className="create__chips">
              {[25, 50, 90].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip${minutes === m ? ' chip--active' : ''}`}
                  onClick={() => setMinutes(m)}
                >
                  {m}분
                </button>
              ))}
            </div>
          </div>

          <div className="create__section">
            <div className="create__section-label">휴식 방식</div>
            <div className="create__duo">
              <button
                type="button"
                className={`create-opt${breakMode === 'room' ? ' create-opt--active' : ''}`}
                onClick={() => setBreakMode('room')}
              >
                <div className="create-opt__title">방 전체 휴식</div>
                <div className="create-opt__desc">모두 같은 시간에 쉬고 같은 시간에 모여요.</div>
              </button>
              <button
                type="button"
                className={`create-opt${breakMode === 'individual' ? ' create-opt--active' : ''}`}
                onClick={() => setBreakMode('individual')}
              >
                <div className="create-opt__title">개인 자율 휴식</div>
                <div className="create-opt__desc">각자 원할 때 쉬고 자유롭게 복귀해요.</div>
              </button>
            </div>
          </div>

          <div className="create__section">
            <div className="create__section-label">점수 공개</div>
            <div className="toggle-row">
              <div>
                <div className="toggle-row__text">점수 기본 공개</div>
                <div className="toggle-row__sub">집중 시간과 몰입도를 방에 공유해요.</div>
              </div>
              <button
                type="button"
                aria-pressed={scorePublic}
                className={`switch${scorePublic ? ' switch--on' : ''}`}
                onClick={() => setScorePublic((v) => !v)}
              />
            </div>
            <div className="toggle-row">
              <div>
                <div className="toggle-row__text">개인별 점수 숨김 허용</div>
                <div className="toggle-row__sub">참가자가 자기 점수를 숨길 수 있어요.</div>
              </div>
              <button
                type="button"
                aria-pressed={allowHide}
                className={`switch${allowHide ? ' switch--on' : ''}`}
                onClick={() => setAllowHide((v) => !v)}
              />
            </div>
          </div>

          <div className="create__section">
            <div className="create__section-label">초대 코드</div>
            <div className="invite">
              <span className="invite__code">생성 후 발급</span>
              <button type="button" className="btn btn--soft" style={{ height: 38, fontSize: 13 }}>
                <Copy size={15} />
                대기 중
              </button>
            </div>
            <p className={`create__hint${error ? ' create__hint--error' : ''}`} aria-live="polite">
              {error ?? '최대 4명까지 함께할 수 있어요.'}
            </p>
          </div>

          <button
            type="button"
            className="btn btn--primary create__submit"
            onClick={createRoom}
          >
            방 만들고 대기실로 가기
          </button>
        </div>
      </div>
    </div>
  );
}
