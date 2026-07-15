import { useRef, useState } from 'react';
import { RoomiMascot } from '../components/RoomiMascot';
import { InviteCodeCard } from '../components/InviteCodeCard';
import {
  type GameKind,
  type Goal,
  type GoalRefinement,
  type Participant,
  type Room,
  type RoomActivityKind
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

const activityLabel: Record<RoomActivityKind, string> = {
  study: '공부하기',
  ...gameLabel
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
  const isStudyMode = room.settings.activityKind === 'study';
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
  const promptLabel = isStudyMode ? '내 목표' : '오늘의 플레이 스타일';
  const promptPlaceholder = isStudyMode
    ? '이번 세션에 집중할 한 가지를 적어주세요'
    : '예: 절대 웃지 않는 사람인 척하기';
  const refineButtonLabel = isStudyMode ? '루미에게 다듬기' : '루미에게 추천받기';
  const refiningLabel = isStudyMode ? '루미가 다듬는 중...' : '루미가 고르는 중...';
  const saveSuggestionLabel = isStudyMode ? '이 목표로 저장' : '이 스타일로 저장';
  const requiredPhrase = isStudyMode ? '목표를' : '플레이 스타일을';

  const submitGoal = () => {
    const trimmed = goalText.trim();
    if (trimmed) {
      onSubmitGoal(trimmed);
    }
  };

  const refineGoal = async () => {
    const trimmed = goalText.trim();
    if (!trimmed && isStudyMode) {
      setRefineError('먼저 다듬을 목표를 적어주세요.');
      return;
    }

    setIsRefining(true);
    setRefineError(null);
    try {
      setRefinement(await onRefineGoal(trimmed));
    } catch {
      setRefinement(null);
      setRefineError(
        isStudyMode
          ? '루미가 목표를 다듬지 못했어요. 잠시 후 다시 시도해주세요.'
          : '루미가 플레이 스타일을 추천하지 못했어요. 잠시 후 다시 시도해주세요.'
      );
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
      setSessionActionError(
        isStudyMode
          ? '스터디룸에 입장하지 못했어요. 잠시 후 다시 시도해 주세요.'
          : '게임방에 입장하지 못했어요. 잠시 후 다시 시도해 주세요.'
      );
    }
  };

  const people = [
    ...participants.map((participant) => {
      const isStudying = inProgress && participant.status !== 'online';
      return {
        id: participant.id,
        name: participant.nickname,
        sub: participant.role === 'host' ? '방장' : '',
        status: isStudying ? (isStudyMode ? '공부 중' : '게임 중') : participant.isReady ? '준비완료' : '준비 중',
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
                <h1 className={`waiting__title${!isStudyMode && !inProgress ? ' waiting__title--game' : ''}`}>
                  {inProgress
                    ? isStudyMode
                      ? '이미 공부 중이에요'
                      : '이미 게임이 진행 중이에요'
                    : isStudyMode
                      ? '다 같이 목표를 정해볼까요?'
                      : '오늘의 플레이 스타일을 정해볼까요?'}
                </h1>
              </div>
            </div>
            <InviteCodeCard inviteCode={room.inviteCode} />
          </div>
          <p className="waiting__subtitle">
            {inProgress
              ? isStudyMode
                ? '목표만 정하면 진행 중인 세션에 바로 합류할 수 있어요.'
                : '플레이 스타일만 정하면 진행 중인 게임방에 바로 합류할 수 있어요.'
              : isStudyMode
                ? '각자 목표를 적으면 루미가 세션 안에 끝낼 수 있는 크기로 다듬어줘요.'
                : '각자 오늘의 캐릭터를 정하면 루미가 게임 중에 가볍게 살려줄 수 있어요.'}
          </p>
          {sessionActionError && (
            <p className="onb-hint onb-hint--error" role="alert">
              {sessionActionError}
            </p>
          )}

          <label className="waiting__label" htmlFor="goal">
            {promptLabel}
          </label>
          <input
            id="goal"
            className="field waiting__goal-input"
            placeholder={promptPlaceholder}
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
              {isRefining ? refiningLabel : refineButtonLabel}
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
                    {saveSuggestionLabel}
                  </button>
                </div>
              </>
            ) : (
              <p className="lumi-suggest__lead">
                {refineError ??
                  (isStudyMode
                    ? '목표를 적으면 세션에 맞는 크기로 다듬어줄게요.'
                    : '비워두고 눌러도 루미가 게임에 맞는 스타일을 추천해줄게요.')}
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
            <span className="waiting-game__label">선택한 방식</span>
            <strong>{activityLabel[room.settings.activityKind]}</strong>
            <span>{room.settings.sessionMinutes}분 {isStudyMode ? '집중' : '라운드'}</span>
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
                {isJoiningSession ? '입장 중' : isStudyMode ? '스터디룸 참여하기' : '게임방 참여하기'}
              </button>
              {!hasGoal && (
                <p className="waiting__goal-required">먼저 {requiredPhrase} 정해야 참여할 수 있어요.</p>
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
                {isStartingSession ? '방 생성중' : isStudyMode ? '세션 시작하기' : '게임 시작하기'}
              </button>
              {!hasGoal && (
                <p className="waiting__goal-required">먼저 {requiredPhrase} 정해야 시작할 수 있어요.</p>
              )}
            </>
          ) : (
            <div className="waiting__wait-note" role="status">
              <span className="waiting__wait-dot" aria-hidden="true" />
              <span>{isStudyMode ? '방장이 세션을 시작하면 참여 버튼이 열려요.' : '방장이 게임을 시작하면 참여 버튼이 열려요.'}</span>
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
