import { RoomiMascot } from '../components/RoomiMascot';
import type { GameKind, GameSession, Goal, Participant, Room, StudySession } from '@roomi/shared';
import type { ScreenProps } from './types';

interface RetrospectiveProps extends ScreenProps {
  session?: StudySession;
  goals: Goal[];
  participants: Participant[];
  currentParticipantId: string;
  room: Room;
  currentGame?: GameSession;
  onGoHome: () => void;
  onRestartSession: () => void;
}

interface RetroRankingRow {
  participantId: string;
  nickname: string;
  valueText: string;
  left: boolean;
}

function fallbackFocusMinutes(session?: StudySession): number {
  if (!session) return 0;
  const startedAtMs = Date.parse(session.startedAt);
  const endedAtMs = session.endedAt ? Date.parse(session.endedAt) : Date.now();
  const elapsedMinutes = Math.max(0, (endedAtMs - startedAtMs) / 60_000);
  return Math.round(Math.min(elapsedMinutes, session.plannedMinutes));
}

function gameKindLabel(kind: GameKind) {
  if (kind === 'hidden_mission') return '숨은 표정 미션';
  if (kind === 'poker_bluff') return '포커페이스 블러프';
  return '카피캣 릴레이';
}

function rankGameScores(game: GameSession | undefined, participants: Participant[]) {
  const participantOrder = new Map(participants.map((participant, index) => [participant.id, index]));
  return (game?.scores ?? [])
    .map((score) => {
      const participant = participants.find((item) => item.id === score.participantId);
      return participant ? { participant, points: score.points } : undefined;
    })
    .filter((entry): entry is { participant: Participant; points: number } => Boolean(entry))
    .sort(
      (left, right) =>
        right.points - left.points ||
        (participantOrder.get(left.participant.id) ?? 0) - (participantOrder.get(right.participant.id) ?? 0)
    );
}

