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

  it('creates a local room after nickname, room settings, and media permission', async () => {
    const audioTrack = { stop: vi.fn() };
    const videoTrack = { stop: vi.fn() };
    const stream = {
      getTracks: () => [audioTrack, videoTrack]
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream)
      }
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.2345);

    render(<App />);

    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '소요' } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByText(/소요님/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /새로운 방 만들기/ }));

    fireEvent.click(screen.getByRole('button', { name: '25분' }));
    fireEvent.click(screen.getByRole('button', { name: '방 만들고 대기실로 가기' }));

    expect(screen.getByRole('heading', { level: 1, name: '카메라와 마이크를 확인할게요' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '권한 확인하고 입장' }));

    await screen.findByRole('heading', { level: 1, name: '다 같이 목표를 정해볼까요?' });
    expect(screen.getByText('대기실 · 방 코드 3110')).toBeInTheDocument();
    expect(screen.getByText('소요')).toBeInTheDocument();
    expect(screen.getByText('1 / 4명 준비완료')).toBeInTheDocument();
    expect(audioTrack.stop).toHaveBeenCalled();
    expect(videoTrack.stop).toHaveBeenCalled();
  });

  it('keeps session end behind host-only actions', async () => {
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
    vi.spyOn(Math, 'random').mockReturnValue(0.2345);

    render(<App />);

    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '소요' } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: /새로운 방 만들기/ }));
    fireEvent.click(screen.getByRole('button', { name: '방 만들고 대기실로 가기' }));
    fireEvent.click(screen.getByRole('button', { name: '권한 확인하고 입장' }));
    await screen.findByRole('heading', { level: 1, name: '다 같이 목표를 정해볼까요?' });
    fireEvent.click(screen.getByRole('button', { name: '세션 시작하기' }));
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

    fireEvent.click(screen.getByRole('button', { name: '방장 메뉴' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '세션 종료' }));
    expect(screen.getByRole('dialog', { name: '세션 종료 확인' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '세션 종료' }));

    expect(
      screen.getByRole('heading', { level: 1, name: '오늘 세션, 잘 마쳤어요!' })
    ).toBeInTheDocument();
  });

  it('does not show host actions for users who join by room code', async () => {
    const stream = {
      getTracks: () => [{ stop: vi.fn() }]
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream)
      }
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '민지' } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: /방 코드로 입장하기/ }));
    fireEvent.change(screen.getByLabelText('방 코드'), { target: { value: '4821' } });
    fireEvent.click(screen.getByRole('button', { name: '입장하기' }));
    fireEvent.click(screen.getByRole('button', { name: '권한 확인하고 입장' }));
    await screen.findByRole('heading', { level: 1, name: '다 같이 목표를 정해볼까요?' });
    fireEvent.click(screen.getByRole('button', { name: '세션 시작하기' }));

    await screen.findByLabelText('내 웹캠 미리보기');
    expect(screen.queryByRole('button', { name: '방장 메뉴' })).not.toBeInTheDocument();
  });
});
