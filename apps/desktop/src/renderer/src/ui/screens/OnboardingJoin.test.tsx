import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingJoin } from './OnboardingJoin';

function baseProps() {
  return {
    code: '',
    onCodeChange: vi.fn(),
    onJoin: vi.fn(),
    go: vi.fn()
  };
}

describe('OnboardingJoin', () => {
  it('normalizes room code input to supported uppercase characters', () => {
    const props = baseProps();
    render(<OnboardingJoin {...props} />);

    fireEvent.change(screen.getByLabelText('방 코드'), {
      target: { value: '한abc-0l2' }
    });

    expect(props.onCodeChange).toHaveBeenCalledWith('ABC2');
  });

  it('marks the active code slot while focused', () => {
    render(<OnboardingJoin {...baseProps()} code="AB" />);

    fireEvent.focus(screen.getByLabelText('방 코드'));

    const slots = screen.getByLabelText('방 코드').nextElementSibling?.querySelectorAll(
      '.code-entry__slot'
    );
    expect(slots?.[2]).toHaveClass('code-entry__slot--active');
  });
});
