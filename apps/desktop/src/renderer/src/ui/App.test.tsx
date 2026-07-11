import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App screen router', () => {
  it('starts on the nickname onboarding screen', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { level: 1, name: '어떻게 부르면 될까요?' })
    ).toBeInTheDocument();
  });

  it('lets the dev switcher jump to the waiting room', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '대기실' }));

    expect(
      screen.getByRole('heading', { level: 1, name: '다 같이 목표를 정해볼까요?' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '함께하는 사람들' })).toBeInTheDocument();
  });

  it('renders the retrospective summary via the dev switcher', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '회고' }));

    expect(
      screen.getByRole('heading', { level: 1, name: '오늘 세션, 잘 마쳤어요!' })
    ).toBeInTheDocument();
    expect(screen.getByText('42분')).toBeInTheDocument();
  });
});
