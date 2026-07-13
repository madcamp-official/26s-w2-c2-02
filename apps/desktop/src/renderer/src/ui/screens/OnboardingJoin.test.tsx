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

function roomCodeInput() {
  return screen.getByRole('textbox');
}

describe('OnboardingJoin', () => {
  it('normalizes room code input to supported uppercase characters', () => {
    const props = baseProps();
    render(<OnboardingJoin {...props} />);

    fireEvent.change(roomCodeInput(), {
      target: { value: '한abc-0l2' }
    });

    expect(props.onCodeChange).toHaveBeenCalledWith('GKSABC');
  });

  it('accepts Korean keyboard input as the matching English room code', () => {
    const props = baseProps();
    render(<OnboardingJoin {...props} />);

    fireEvent.change(roomCodeInput(), {
      target: { value: 'ㅁㅠㅊㅇㄷㄹ' }
    });

    expect(props.onCodeChange).toHaveBeenCalledWith('ABCDEF');
  });

  it('waits for Korean IME composition to finish before committing the code', () => {
    const props = baseProps();
    render(<OnboardingJoin {...props} />);
    const input = roomCodeInput();

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'ㅁ' } });
    fireEvent.change(input, { target: { value: '마' } });

    expect(props.onCodeChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('마');

    fireEvent.compositionEnd(input, { data: '마' });

    expect(props.onCodeChange).toHaveBeenCalledTimes(1);
    expect(props.onCodeChange).toHaveBeenCalledWith('AK');
    expect(input).toHaveValue('AK');
  });

  it('marks the active code slot while focused', () => {
    render(<OnboardingJoin {...baseProps()} code="AB" />);

    fireEvent.focus(roomCodeInput());

    const slots = roomCodeInput().nextElementSibling?.querySelectorAll('.code-entry__slot');
    expect(slots?.[2]).toHaveClass('code-entry__slot--active');
  });
});
