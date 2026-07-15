import type { RoomSettings } from '@roomi/shared';

export const defaultRoomSettings: RoomSettings = {
  activityKind: 'study',
  defaultGameKind: 'hidden_mission',
  sessionMinutes: 50,
  roundCount: 3,
  breakMode: 'room',
  breakMinutes: 10,
  defaultScoreVisibility: 'public',
  maxParticipants: 4,
  authMode: 'nickname_code',
  videoProvider: 'daily',
  roomiTone: 'friendly_casual',
  rankingMetric: 'focus_minutes',
  videoRequired: true,
  detectionPauseAllowed: true
};
