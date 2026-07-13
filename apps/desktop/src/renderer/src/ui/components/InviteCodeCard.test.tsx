import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InviteCodeCard } from './InviteCodeCard';

describe('InviteCodeCard', () => {
  it('shows a formatted code and copies its normalized value', async () => {
    const writeText = vi.fn();
    window.roomi = { ...window.roomi, clipboard: { writeText } };
    render(<InviteCodeCard inviteCode="ABCDEF" />);

    expect(screen.getByText('ABC-DEF')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '코드 복사' }));

    expect(writeText).toHaveBeenCalledWith('ABCDEF');
    expect(await screen.findByRole('button', { name: '복사됨' })).toBeInTheDocument();
  });
});
