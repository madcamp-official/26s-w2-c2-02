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
      activityKind: 'study',
      defaultGameKind: 'hidden_mission',
      sessionMinutes: 50,
      breakMode: 'room',
      breakMinutes: 10,
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
    goals: [
      { id: 'goal-host', roomId: 'room-1', participantId: 'p-host', rawText: '수학 문제집 3단원', createdAt: new Date().toISOString() },
      { id: 'goal-3', roomId: 'room-1', participantId: 'p-3', rawText: '영어 단어 100개', createdAt: new Date().toISOString() }
    ] as Goal[],
    currentParticipantId: 'p-host',
    isHost: true,
    onSubmitGoal: vi.fn(),
    onRefineGoal: vi.fn().mockResolvedValue({
      refinedText: '미적분 3단원 핵심 문제 10개 풀기',
      reason: '50분 안에 확인 가능한 목표예요.',
      source: 'template'
    }),
    onStartSession: vi.fn(),
    onJoinSession: vi.fn(),
    onLeaveRoom: vi.fn()
  };
}

describe('WaitingRoom', () => {
  it('shows participant readiness without a separate status card', () => {
    render(<WaitingRoom {...baseProps()} />);

    expect(screen.getByText('2명이 준비를 마쳤어요.')).toBeInTheDocument();
    expect(screen.getByText('공부하기')).toBeInTheDocument();
    expect(screen.queryByText('현재 현황')).not.toBeInTheDocument();
    expect(screen.queryByText('2 / 4명 준비완료')).not.toBeInTheDocument();
  });

  it('lets the host start the session', () => {
    const props = baseProps();
    render(<WaitingRoom {...props} />);

    const startButton = screen.getByRole('button', { name: '세션 시작하기' });
    fireEvent.click(startButton);

    expect(props.onStartSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /준비/ })).not.toBeInTheDocument();
  });

  it('blocks starting the session until the host has a goal', () => {
    const props = { ...baseProps(), goals: [] as Goal[] };
    render(<WaitingRoom {...props} />);

    const startButton = screen.getByRole('button', { name: '세션 시작하기' });
    expect(startButton).toBeDisabled();
    expect(screen.getByText('먼저 목표를 적어야 시작할 수 있어요.')).toBeInTheDocument();
    expect(props.onStartSession).not.toHaveBeenCalled();
  });

  it('blocks joining an in-progress session until the member has a goal', () => {
    const props = {
      ...baseProps(),
      goals: [] as Goal[],
      isHost: false,
      currentParticipantId: 'p-3',
      room: room('studying')
    };
    render(<WaitingRoom {...props} />);

    const joinButton = screen.getByRole('button', { name: '스터디룸 참여하기' });
    expect(joinButton).toBeDisabled();
    expect(screen.getByText('먼저 목표를 적어야 참여할 수 있어요.')).toBeInTheDocument();
    expect(props.onJoinSession).not.toHaveBeenCalled();
  });

  it('locks the start action synchronously to prevent duplicate requests', () => {
    const props = baseProps();
    render(<WaitingRoom {...props} />);
    const startButton = screen.getByRole('button', { name: '세션 시작하기' });

    fireEvent.click(startButton);
    fireEvent.click(startButton);

    expect(props.onStartSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '방 생성중' })).toBeDisabled();
  });

  it('keeps the creating state when the studying snapshot arrives before navigation', () => {
    const props = baseProps();
    const { rerender } = render(<WaitingRoom {...props} />);

    fireEvent.click(screen.getByRole('button', { name: '세션 시작하기' }));
    rerender(<WaitingRoom {...props} room={room('studying')} />);

    expect(screen.getByRole('button', { name: '방 생성중' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '스터디룸 참여하기' })).not.toBeInTheDocument();
  });

  it('provides a separate control for leaving the room', () => {
    const props = baseProps();
    render(<WaitingRoom {...props} />);

    fireEvent.click(screen.getByRole('button', { name: '방 나가기' }));

    expect(props.onLeaveRoom).toHaveBeenCalledTimes(1);
  });

  it('hides the start button from members and shows a waiting message', () => {
    const props = { ...baseProps(), isHost: false, currentParticipantId: 'p-3' };
    render(<WaitingRoom {...props} />);

    expect(screen.queryByRole('button', { name: '세션 시작하기' })).not.toBeInTheDocument();
    expect(screen.getByText('방장이 세션을 시작하면 참여 버튼이 열려요.')).toBeInTheDocument();
  });

  it('renders the in-progress mode for a studying room with a join CTA', () => {
    const initial = baseProps();
    const props = {
      ...initial,
      isHost: false,
      currentParticipantId: 'p-3',
      room: room('studying'),
      participants: initial.participants.map((candidate) =>
        candidate.id === 'p-host' ? { ...candidate, status: 'focused' as const } : candidate
      )
    };
    render(<WaitingRoom {...props} />);

    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(screen.getByText('이미 공부 중이에요')).toBeInTheDocument();
    expect(screen.getByText('준비 중')).toBeInTheDocument();
    expect(screen.getByText('공부 중')).toBeInTheDocument();
    expect(screen.queryByText('초대 대기중')).not.toBeInTheDocument();
    const joinButton = screen.getByRole('button', { name: '스터디룸 참여하기' });
    fireEvent.click(joinButton);
    expect(props.onJoinSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '세션 시작하기' })).not.toBeInTheDocument();
  });

  it('locks the study-room join action synchronously to prevent duplicate entry', () => {
    const props = { ...baseProps(), isHost: false, currentParticipantId: 'p-3', room: room('studying') };
    render(<WaitingRoom {...props} />);
    const joinButton = screen.getByRole('button', { name: '스터디룸 참여하기' });

    fireEvent.click(joinButton);
    fireEvent.click(joinButton);

    expect(props.onJoinSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '입장 중' })).toBeDisabled();
  });

  it('submits the typed goal', () => {
    const props = baseProps();
    render(<WaitingRoom {...props} />);

    fireEvent.change(screen.getByLabelText('내 목표'), {
      target: { value: '미적분 3단원' }
    });
    fireEvent.blur(screen.getByLabelText('내 목표'));

    expect(props.onSubmitGoal).toHaveBeenCalledWith('미적분 3단원');
  });

  it('requests a Roomi refinement and saves the accepted suggestion', async () => {
    const props = baseProps();
    render(<WaitingRoom {...props} />);

    fireEvent.change(screen.getByLabelText('내 목표'), {
      target: { value: '미적분 3단원' }
    });
    fireEvent.click(screen.getByRole('button', { name: '루미에게 다듬기' }));

    expect(await screen.findByText('미적분 3단원 핵심 문제 10개 풀기')).toBeInTheDocument();
    expect(props.onRefineGoal).toHaveBeenCalledWith('미적분 3단원');
    fireEvent.click(screen.getByRole('button', { name: '이 목표로 저장' }));

    expect(props.onSubmitGoal).toHaveBeenCalledWith('미적분 3단원 핵심 문제 10개 풀기');
  });
});
