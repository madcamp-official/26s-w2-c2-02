export type ScreenId =
  | 'onboarding-nickname'
  | 'onboarding-create'
  | 'onboarding-join'
  | 'onboarding-permission'
  | 'mediapipe-test'
  | 'create-room'
  | 'waiting'
  | 'study'
  | 'break'
  | 'retrospective';

export interface ScreenProps {
  go: (id: ScreenId) => void;
}
