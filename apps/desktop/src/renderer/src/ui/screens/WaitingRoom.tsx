import { useState } from 'react';
import { RoomiMascot } from '../components/RoomiMascot';
import { formatInviteCode, type Goal, type Participant, type Room } from '@roomi/shared';
import type { ScreenProps } from './types';

interface WaitingRoomProps extends ScreenProps {
  room: Room;
  participants: Participant[];
  goals: Goal[];
  currentParticipantId: string;
  isHost: boolean;
  onToggleReady: (isReady: boolean) => void;
  onSubmitGoal: (rawText: string) => void;
  onStartSession: () => void;
  onJoinSession: () => void;
}

/** Waiting Room · 대기실 (Figma 70:41). Renders two modes by room.status. */
export function WaitingRoom({
  room,
  participants,
  goals,
  currentParticipantId,
  isHost,
  onToggleReady,
  onSubmitGoal,
  onStartSession,
  onJoinSession
}: WaitingRoomProps) {
  const inProgress = room.status === 'studying' || room.status === 'break';
  const readyCount = participants.filter((participant) => participant.isReady).length;
  const me = participants.find((participant) => participant.id === currentParticipantId);
  const myGoal = goals.find((goal) => goal.participantId === currentParticipantId);
  const [goalText, setGoalText] = useState(myGoal?.rawText ?? '');

  const submitGoal = () => {
    const trimmed = goalText.trim();
    if (trimmed) {
      onSubmitGoal(trimmed);
    }
  };

  const people = [
    ...participants.map((participant) => ({
      id: participant.id,
      name: participant.nickname,
      sub: participant.role === 'host' ? '방장' : '',
      status: inProgress ? '공부 중' : participant.isReady ? '준비완료' : '준비 중',
      tone: inProgress ? 'blue' : participant.isReady ? 'green' : 'muted',
      initial: participant.nickname.slice(0, 1)
    })),
    ...Array.from(
      { length: Math.max(room.settings.maxParticipants - participants.length, 0) },
      (_, index) => ({
        id: `empty-${index}`,
        name: '빈 자리',
        sub: '',
        status: '초대 대기중',
        tone: 'muted',
        initial: ''
      })
    )
  ];

  return (
    <div className="screen screen--app">
      <div className="waiting__body">
        <main className="waiting__main">
          <p className="waiting__eyebrow">대기실 · 방 코드 {formatInviteCode(room.inviteCode)}</p>
          {inProgress ? (
            <>
              <span className="badge badge--blue">진행 중</span>
              <h1 className="waiting__title">이미 공부 중이에요</h1>
              <p className="waiting__subtitle">
                목표만 정하면 진행 중인 세션에 바로 합류할 수 있어요.
              </p>
            </>
          ) : (
            <>
              <h1 className="waiting__title">다 같이 목표를 정해볼까요?</h1>
              <p className="waiting__subtitle">
                각자 목표를 적으면 루미가 세션 안에 끝낼 수 있는 크기로 다듬어줘요.
              </p>
            </>
          )}

          <label className="waiting__label" htmlFor="goal">
            내 목표
          </label>
          <input
            id="goal"
            className="field waiting__goal-input"
            placeholder="이번 세션에 집중할 한 가지를 적어주세요"
            value={goalText}
            onChange={(event) => setGoalText(event.target.value)}
          />
          <button type="button" className="btn btn--ghost" onClick={submitGoal}>
            목표 저장
          </button>

          <section className="lumi-suggest">
            <div className="lumi-suggest__head">
              <RoomiMascot size={22} />
              루미의 제안
            </div>
            <p className="lumi-suggest__lead">목표를 적으면 세션에 맞는 크기로 다듬어줄게요.</p>
          </section>
        </main>

        <aside className="waiting__panel">
          <h2 className="waiting__panel-title">함께하는 사람들</h2>
          <p className="waiting__panel-sub">
            {inProgress
              ? '진행 중인 세션이에요.'
              : `${readyCount}명이 준비를 마쳤어요.`}
          </p>

          <div className="people">
            {people.map((p) => (
              <div className="person" key={p.id}>
                <span className={`person__avatar${p.initial ? '' : ' person__avatar--empty'}`}>
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
            <div className="status-card__note">
              {inProgress ? '진행 중인 세션에 합류할 수 있어요.' : '모두 준비되면 바로 시작할 수 있어요.'}
            </div>
          </div>

          {!inProgress && (
            <button
              type="button"
              className={`btn ${me?.isReady ? 'btn--ghost' : 'btn--primary'}`}
              onClick={() => onToggleReady(!me?.isReady)}
            >
              {me?.isReady ? '준비 취소' : '준비완료'}
            </button>
          )}

          {inProgress ? (
            <button
              type="button"
              className="btn btn--primary waiting__start"
              onClick={onJoinSession}
            >
              합류하기
            </button>
          ) : isHost ? (
            <button
              type="button"
              className="btn btn--primary waiting__start"
              onClick={onStartSession}
            >
              세션 시작하기
            </button>
          ) : (
            <p className="waiting__wait-note">방장이 시작하기를 기다리고 있어요.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
