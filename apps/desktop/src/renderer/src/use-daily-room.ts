import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import type { VideoJoinInfo } from '@roomi/shared';

export type DailyRoomState = {
  callObject?: DailyCall;
  localMedia: {
    audio: boolean;
    video: boolean;
  };
  participantsByRoomiId: Map<string, DailyParticipant>;
  status: 'idle' | 'joining' | 'joined' | 'error';
};

export function useDailyRoom(videoJoin: VideoJoinInfo | undefined) {
  const [callObject, setCallObject] = useState<DailyCall>();
  const [dailyParticipants, setDailyParticipants] = useState<Record<string, DailyParticipant>>({});
  const [localMedia, setLocalMedia] = useState<DailyRoomState['localMedia']>({
    audio: true,
    video: true
  });
  const [status, setStatus] = useState<DailyRoomState['status']>('idle');
  const [connectionGeneration, setConnectionGeneration] = useState(0);
  const restart = useCallback(() => {
    setConnectionGeneration((generation) => generation + 1);
  }, []);

  useEffect(() => {
    if (!videoJoin) {
      setCallObject(undefined);
      setDailyParticipants({});
      setStatus('idle');
      return undefined;
    }

    let cancelled = false;
    let call: DailyCall | undefined;
    let syncInterval: number | undefined;

    const syncParticipants = () => {
      if (call) {
        setDailyParticipants({ ...call.participants() });
        setLocalMedia({
          audio: call.localAudio(),
          video: call.localVideo()
        });
      }
    };

    setStatus('joining');

    void import('@daily-co/daily-js')
      .then(({ default: DailyIframe }) => {
        if (cancelled) {
          return undefined;
        }

        call = DailyIframe.createCallObject({
          dailyConfig: {
            avoidEval: true
          },
          subscribeToTracksAutomatically: true
        });

        call.on('joined-meeting', syncParticipants);
        call.on('participant-joined', syncParticipants);
        call.on('participant-updated', syncParticipants);
        call.on('participant-left', syncParticipants);
        call.on('track-started', syncParticipants);
        call.on('track-stopped', syncParticipants);
        call.on('show-local-video-changed', syncParticipants);
        call.on('camera-error', (event) => {
          console.error('Daily camera error:', event);
          setStatus('error');
        });
        call.on('error', (event) => {
          console.error('Daily fatal error:', event);
          setStatus('error');
        });
        call.on('nonfatal-error', (event) => {
          console.error('Daily nonfatal error:', event);
        });

        setCallObject(call);

        return call.join({
          startAudioOff: false,
          startVideoOff: false,
          url: videoJoin.roomUrl,
          token: videoJoin.token
        });
      })
      .then(() => {
        if (!cancelled) {
          syncParticipants();
          syncInterval = window.setInterval(syncParticipants, 1_000);
          setStatus('joined');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Daily join failed:', error);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      call?.off('joined-meeting', syncParticipants);
      call?.off('participant-joined', syncParticipants);
      call?.off('participant-updated', syncParticipants);
      call?.off('participant-left', syncParticipants);
      call?.off('track-started', syncParticipants);
      call?.off('track-stopped', syncParticipants);
      call?.off('show-local-video-changed', syncParticipants);
      if (syncInterval) window.clearInterval(syncInterval);
      void call?.leave().finally(() => call?.destroy());
      setCallObject(undefined);
      setDailyParticipants({});
      setLocalMedia({ audio: true, video: true });
    };
  }, [videoJoin?.roomUrl, videoJoin?.token, connectionGeneration]);

  const participantsByRoomiId = useMemo(() => {
    const byRoomiId = new Map<string, DailyParticipant>();

    Object.values(dailyParticipants).forEach((participant) => {
      if (participant.user_id) {
        byRoomiId.set(participant.user_id, participant);
      }
    });

    return byRoomiId;
  }, [dailyParticipants]);

  return {
    callObject,
    localMedia,
    participantsByRoomiId,
    status,
    restart
  };
}
