import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameSession, Participant } from '@roomi/shared';
import { Retrospective } from './Retrospective';

describe('Retrospective', () => {
  it('shows the latest collected focus ranking when leaving before a server summary exists', () => {
    const onHome = vi.fn();

    render(
      <Retrospective
        currentParticipantId="participant-host"
        focusRanking={[
          {
            participantId: 'participant-host',
            focusMinutes: 12,
            score: 144,
            nickname: 'Host',
            left: false
          }
        ]}
        focusReport={{
          ready: true,
          observedMinutes: 12,
          eyesClosedRatio: 0.18,
          blinksPerMinute: 24,
          yawnsPerHour: 3,
          headTurnsPerHour: 4,
          awaysPerHour: 1,
          gazeDiversionsPerHour: 5,
          restlessness: 30,
          fatigue: 64,
          distraction: 48,
          restSuggested: true
        }}
        goals={[]}
        go={vi.fn()}
        onHome={onHome}
        participants={[participant('participant-host', 'Host')]}
        session={{
          id: 'session-1',
          roomId: 'room-1',
          startedAt: '2026-07-15T00:00:00.000Z',
          endedAt: '2026-07-15T00:12:00.000Z',
          plannedMinutes: 50,
          mode: 'ended'
        }}
      />
    );

    expect(screen.getAllByText('12분').length).toBeGreaterThan(0);
    expect(screen.getAllByText('144점').length).toBeGreaterThan(0);
    expect(screen.getByText('피로도')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('산만함')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText('집중 신호 요약')).toBeInTheDocument();
    expect(screen.getByText('18%')).toBeInTheDocument();
    expect(screen.getByText('24회/분')).toBeInTheDocument();
    expect(screen.getByText('3회/시간')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '홈으로' }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('shows game results when a game session exists', () => {
    const participants = [
      participant('participant-host', 'Host'),
      participant('participant-member', 'Member')
    ];
    const currentGame: GameSession = {
      id: 'game-1',
      roomId: 'room-1',
      kind: 'hidden_mission',
      status: 'reveal',
      round: {
        id: 'round-1',
        gameId: 'game-1',
        index: 1,
        status: 'reveal',
        startedAt: '2026-07-15T00:00:00.000Z',
        revealAt: '2026-07-15T00:01:00.000Z'
      },
      totalRounds: 3,
      scores: [
        { participantId: 'participant-host', points: 10 },
        { participantId: 'participant-member', points: 4 }
      ],
      missions: [
        {
          id: 'mission-1',
          playerId: 'participant-host',
          prompt: '윙크 4번 하기',
          verify: 'wink_count',
          target: 4
        }
      ],
      missionResults: [],
      completedRounds: [
        {
          roundIndex: 1,
          status: 'revealed',
          endedAt: '2026-07-15T00:01:00.000Z',
          scores: [
            { participantId: 'participant-host', points: 10 },
            { participantId: 'participant-member', points: 4 }
          ],
          missionResults: [
            {
              playerId: 'participant-host',
              missionId: 'mission-1',
              count: 4,
              success: true
            }
          ]
        }
      ],
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:01:00.000Z'
    };

    render(
      <Retrospective
        currentGame={currentGame}
        currentParticipantId="participant-host"
        goals={[]}
        go={vi.fn()}
        participants={participants}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: '숨은 표정 미션 결과' })).toBeInTheDocument();
    expect(screen.getByText('우승자')).toBeInTheDocument();
    expect(screen.getAllByText('Host').length).toBeGreaterThan(0);
    expect(screen.getByText('라운드별 결과')).toBeInTheDocument();
    expect(screen.getByText('윙크 4번 하기')).toBeInTheDocument();
  });
});

function participant(id: string, nickname: string): Participant {
  return {
    id,
    roomId: 'room-1',
    userId: `user-${id}`,
    nickname,
    role: id === 'participant-host' ? 'host' : 'member',
    status: 'focused',
    isReady: true,
    scoreVisible: true,
    joinedAt: '2026-07-15T00:00:00.000Z',
    lastSeenAt: '2026-07-15T00:00:00.000Z'
  };
}
