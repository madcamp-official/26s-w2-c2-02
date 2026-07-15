import { useState } from 'react';
import { ArrowLeft, BookOpen, EyeOff, Repeat2, Smile } from 'lucide-react';
import { type GameKind, type RoomActivityKind, type RoomSettings } from '@roomi/shared';
import type { ScreenProps } from './types';

/**
 * Create Room · 방 만들기 설정 (Figma 71:41).
 * NOTE: No screenshot was available (Figma read quota exhausted). Layout is
 * inferred from the AGENTS.md IA (session time, break mode, score visibility,
 * invite code). Verify against Figma.
 */
interface CreateRoomProps extends ScreenProps {
  error?: string;
  isCreating?: boolean;
  onCreateRoom: (settings: RoomSettings) => void;
}

const activityOptions: Array<{
  kind: RoomActivityKind;
  title: string;
  desc: string;
  rules: string[];
  Icon: typeof BookOpen;
}> = [
  {
    kind: 'study',
    title: '공부하기',
    desc: '목표를 정하고 집중 시간, 휴식, 회고까지 진행해요.',
    rules: ['개인 목표를 루미가 다듬기', '집중 시간과 휴식 설정 사용', '끝나면 목표 달성 여부 회고'],
    Icon: BookOpen
  },
  {
    kind: 'hidden_mission',
    title: '게임 1 · 숨은 표정 미션',
    desc: '각자 받은 비밀 표정 미션을 들키지 않고 수행해요.',
    rules: ['개인 미션은 본인에게만 공개', '표정 카운트 성공 시 10점', '공개 전까지 미션 내용 숨김'],
    Icon: EyeOff
  },
  {
    kind: 'copycat_relay',
    title: '게임 2 · 카피캣 릴레이',
    desc: '다음 플레이어가 표정을 얼마나 비슷하게 따라 하는지 겨뤄요.',
    rules: ['대상을 골라 릴레이 전달', '유사도에 따라 최대 10점', '표정 프롬프트를 이어서 진행'],
    Icon: Repeat2
  },
  {
    kind: 'poker_bluff',
    title: '게임 3 · 포커페이스 블러프',
    desc: '누가 표정 신호를 드러낼지 베팅하고 판정해요.',
    rules: ['상대가 무너질지 먼저 예측', '맞힌 베팅은 4점', '끝까지 버티면 대상자 8점'],
    Icon: Smile
  }
];

export function CreateRoom({ error, isCreating = false, onCreateRoom, go }: CreateRoomProps) {
  const [activityKind, setActivityKind] = useState<RoomActivityKind>('study');
  const [unavailableMessage, setUnavailableMessage] = useState('');
  const [minutes, setMinutes] = useState(50);
  const [roundCount, setRoundCount] = useState(3);
  const [breakMode, setBreakMode] = useState<'room' | 'individual'>('room');
  const [breakMinutes, setBreakMinutes] = useState(10);
  const [scorePublic, setScorePublic] = useState(true);
  const [allowHide, setAllowHide] = useState(true);
  const selectedActivity =
    activityOptions.find((option) => option.kind === activityKind) ?? activityOptions[0]!;
  const selectedGameKind: GameKind =
    activityKind === 'study' ? 'hidden_mission' : activityKind;
  const isStudyMode = activityKind === 'study';

  const createRoom = () => {
    onCreateRoom({
      activityKind,
      defaultGameKind: selectedGameKind,
      sessionMinutes: minutes,
      roundCount,
      breakMode,
      breakMinutes,
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
          <div className="screen-meta">
            <button
              type="button"
              className="back-link"
              onClick={() => go('onboarding-create')}
              aria-label="이전 화면으로"
            >
              <ArrowLeft size={16} />
              <span>이전</span>
            </button>
          </div>
          <h1 className="create__title">방을 만들어볼까요?</h1>
          <p className="create__subtitle">공부할지, 표정 게임을 할지 먼저 정해주세요.</p>

          <div className="create__section">
            <div className="create__section-label">방 방식</div>
            <div className="create__game-grid">
              {activityOptions.map(({ kind, title, desc, Icon }) => {
                const isUnavailable = kind === 'poker_bluff';
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-disabled={isUnavailable}
                    className={`create-opt create-game${activityKind === kind ? ' create-opt--active' : ''}${isUnavailable ? ' create-opt--disabled' : ''}`}
                    onClick={() => {
                      if (isUnavailable) {
                        setUnavailableMessage('다음 업데이트를 기다려주세요');
                        return;
                      }
                      setUnavailableMessage('');
                      setActivityKind(kind);
                    }}
                  >
                    <span className="create-game__head">
                      <span className="create-game__icon">
                        <Icon size={18} />
                      </span>
                      <span className="create-opt__title">{title}</span>
                    </span>
                    <span className="create-opt__desc">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="create__section">
            <div className="create__section-label">진행 규칙</div>
            <div className="create-rule">
              <div>
                <div className="create-rule__title">{selectedActivity.title}</div>
                <ul className="create-rule__list">
                  {selectedActivity.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="create__section">
            <div className="create__section-label">
              {isStudyMode ? '세션 시간' : '라운드 수'}
            </div>
            <div className="create__chips">
              {isStudyMode
                ? [25, 50, 90].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`chip${minutes === m ? ' chip--active' : ''}`}
                      onClick={() => setMinutes(m)}
                    >
                      {m}분
                    </button>
                  ))
                : [1, 3, 5, 7].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={`chip${roundCount === count ? ' chip--active' : ''}`}
                      onClick={() => setRoundCount(count)}
                    >
                      {count}라운드
                    </button>
                  ))}
            </div>
          </div>

          {isStudyMode && (
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
              {breakMode === 'room' && (
                <div className="create__chips">
                  {[5, 10, 15].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`chip${breakMinutes === m ? ' chip--active' : ''}`}
                      onClick={() => setBreakMinutes(m)}
                    >
                      {m}분
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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

          <p className={`create__hint${error ? ' create__hint--error' : ''}`} aria-live="polite">
            {error ?? (unavailableMessage || '최대 4명까지 함께할 수 있어요.')}
          </p>

          <button
            type="button"
            className="btn btn--primary create__submit"
            disabled={isCreating}
            onClick={createRoom}
          >
            {isCreating ? '방 생성중' : '방 만들고 대기실로 가기'}
          </button>
        </div>
      </div>
    </div>
  );
}
