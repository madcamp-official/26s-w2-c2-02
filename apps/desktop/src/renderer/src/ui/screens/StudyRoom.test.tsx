import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DailyParticipantMedia,
  formatSessionTime,
  participantsInStudyRoom,
  reconcilePendingCameraState,
  remainingSessionSeconds
} from './StudyRoom';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('StudyRoom session clock', () => {
  it('shows only participants who actually entered the study room', () => {
    const participant = (id: string, status: 'online' | 'focused') => ({
      id,
      roomId: 'room-1',
      userId: `user-${id}`,
      nickname: id,
      role: 'member' as const,
      status,
      isReady: false,
      scoreVisible: true,
      joinedAt: '2026-07-13T00:00:00.000Z',
      lastSeenAt: '2026-07-13T00:00:00.000Z'
    });

    expect(
      participantsInStudyRoom([participant('waiting', 'online'), participant('studying', 'focused')])
    ).toMatchObject([{ id: 'studying' }]);
  });

  it('derives the remaining time from the server session start time', () => {
    const startedAt = '2026-07-13T00:00:00.000Z';
    const timestamp = Date.parse(startedAt) + 12 * 60_000 + 18_400;

    expect(
      remainingSessionSeconds(
        { id: 'session-1', roomId: 'room-1', startedAt, plannedMinutes: 50, mode: 'study' },
        timestamp
      )
    ).toBe(2_262);
    expect(formatSessionTime(2_262)).toBe('37:42');
  });

  it('does not show a negative duration after the session ends', () => {
    expect(
      remainingSessionSeconds(
        {
          id: 'session-1',
          roomId: 'room-1',
          startedAt: '2026-07-13T00:00:00.000Z',
          plannedMinutes: 1,
          mode: 'study'
        },
        Date.parse('2026-07-13T00:02:00.000Z')
      )
    ).toBe(0);
  });
});

describe('DailyParticipantMedia', () => {
  it('keeps the requested camera state until Daily reports the change', () => {
    expect(reconcilePendingCameraState(false, true)).toEqual({ cameraOn: true, pending: true });
    expect(reconcilePendingCameraState(true, true)).toEqual({ cameraOn: true, pending: undefined });
  });

  it('reattaches the same Daily video track when local camera is toggled back on', async () => {
    const stream = { id: 'stream-1' };
    const MediaStreamMock = vi.fn(() => stream);
    vi.stubGlobal('MediaStream', MediaStreamMock);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const staleVideoTrack = { id: 'stale-video-track' } as unknown as MediaStreamTrack;
    const videoTrack = { id: 'video-track-1' } as unknown as MediaStreamTrack;
    const participant = {
      tracks: {
        video: { state: 'playable', track: videoTrack, persistentTrack: staleVideoTrack }
      }
    };

    const { rerender } = render(
      <DailyParticipantMedia
        fallbackInitial="나"
        isCameraOn
        isMe
        participant={participant}
      />
    );
    const firstVideo = screen.getByLabelText('내 웹캠 미리보기') as HTMLVideoElement;
    await waitFor(() => expect(firstVideo.srcObject).toBe(stream));

    rerender(
      <DailyParticipantMedia
        fallbackInitial="나"
        isCameraOn={false}
        isMe
        participant={participant}
      />
    );
    expect(screen.getByText('나')).toBeInTheDocument();

    rerender(
      <DailyParticipantMedia
        fallbackInitial="나"
        isCameraOn
        isMe
        participant={participant}
      />
    );
    const secondVideo = screen.getByLabelText('내 웹캠 미리보기') as HTMLVideoElement;
    await waitFor(() => expect(secondVideo.srcObject).toBe(stream));
    expect(MediaStreamMock).toHaveBeenCalledWith([videoTrack]);
  });
});
