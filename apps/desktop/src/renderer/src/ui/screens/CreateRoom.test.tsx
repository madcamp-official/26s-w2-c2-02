import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateRoom } from './CreateRoom';

describe('CreateRoom game setup', () => {
  it('submits study mode by default', () => {
    const onCreateRoom = vi.fn();

    render(<CreateRoom go={vi.fn()} onCreateRoom={onCreateRoom} />);

    expect(screen.getByText('방 전체 휴식')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '방 만들고 대기실로 가기' }));

    expect(onCreateRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        activityKind: 'study',
        defaultGameKind: 'hidden_mission'
      })
    );
  });

  it('submits copycat relay as game 2 with room settings', () => {
    const onCreateRoom = vi.fn();

    render(<CreateRoom go={vi.fn()} onCreateRoom={onCreateRoom} />);

    fireEvent.click(screen.getByRole('button', { name: /게임 2 · 카피캣 릴레이/ }));
    expect(screen.getByText('유사도에 따라 최대 10점')).toBeInTheDocument();
    expect(screen.queryByText('방 전체 휴식')).not.toBeInTheDocument();
    expect(screen.getByText('라운드 수')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '5라운드' }));

    fireEvent.click(screen.getByRole('button', { name: '방 만들고 대기실로 가기' }));

    expect(onCreateRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        activityKind: 'copycat_relay',
        defaultGameKind: 'copycat_relay',
        roundCount: 5
      })
    );
  });

  it('keeps game 3 unavailable for the next update', () => {
    const onCreateRoom = vi.fn();

    render(<CreateRoom go={vi.fn()} onCreateRoom={onCreateRoom} />);

    fireEvent.click(screen.getByRole('button', { name: /게임 3 · 포커페이스 블러프/ }));
    expect(screen.getByText('다음 업데이트를 기다려주세요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '방 만들고 대기실로 가기' }));

    expect(onCreateRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        activityKind: 'study',
        defaultGameKind: 'hidden_mission'
      })
    );
  });
});
