import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingCreate } from './OnboardingCreate';

describe('OnboardingCreate keyboard navigation', () => {
  it('moves through choices with arrows and activates with Enter', () => {
    const go = vi.fn();
    render(<OnboardingCreate nickname="소요" go={go} />);
    const create = screen.getByRole('button', { name: /새로운 방 만들기/ });
    const join = screen.getByRole('button', { name: /방 코드로 입장하기/ });

    expect(create).toHaveFocus();
    fireEvent.keyDown(create, { key: 'ArrowDown' });
    expect(join).toHaveFocus();
    fireEvent.keyDown(join, { key: 'Enter' });

    expect(go).toHaveBeenCalledWith('onboarding-join');
  });
});
