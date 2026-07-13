import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Goal, Participant, Room, RoomStatus } from '@roomi/shared';
import { WaitingRoom } from './WaitingRoom';

function room(status: RoomStatus = 'waiting'): Room {
  return {
    id: 'room-1',
    inviteCode: 'ABCDEF',
    hostUserId: 'user-host',
    settings: {
      sessionMinutes: 50,
      breakMode: 'room',
      defaultScoreVisibility: 'public',
      maxParticipants: 4,
      authMode: 'nickname_code',
      videoProvider: 'daily',
      roomiTone: 'friendly_casual',
      rankingMetric: 'focus_minutes',
      videoRequired: true,
      detectionPauseAllowed: true
    },
    status,
    createdAt: new Date().toISOString()
  };
}

function participant(overrides: Partial<Participant> & Pick<Participant, 'id' | 'nickname'>): Participant {
  const now = new Date().toISOString();
  return {
    roomId: 'room-1',
    userId: `user-${overrides.id}`,
    role: 'member',
    status: 'online',
    isReady: false,
    scoreVisible: true,
    joinedAt: now,
    lastSeenAt: now,
    ...overrides
  };
}

function baseProps() {
  return {
    go: vi.fn(),
    room: room(),
    participants: [
      participant({ id: 'p-host', nickname: '소요', role: 'host', isReady: true }),
      participant({ id: 'p-2', nickname: '채훈', isReady: true }),
      participant({ id: 'p-3', nickname: '민지', isReady: false })
    ] as Participant[],
    goals: [] as Goal[],
    currentParticipantId: 'p-host',
    isHost: true,
    onToggleReady: vi.fn(),
    onSubmitGoal: vi.fn(),
    onStartSession: vi.fn(),
    onJoinSession: vi.fn()
  };
}

describe('WaitingRoom', () => {
  it('shows the real ready count from isReady flags', () => {
    render(<WaitingRoom {...baseProps()} />);

    expect(screen.getByText('2 / 4명 준비완료')).toBeInTheDocument();
  });

  it('lets the host start the session', () => {
    const props = baseProps();
    render(<WaitingRoom {...props} />);

    const startButton = screen.getByRole('button', { name: '세션 시작하기' });
    fireEvent.click(startButton);

    expect(props.onStartSession).toHaveBeenCalledTimes(1);
  });

  it('hides the start button from members and shows a waiting message', () => {
    const props = { ...baseProps(), isHost: false, currentParticipantId: 'p-3' };
    render(<WaitingRoom {...props} />);

    expect(screen.queryByRole('button', { name: '세션 시작하기' })).not.toBeInTheDocument();
    expect(screen.getByText('방장이 시작하기를 기다리고 있어요.')).toBeInTheDocument();
  });

  it('renders the in-progress mode for a studying room with a join CTA', () => {
    const props = { ...baseProps(), isHost: false, currentParticipantId: 'p-3', room: room('studying') };
    render(<WaitingRoom {...props} />);

    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(screen.getByText('이미 공부 중이에요')).toBeInTheDocument();
    const joinButton = screen.getByRole('button', { name: '합류하기' });
    fireEvent.click(joinButton);
    expect(props.onJoinSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '세션 시작하기' })).not.toBeInTheDocument();
  });

  it('submits the typed goal', () => {
    const props = baseProps();
    render(<WaitingRoom {...props} />);

    fireEvent.change(screen.getByLabelText('내 목표'), {
      target: { value: '미적분 3단원' }
    });
    fireEvent.click(screen.getByRole('button', { name: '목표 저장' }));

    expect(props.onSubmitGoal).toHaveBeenCalledWith('미적분 3단원');
  });
});
