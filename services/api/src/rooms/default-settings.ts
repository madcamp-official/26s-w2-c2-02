import type { RoomSettings } from '@roomi/shared';

export const defaultRoomSettings: RoomSettings = {
  sessionMinutes: 50,
  breakMode: 'room',
  defaultScoreVisibility: 'public',
  maxParticipants: 4,
  authMode: 'nickname_code',
  videoProvider: 'daily',
  roomiTone: 'friendly_casual',
  rankingMetric: 'focus_minutes',
  videoRequired: true,
  detectionPauseAllowed: true
};