/** Retrospective · 세션 회고 (Figma 72:41). */
export function Retrospective({
  session,
  goals,
  participants,
  currentParticipantId,
  room,
  currentGame,
  onGoHome,
  onRestartSession
}: RetrospectiveProps) {
  const gameKind: GameKind | undefined =
    room.settings.activityKind !== 'study' ? room.settings.activityKind : undefined;
  const isGameMode = gameKind !== undefined;

  const myGoal = goals.find((goal) => goal.participantId === currentParticipantId);
  const goalAchieved = myGoal?.achieved ?? false;
  const goalNote =
    myGoal?.refinedText ??
    myGoal?.rawText ??
    (isGameMode ? '등록된 플레이 스타일이 없어요.' : '등록된 목표가 없어요.');

  // Study mode
  const plannedMinutes = session?.plannedMinutes ?? 50;
  const focusRanking = session?.summary?.ranking ?? [];
  // The headline sits next to this participant's own goal, so it has to be their
  // tracked minutes. summary.focusMinutes is the room average and would contradict
  // the ranking row below for anyone who was not the most focused person here.
  const myFocusMinutes = focusRanking.find(
    (entry) => entry.participantId === currentParticipantId
  )?.focusMinutes;
  const focusMinutes =
    myFocusMinutes ?? session?.summary?.focusMinutes ?? fallbackFocusMinutes(session);
  const focusPercent =
    plannedMinutes > 0 ? Math.min(100, Math.round((focusMinutes / plannedMinutes) * 100)) : 0;

  // Game mode
  const gameRanking = rankGameScores(currentGame, participants);
  const myGameRank = gameRanking.findIndex(
    (entry) => entry.participant.id === currentParticipantId
  );
  const myPoints = myGameRank >= 0 ? gameRanking[myGameRank].points : 0;
  const isWinner = myGameRank === 0 && myPoints > 0;
  const roundsPlayed = currentGame?.completedRounds?.length ?? 0;

  const lumiComment =
    session?.summary?.lumiComment ??
    (isGameMode ? '오늘도 재밌게 놀았어! 다음에도 같이 게임하자.' : '오늘도 수고했어! 다음에도 같이 집중해보자.');
  const goalFeedback =
    session?.summary?.goalFeedback ??
    (isGameMode
      ? '플레이 스타일에 대한 자세한 피드백은 다음 게임부터 더 정확하게 보여줄게요.'
      : '자세한 목표 피드백은 다음 세션부터 더 정확하게 보여줄게요.');

  const badge = isGameMode ? '게임 회고' : '세션 회고';
  const title = isGameMode ? '오늘 게임, 재밌게 마쳤어요!' : '오늘 세션, 잘 마쳤어요!';
  const subtitle = isGameMode
    ? `${gameKindLabel(gameKind)}을(를) 총 ${roundsPlayed}라운드 함께 즐겼어요. 이번 판을 정리해볼게요.`
    : `${plannedMinutes}분 집중 세션을 함께 끝냈어요. 이번 흐름을 정리해볼게요.`;

  const stat1Label = isGameMode ? '내 점수' : '집중 시간';
  const stat1Value = isGameMode ? `${myPoints}점` : `${focusMinutes}분`;
  const stat1Note = isGameMode
    ? myGameRank >= 0
      ? `${myGameRank + 1}위 · 참가자 ${gameRanking.length}명 중`
      : '점수 집계 중이에요.'
    : `목표의 ${focusPercent}%`;

  const stat2Label = isGameMode ? '결과' : '목표 결과';
  const stat2Value = isGameMode ? (isWinner ? '우승' : '참가') : goalAchieved ? '달성' : '미달성';

  const feedbackTitle = isGameMode ? '플레이 스타일 피드백' : '목표 피드백';
  const rankingTitle = isGameMode ? '게임 순위' : '집중 순위';
  const rankingEmptyText = isGameMode
    ? '게임 결과는 라운드를 진행하면 확인할 수 있어요.'
    : '집중 순위는 서버 연결 후 확인할 수 있어요.';
  const restartLabel = isGameMode ? '한 번 더 플레이하기' : '한 번 더 집중하기';

  const rankingRows: RetroRankingRow[] = isGameMode
    ? gameRanking.map((entry) => ({
        participantId: entry.participant.id,
        nickname: entry.participant.nickname,
        valueText: `${entry.points}점`,
        left: false
      }))
    : focusRanking.map((entry) => ({
        participantId: entry.participantId,
        nickname: participants.find((p) => p.id === entry.participantId)?.nickname ?? entry.nickname,
        valueText: `${entry.focusMinutes}분`,
        left: entry.left
      }));

  return (
    <div className="screen screen--app">
      <div className="retro__body">
        <div className="retro__doc">
          {/* Header */}
          <div className="retro__head">
            <RoomiMascot size={84} mood="wink" />
            <div className="retro__head-text">
              <span className="retro__badge">{badge}</span>
              <h1 className="retro__title">{title}</h1>
              <p className="retro__subtitle">{subtitle}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="retro__stats">
            <div className="retro-stat">
              <div className="retro-stat__label">{stat1Label}</div>
              <div className="retro-stat__value">{stat1Value}</div>
              <div className="retro-stat__note">{stat1Note}</div>
            </div>
            <div className="retro-stat">
              <div className="retro-stat__label">{stat2Label}</div>
              <div className="retro-stat__value">{stat2Value}</div>
              <div className="retro-stat__note">{goalNote}</div>
            </div>
          </div>

          {/* Lumi one-line */}
          <div className="retro__lumi">
            <div className="retro__lumi-label">루미의 한 줄 회고</div>
            <p className="retro__lumi-text">{lumiComment}</p>
          </div>

          {/* Goal / play style feedback */}
          <div className="retro-block">
            <div className="retro-block__title">{feedbackTitle}</div>
            <p className="retro-block__text">{goalFeedback}</p>
          </div>

          {/* Ranking */}
          <div className="retro-block">
            <div className="retro-block__title">{rankingTitle}</div>
            {rankingRows.length === 0 ? (
              <p className="retro-block__text">{rankingEmptyText}</p>
            ) : (
              <ol className="retro-ranking">
                {rankingRows.map((entry, index) => {
                  const isSelf = entry.participantId === currentParticipantId;

                  return (
                    <li
                      key={entry.participantId}
                      className={`retro-ranking__row${isSelf ? ' retro-ranking__row--self' : ''}`}
                    >
                      <span className="retro-ranking__rank">{index + 1}</span>
                      <span className="retro-ranking__who">
                        {entry.nickname}
                        {isSelf && ' (나)'}
                        {entry.left && ' (나감)'}
                        {isGameMode && index === 0 && ' · 우승'}
                      </span>
                      <span className="retro-ranking__minutes">{entry.valueText}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Actions */}
          <div className="retro__actions">
            <button type="button" className="btn btn--ghost" onClick={onGoHome}>
              홈으로
            </button>
            <button type="button" className="btn btn--primary" onClick={onRestartSession}>
              {restartLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
