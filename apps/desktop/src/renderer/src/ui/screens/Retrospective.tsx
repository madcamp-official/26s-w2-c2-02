import { RoomiMascot } from '../components/RoomiMascot';
import type {
  FocusRankingEntry,
  GameScore,
  GameSession,
  Goal,
  Participant,
  StudySession
} from '@roomi/shared';
import type { ScreenProps } from './types';

interface RetrospectiveProps extends ScreenProps {
  session?: StudySession;
  currentGame?: GameSession;
  goals: Goal[];
  participants: Participant[];
  currentParticipantId: string;
  focusRanking?: FocusRankingEntry[];
  onHome?: () => void;
}

function fallbackFocusMinutes(session?: StudySession): number {
  if (!session) return 0;
  const startedAtMs = Date.parse(session.startedAt);
  const endedAtMs = session.endedAt ? Date.parse(session.endedAt) : Date.now();
  const elapsedMinutes = Math.max(0, (endedAtMs - startedAtMs) / 60_000);
  return Math.round(Math.min(elapsedMinutes, session.plannedMinutes));
}

/** Retrospective · 세션 회고 (Figma 72:41). */
export function Retrospective({
  go,
  session,
  currentGame,
  focusRanking = [],
  goals,
  onHome,
  participants,
  currentParticipantId
}: RetrospectiveProps) {
  if (currentGame) {
    return (
      <GameRetrospective
        currentGame={currentGame}
        currentParticipantId={currentParticipantId}
        go={go}
        onHome={onHome}
        participants={participants}
      />
    );
  }

  const plannedMinutes = session?.plannedMinutes ?? 50;
  const ranking = session?.summary?.ranking ?? focusRanking;
  // The headline sits next to this participant's own goal, so it has to be their
  // tracked minutes. summary.focusMinutes is the room average and would contradict
  // the ranking row below for anyone who was not the most focused person here.
  const myFocusMinutes = ranking.find(
    (entry) => entry.participantId === currentParticipantId
  )?.focusMinutes;
  const focusMinutes =
    myFocusMinutes ?? session?.summary?.focusMinutes ?? fallbackFocusMinutes(session);
  const focusPercent =
    plannedMinutes > 0 ? Math.min(100, Math.round((focusMinutes / plannedMinutes) * 100)) : 0;

  const myGoal = goals.find((goal) => goal.participantId === currentParticipantId);
  const goalAchieved = myGoal?.achieved ?? false;
  const goalNote = myGoal?.refinedText ?? myGoal?.rawText ?? '등록된 목표가 없어요.';

  const goalFeedback =
    session?.summary?.goalFeedback ?? '자세한 목표 피드백은 다음 세션부터 더 정확하게 보여줄게요.';
  const lumiComment =
    session?.summary?.lumiComment ?? '오늘도 수고했어! 다음에도 같이 집중해보자.';

  return (
    <div className="screen screen--app">
      <div className="retro__body">
        <div className="retro__doc">
          {/* Header */}
          <div className="retro__head">
            <RoomiMascot size={84} mood="wink" />
            <div className="retro__head-text">
              <span className="retro__badge">세션 회고</span>
              <h1 className="retro__title">오늘 세션, 잘 마쳤어요!</h1>
              <p className="retro__subtitle">
                {plannedMinutes}분 집중 세션을 함께 끝냈어요. 이번 흐름을 정리해볼게요.
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="retro__stats">
            <div className="retro-stat">
              <div className="retro-stat__label">집중 시간</div>
              <div className="retro-stat__value">{focusMinutes}분</div>
              <div className="retro-stat__note">목표의 {focusPercent}%</div>
            </div>
            <div className="retro-stat">
              <div className="retro-stat__label">목표 결과</div>
              <div className="retro-stat__value">{goalAchieved ? '달성' : '미달성'}</div>
              <div className="retro-stat__note">{goalNote}</div>
            </div>
          </div>

          {/* Lumi one-line */}
          <div className="retro__lumi">
            <div className="retro__lumi-label">루미의 한 줄 회고</div>
            <p className="retro__lumi-text">{lumiComment}</p>
          </div>

          {/* Goal feedback */}
          <div className="retro-block">
            <div className="retro-block__title">목표 피드백</div>
            <p className="retro-block__text">{goalFeedback}</p>
          </div>

          {/* Focus ranking */}
          <div className="retro-block">
            <div className="retro-block__title">집중 순위</div>
            {ranking.length === 0 ? (
              <p className="retro-block__text">집중 순위는 서버 연결 후 확인할 수 있어요.</p>
            ) : (
              <ol className="retro-ranking">
                {ranking.map((entry, index) => {
                  const participant = participants.find((p) => p.id === entry.participantId);
                  const isSelf = entry.participantId === currentParticipantId;

                  return (
                    <li
                      key={entry.participantId}
                      className={`retro-ranking__row${isSelf ? ' retro-ranking__row--self' : ''}`}
                    >
                      <span className="retro-ranking__rank">{index + 1}</span>
                      <span className="retro-ranking__who">
                        {participant?.nickname ?? entry.nickname}
                        {isSelf && ' (나)'}
                        {entry.left && ' (나감)'}
                      </span>
                      {/* The list is ordered by score, so it has to show score:
                          minutes here would look mis-sorted next to the ranks. */}
                      <span className="retro-ranking__minutes">{entry.score}점</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Actions */}
          <div className="retro__actions">
            <button type="button" className="btn btn--ghost" onClick={onHome ?? (() => go('onboarding-nickname'))}>
              홈으로
            </button>
            <button type="button" className="btn btn--primary" onClick={() => go('waiting')}>
              한 번 더 집중하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GameRetrospective({
  currentGame,
  currentParticipantId,
  go,
  onHome,
  participants
}: Pick<RetrospectiveProps, 'currentGame' | 'currentParticipantId' | 'go' | 'onHome' | 'participants'> & {
  currentGame: GameSession;
}) {
  const ranking = rankGameScores(currentGame.scores, participants);
  const myScore = currentGame.scores.find((score) => score.participantId === currentParticipantId);
  const winner = ranking[0];
  const completedRounds = currentGame.completedRounds ?? [];
  const missionById = new Map(currentGame.missions?.map((mission) => [mission.id, mission]) ?? []);

  return (
    <div className="screen screen--app">
      <div className="retro__body">
        <div className="retro__doc retro__doc--game">
          <div className="retro__head">
            <RoomiMascot size={84} mood="wink" />
            <div className="retro__head-text">
              <span className="retro__badge">게임 결과</span>
              <h1 className="retro__title">{gameLabel(currentGame.kind)} 결과</h1>
              <p className="retro__subtitle">
                {completedRounds.length || currentGame.round.index}라운드 동안 쌓인 점수와 라운드별 결과를 정리했어요.
              </p>
            </div>
          </div>

          <div className="retro__stats retro__stats--game">
            <div className="retro-stat">
              <div className="retro-stat__label">우승자</div>
              <div className="retro-stat__value">{winner?.participant.nickname ?? '아직 없음'}</div>
              <div className="retro-stat__note">{winner ? `${winner.points}점` : '완료된 라운드가 없어요.'}</div>
            </div>
            <div className="retro-stat">
              <div className="retro-stat__label">내 점수</div>
              <div className="retro-stat__value">{myScore?.points ?? 0}점</div>
              <div className="retro-stat__note">{participantName(participants, currentParticipantId)}</div>
            </div>
            <div className="retro-stat">
              <div className="retro-stat__label">진행 라운드</div>
              <div className="retro-stat__value">{completedRounds.length}/{currentGame.totalRounds}</div>
              <div className="retro-stat__note">{gameStatusLabel(currentGame.status)}</div>
            </div>
          </div>

          <div className="retro__lumi">
            <div className="retro__lumi-label">루미의 게임 회고</div>
            <p className="retro__lumi-text">
              {winner
                ? `${winner.participant.nickname}이 가장 높은 점수로 마무리했어요. 라운드별 선택과 표정 타이밍을 보면 다음 판 전략이 더 선명해질 거예요.`
                : '아직 확정된 점수가 적어요. 다음 판에서는 미션 타이밍과 지목 타이밍을 더 적극적으로 노려보세요.'}
            </p>
          </div>

          <div className="retro-block">
            <div className="retro-block__title">최종 순위</div>
            <ol className="retro-ranking">
              {ranking.map((entry) => (
                <li
                  key={entry.participant.id}
                  className={`retro-ranking__row${entry.participant.id === currentParticipantId ? ' retro-ranking__row--self' : ''}`}
                >
                  <span className="retro-ranking__rank">{entry.rank}</span>
                  <span className="retro-ranking__who">
                    {entry.participant.nickname}
                    {entry.participant.id === currentParticipantId && ' (나)'}
                  </span>
                  <span className="retro-ranking__minutes">{entry.points}점</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="retro-block">
            <div className="retro-block__title">라운드별 결과</div>
            {completedRounds.length === 0 ? (
              <p className="retro-block__text">완료된 라운드가 아직 없어요.</p>
            ) : (
              <div className="retro-rounds">
                {completedRounds.map((round) => {
                  const roundRanking = rankGameScores(round.scores, participants);
                  const roundWinner = roundRanking[0];
                  return (
                    <section className="retro-round" key={round.roundIndex}>
                      <div className="retro-round__head">
                        <strong>{round.roundIndex}라운드</strong>
                        <span>{roundWinner ? `${roundWinner.participant.nickname} ${roundWinner.points}점` : '결과 없음'}</span>
                      </div>
                      {round.missionResults && round.missionResults.length > 0 && (
                        <ul className="retro-round__missions">
                          {round.missionResults.map((result) => {
                            const mission = missionById.get(result.missionId);
                            return (
                              <li key={`${round.roundIndex}-${result.playerId}-${result.missionId}`}>
                                <span>{participantName(participants, result.playerId)}</span>
                                <b>{result.count}/{mission?.target ?? result.count}</b>
                                <small>{mission?.prompt ?? '비공개 미션'}</small>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          <div className="retro__actions">
            <button type="button" className="btn btn--ghost" onClick={onHome ?? (() => go('onboarding-nickname'))}>
              새로 시작하기
            </button>
            <button type="button" className="btn btn--primary" onClick={() => go('waiting')}>
              대기실로 돌아가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function rankGameScores(scores: GameScore[], participants: Participant[]) {
  const participantOrder = new Map(participants.map((participant, index) => [participant.id, index]));
  return scores
    .map((score) => ({
      participant: participants.find((participant) => participant.id === score.participantId) ?? {
        id: score.participantId,
        nickname: '알 수 없음'
      },
      points: score.points
    }))
    .sort(
      (left, right) =>
        right.points - left.points ||
        (participantOrder.get(left.participant.id) ?? 0) -
          (participantOrder.get(right.participant.id) ?? 0)
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function participantName(participants: Participant[], participantId: string) {
  return participants.find((participant) => participant.id === participantId)?.nickname ?? '알 수 없음';
}

function gameLabel(kind: GameSession['kind']) {
  if (kind === 'hidden_mission') return '숨은 표정 미션';
  if (kind === 'copycat_relay') return '카피캣 릴레이';
  return '포커페이스 블러프';
}

function gameStatusLabel(status: GameSession['status']) {
  if (status === 'reveal' || status === 'ended') return '게임 종료';
  if (status === 'between_round') return '라운드 사이';
  if (status === 'in_round') return '진행 중';
  return '결과 정리 중';
}
