import { useEffect, useMemo, useState } from 'react';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import type { VideoJoinInfo } from '@roomi/shared';

export type DailyRoomState = {
  callObject?: DailyCall;
  participantsByRoomiId: Map<string, DailyParticipant>;
  status: 'idle' | 'joining' | 'joined' | 'error';
};

export function useDailyRoom(videoJoin: VideoJoinInfo | undefined) {
  const [callObject, setCallObject] = useState<DailyCall>();
  const [dailyParticipants, setDailyParticipants] = useState<Record<string, DailyParticipant>>({});
  const [status, setStatus] = useState<DailyRoomState['status']>('idle');

  useEffect(() => {
    if (!videoJoin) {
      setCallObject(undefined);
      setDailyParticipants({});
      setStatus('idle');
      return undefined;
    }

    let cancelled = false;
    let call: DailyCall | undefined;

    const syncParticipants = () => {
      if (call) {
        setDailyParticipants(call.participants());
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
          url: videoJoin.roomUrl,
          token: videoJoin.token
        });
      })
      .then(() => {
        if (!cancelled) {
          syncParticipants();
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
      void call?.leave().finally(() => call?.destroy());
      setCallObject(undefined);
      setDailyParticipants({});
    };
  }, [videoJoin?.roomUrl, videoJoin?.token]);

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
    participantsByRoomiId,
    status
  };
}
