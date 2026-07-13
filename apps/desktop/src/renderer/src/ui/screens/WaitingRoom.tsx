import { RoomiMascot } from '../components/RoomiMascot';
import { formatInviteCode, type Participant, type Room } from '@roomi/shared';
import type { ScreenProps } from './types';

interface WaitingRoomProps extends ScreenProps {
  room: Room;
  participants: Participant[];
}

/** Waiting Room · 대기실 (Figma 70:41). */
export function WaitingRoom({ room, participants, go }: WaitingRoomProps) {
  const readyCount = participants.length;
  const people = [
    ...participants.map((participant) => ({
      id: participant.id,
      name: participant.nickname,
      sub: participant.role === 'host' ? '방장' : '',
      status: '준비완료',
      tone: 'green',
      initial: participant.nickname.slice(0, 1)
    })),
    ...Array.from({ length: room.settings.maxParticipants - participants.length }, (_, index) => ({
      id: `empty-${index}`,
      name: '빈 자리',
      sub: '',
      status: '초대 대기중',
      tone: 'muted',
      initial: ''
    }))
  ];

  return (
    <div className="screen screen--app">
      <div className="waiting__body">
        <main className="waiting__main">
          <p className="waiting__eyebrow">대기실 · 방 코드 {formatInviteCode(room.inviteCode)}</p>
          <h1 className="waiting__title">다 같이 목표를 정해볼까요?</h1>
          <p className="waiting__subtitle">
            각자 목표를 적으면 루미가 세션 안에 끝낼 수 있는 크기로 다듬어줘요.
          </p>

          <label className="waiting__label" htmlFor="goal">
            내 목표
          </label>
          <input
            id="goal"
            className="field waiting__goal-input"
            placeholder="이번 세션에 집중할 한 가지를 적어주세요"
          />

          <section className="lumi-suggest">
            <div className="lumi-suggest__head">
              <RoomiMascot size={22} />
              루미의 제안
            </div>
            <p className="lumi-suggest__lead">이렇게 바꾸면 어때요?</p>
            <p className="lumi-suggest__quote">&quot;수학 문제집 5장 풀기&quot;</p>
            <p className="lumi-suggest__note">50분 세션 안에 확인할 수 있는 크기예요.</p>
            <div className="lumi-suggest__actions">
              <button type="button" className="btn btn--primary">
                이대로 할게요
              </button>
              <button type="button" className="btn btn--ghost">
                직접 수정할래요
              </button>
            </div>
          </section>
        </main>

        <aside className="waiting__panel">
          <h2 className="waiting__panel-title">함께하는 사람들</h2>
          <p className="waiting__panel-sub">
            {readyCount} / {room.settings.maxParticipants}명이 준비를 마쳤어요.
          </p>

          <div className="people">
            {people.map((p) => (
              <div className="person" key={p.id}>
                <span
                  className={`person__avatar${p.initial ? '' : ' person__avatar--empty'}`}
                >
                  {p.initial}
                </span>
                <div className="person__body">
                  <div className="person__name">{p.name}</div>
                  {p.sub && <div className="person__sub">{p.sub}</div>}
                </div>
                <span className={`badge badge--${p.tone}`}>{p.status}</span>
              </div>
            ))}
          </div>

          <div className="status-card">
            <div className="status-card__label">현재 현황</div>
            <div className="status-card__value">
              {readyCount} / {room.settings.maxParticipants}명 준비완료
            </div>
            <div className="status-card__note">모두 준비되면 바로 시작할 수 있어요.</div>
          </div>

          <button
            type="button"
            className="btn btn--primary waiting__start"
            onClick={() => go('study')}
          >
            세션 시작하기
          </button>
        </aside>
      </div>
    </div>
  );
}
