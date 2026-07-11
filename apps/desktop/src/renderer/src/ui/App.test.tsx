import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App renderer shell', () => {
  it('shows the study room heading, invite code, participant area, and controls', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: '루미' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Q4M2XD/ })).toBeInTheDocument();
    expect(screen.getByLabelText('참가자 영상 영역')).toBeInTheDocument();
    expect(screen.getByText('42:18')).toBeInTheDocument();

    const goals = screen.getByRole('heading', { level: 2, name: '오늘 목표' }).closest('.goal-list');
    expect(goals).not.toBeNull();
    expect(within(goals as HTMLElement).getByText('Socket.IO 방 상태 동기화')).toBeInTheDocument();
    expect(within(goals as HTMLElement).getByText('대기실 화면 흐름 다듬기')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '마이크' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '카메라' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '휴식' })).toBeInTheDocument();
  });
});
