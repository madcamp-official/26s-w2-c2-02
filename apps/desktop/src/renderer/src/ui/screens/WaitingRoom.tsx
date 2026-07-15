import { useRef, useState } from 'react';
import { RoomiMascot } from '../components/RoomiMascot';
import { InviteCodeCard } from '../components/InviteCodeCard';
import {
  type GameKind,
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
  onStartSession: () => void | Promise<void>;
  onJoinSession: () => void | Promise<void>;
  onLeaveRoom: () => void;
}

const gameLabel: Record<GameKind, string> = {
  hidden_mission: '숨은 표정 미션',
  poker_bluff: '포커페이스 블러프',
  copycat_relay: '카피캣 릴레이'
};

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
  const hasGoal = Boolean(myGoal?.rawText.trim());
  const [goalText, setGoalText] = useState(myGoal?.rawText ?? '');
  const [refinement, setRefinement] = useState<GoalRefinement | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isJoiningSession, setIsJoiningSession] = useState(false);
  const sessionActionLockRef = useRef(false);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);

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

  const startSession = async () => {
    if (sessionActionLockRef.current) return;
    sessionActionLockRef.current = true;
    setIsStartingSession(true);
    setSessionActionError(null);
    try {
      await onStartSession();
    } catch {
      sessionActionLockRef.current = false;
      setIsStartingSession(false);
      setSessionActionError('방을 생성하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  const joinSession = async () => {
    if (sessionActionLockRef.current) return;
    sessionActionLockRef.current = true;
    setIsJoiningSession(true);
    setSessionActionError(null);
    try {
      await onJoinSession();
    } catch {
      sessionActionLockRef.current = false;
      setIsJoiningSession(false);
      setSessionActionError('스터디룸에 입장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  const people = [
    ...participants.map((participant) => {
      const isStudying = inProgress && participant.status !== 'online';
      return {
        id: participant.id,
        name: participant.nickname,
        sub: participant.role === 'host' ? '방장' : '',
        status: isStudying ? '공부 중' : participant.isReady ? '준비완료' : '준비 중',
        tone: isStudying || participant.isReady ? 'green' : 'muted',
        initial: participant.nickname.slice(0, 1)
      };
    }),
    ...Array.from(
      { length: Math.max(room.settings.maxParticipants - participants.length, 0) },
      (_, index) => ({
        id: `empty-${index}`,
        name: '빈 자리',
        sub: '',
        status: '',
        tone: 'muted',
        initial: ''
      })
    )
  ];

  return (
    <div className="screen screen--app">
      <p className="waiting__eyebrow">대기실</p>
      <div className="waiting__body">
        <main className="waiting__main">
          <div className="waiting__head">
            <div className="waiting__head-title">
              <RoomiMascot size={56} mood={isRefining ? 'curious' : 'angry'} />
              <div>
                {inProgress && <span className="badge badge--blue">진행 중</span>}
                <h1 className="waiting__title">
                  {inProgress ? '이미 공부 중이에요' : '다 같이 목표를 정해볼까요?'}
                </h1>
              </div>
            </div>
            <InviteCodeCard inviteCode={room.inviteCode} />
          </div>
          <p className="waiting__subtitle">
            {inProgress
              ? '목표만 정하면 진행 중인 세션에 바로 합류할 수 있어요.'
              : '각자 목표를 적으면 루미가 세션 안에 끝낼 수 있는 크기로 다듬어줘요.'}
          </p>
          {sessionActionError && (
            <p className="onb-hint onb-hint--error" role="alert">
              {sessionActionError}
            </p>
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
            onBlur={submitGoal}
          />
          <div className="waiting__goal-actions">
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

          <div className="waiting-game">
            <span className="waiting-game__label">선택한 게임</span>
            <strong>{gameLabel[room.settings.defaultGameKind]}</strong>
            <span>{room.settings.sessionMinutes}분 라운드</span>
          </div>

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
                {p.status && <span className={`badge badge--${p.tone}`}>{p.status}</span>}
              </div>
            ))}
          </div>

          {isHost && isStartingSession ? (
            <button
              type="button"
              className="btn btn--primary waiting__start"
              disabled
            >
              방 생성중
            </button>
          ) : inProgress ? (
            <>
              <button
                type="button"
                className="btn btn--primary waiting__start"
                disabled={isJoiningSession || !hasGoal}
                onClick={joinSession}
              >
                {isJoiningSession ? '입장 중' : '스터디룸 참여하기'}
              </button>
              {!hasGoal && (
                <p className="waiting__goal-required">먼저 목표를 적어야 참여할 수 있어요.</p>
              )}
            </>
          ) : isHost ? (
            <>
              <button
                type="button"
                className="btn btn--primary waiting__start"
                disabled={isStartingSession || !hasGoal}
                onClick={startSession}
              >
                {isStartingSession ? '방 생성중' : '세션 시작하기'}
              </button>
              {!hasGoal && (
                <p className="waiting__goal-required">먼저 목표를 적어야 시작할 수 있어요.</p>
              )}
            </>
          ) : (
            <div className="waiting__wait-note" role="status">
              <span className="waiting__wait-dot" aria-hidden="true" />
              <span>방장이 세션을 시작하면 참여 버튼이 열려요.</span>
            </div>
          )}

          <button type="button" className="btn btn--ghost waiting__leave" onClick={onLeaveRoom}>
            방 나가기
          </button>
        </aside>
      </div>
    </div>
  );
}
