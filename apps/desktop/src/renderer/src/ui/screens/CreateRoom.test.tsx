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

  it('submits the selected face party game with room settings', () => {
    const onCreateRoom = vi.fn();

    render(<CreateRoom go={vi.fn()} onCreateRoom={onCreateRoom} />);

    fireEvent.click(screen.getByRole('button', { name: /게임 2 · 포커페이스 블러프/ }));
    expect(screen.getByText('맞힌 베팅은 4점')).toBeInTheDocument();
    expect(screen.queryByText('방 전체 휴식')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '방 만들고 대기실로 가기' }));

    expect(onCreateRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        activityKind: 'poker_bluff',
        defaultGameKind: 'poker_bluff'
      })
    );
  });
});
