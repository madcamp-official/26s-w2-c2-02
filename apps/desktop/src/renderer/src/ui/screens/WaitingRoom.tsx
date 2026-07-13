import { useState } from 'react';
import { RoomiMascot } from '../components/RoomiMascot';
import {
  formatInviteCode,
  type Goal,
  type GoalRefinement,
  type Participant,
  type Room
} from '@roomi/shared';
import type { ScreenProps } from './types';

interface WaitingRoomProps extends ScreenProps {
  room: Room;
  participants: Participant[];
  goals: Goal[];
  currentParticipantId: string;
  isHost: boolean;
  onSubmitGoal: (rawText: string) => void;
  onRefineGoal: (rawText: string) => Promise<GoalRefinement>;
  onStartSession: () => void;
  onJoinSession: () => void;
  onLeaveRoom: () => void;
}

/** Waiting Room · 대기실 (Figma 70:41). Renders two modes by room.status. */
export function WaitingRoom({
  room,
  participants,
  goals,
  currentParticipantId,
  isHost,
  onSubmitGoal,
  onRefineGoal,
  onStartSession,
  onJoinSession,
  onLeaveRoom
}: WaitingRoomProps) {
  const inProgress = room.status === 'studying' || room.status === 'break';
  const readyCount = participants.filter((participant) => participant.isReady).length;
  const myGoal = goals.find((goal) => goal.participantId === currentParticipantId);
  const [goalText, setGoalText] = useState(myGoal?.rawText ?? '');
  const [refinement, setRefinement] = useState<GoalRefinement | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);

  const submitGoal = () => {
    const trimmed = goalText.trim();
    if (trimmed) {
      onSubmitGoal(trimmed);
    }
  };

  const refineGoal = async () => {
    const trimmed = goalText.trim();
    if (!trimmed) {
      setRefineError('먼저 다듬을 목표를 적어주세요.');
      return;
    }

    setIsRefining(true);
    setRefineError(null);
    try {
      setRefinement(await onRefineGoal(trimmed));
    } catch {
      setRefinement(null);
      setRefineError('루미가 목표를 다듬지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsRefining(false);
    }
  };

  const applyRefinement = () => {
    if (!refinement) return;
    setGoalText(refinement.refinedText);
    onSubmitGoal(refinement.refinedText);
    setRefinement(null);
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
            onChange={(event) => {
              setGoalText(event.target.value);
              setRefinement(null);
              setRefineError(null);
            }}
          />
          <div className="waiting__goal-actions">
            <button type="button" className="btn btn--ghost" onClick={submitGoal}>
              목표 저장
            </button>
            <button type="button" className="btn btn--primary" onClick={refineGoal} disabled={isRefining}>
              {isRefining ? '루미가 다듬는 중...' : '루미에게 다듬기'}
            </button>
          </div>

          <section className="lumi-suggest">
            <div className="lumi-suggest__head">
              <RoomiMascot size={22} />
              루미의 제안
            </div>
            {refinement ? (
              <>
                <p className="lumi-suggest__quote">{refinement.refinedText}</p>
                <p className="lumi-suggest__note">{refinement.reason}</p>
                <div className="lumi-suggest__actions">
                  <button type="button" className="btn btn--primary" onClick={applyRefinement}>
                    이 목표로 저장
                  </button>
                </div>
              </>
            ) : (
              <p className="lumi-suggest__lead">
                {refineError ?? '목표를 적으면 세션에 맞는 크기로 다듬어줄게요.'}
              </p>
            )}
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
              {inProgress
                ? '진행 중인 세션에 합류할 수 있어요.'
                : '방장은 준비 상태와 관계없이 언제든 시작할 수 있어요.'}
            </div>
          </div>

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

          <button type="button" className="btn btn--ghost waiting__leave" onClick={onLeaveRoom}>
            방 나가기
          </button>
        </aside>
      </div>
    </div>
  );
}
