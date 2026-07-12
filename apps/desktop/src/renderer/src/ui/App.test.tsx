import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('lets the study room toggle local microphone and camera tracks', async () => {
    const audioTrack = { enabled: true, stop: vi.fn() };
    const videoTrack = { enabled: true, stop: vi.fn() };
    const stream = {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [videoTrack],
      getTracks: () => [audioTrack, videoTrack]
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream)
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '스터디룸' }));

    await screen.findByLabelText('내 웹캠 미리보기');

    fireEvent.click(screen.getByRole('button', { name: '마이크 끄기' }));
    expect(audioTrack.enabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '마이크 켜기' }));
    expect(audioTrack.enabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '카메라 끄기' }));
    expect(videoTrack.enabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '카메라 켜기' }));
    expect(videoTrack.enabled).toBe(true);
    expect(screen.getByLabelText('내 웹캠 미리보기')).toBeInTheDocument();
  });
});
