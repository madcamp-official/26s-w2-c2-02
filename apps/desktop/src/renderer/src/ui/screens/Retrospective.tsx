import { RoomiMascot } from '../components/RoomiMascot';
import type { Goal, Participant, StudySession } from '@roomi/shared';
import type { ScreenProps } from './types';

interface RetrospectiveProps extends ScreenProps {
  session?: StudySession;
  goals: Goal[];
  participants: Participant[];
  currentParticipantId: string;
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
  goals,
  participants,
  currentParticipantId
}: RetrospectiveProps) {
  const plannedMinutes = session?.plannedMinutes ?? 50;
  const focusMinutes = session?.summary?.focusMinutes ?? fallbackFocusMinutes(session);
  const focusPercent =
    plannedMinutes > 0 ? Math.round((focusMinutes / plannedMinutes) * 100) : 0;

  const myGoal = goals.find((goal) => goal.participantId === currentParticipantId);
  const goalAchieved = myGoal?.achieved ?? false;
  const goalNote = myGoal?.refinedText ?? myGoal?.rawText ?? '등록된 목표가 없어요.';

  const goalFeedback =
    session?.summary?.goalFeedback ?? '자세한 목표 피드백은 다음 세션부터 더 정확하게 보여줄게요.';
  const lumiComment =
    session?.summary?.lumiComment ?? '오늘도 수고했어! 다음에도 같이 집중해보자.';

  const ranking = session?.summary?.ranking ?? [];

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
                      <span className="retro-ranking__minutes">{entry.focusMinutes}분</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Actions */}
          <div className="retro__actions">
            <button type="button" className="btn btn--ghost" onClick={() => go('onboarding-nickname')}>
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
