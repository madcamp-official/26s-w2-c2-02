import type { RoomSettings } from '@lumi/shared';

export const defaultRoomSettings: RoomSettings = {
  sessionMinutes: 50,
  breakMode: 'room',
  defaultScoreVisibility: 'public',
  maxParticipants: 4,
  authMode: 'nickname_code',
  videoProvider: 'daily',
  lumiTone: 'friendly_casual',
  rankingMetric: 'focus_minutes',
  videoRequired: true,
  detectionPauseAllowed: true
};
