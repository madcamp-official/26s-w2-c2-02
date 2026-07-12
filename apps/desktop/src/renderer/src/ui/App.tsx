import { useState } from 'react';
import { WindowTitleBar } from './components/WindowTitleBar';
import { OnboardingNickname } from './screens/OnboardingNickname';
import { OnboardingCreate } from './screens/OnboardingCreate';
import { OnboardingJoin } from './screens/OnboardingJoin';
import { OnboardingPermission } from './screens/OnboardingPermission';
import { CreateRoom } from './screens/CreateRoom';
import { WaitingRoom } from './screens/WaitingRoom';
import { StudyRoom } from './screens/StudyRoom';
import { BreakReturn } from './screens/BreakReturn';
import { Retrospective } from './screens/Retrospective';
import type { ScreenId } from './screens/types';

const SCREENS: { id: ScreenId; label: string }[] = [
  { id: 'onboarding-nickname', label: '온보딩1 닉네임' },
  { id: 'onboarding-create', label: '온보딩2 방' },
  { id: 'onboarding-join', label: '온보딩3 입장' },
  { id: 'onboarding-permission', label: '온보딩4 권한' },
  { id: 'create-room', label: '방 만들기' },
  { id: 'waiting', label: '대기실' },
  { id: 'study', label: '스터디룸' },
  { id: 'break', label: '휴식/복귀' },
  { id: 'retrospective', label: '회고' }
];

export function App() {
  const [screen, setScreen] = useState<ScreenId>('onboarding-nickname');
  const go = (id: ScreenId) => setScreen(id);

  return (
    <div className="app-root">
      <WindowTitleBar />

      <main className="app-content">
        {screen === 'onboarding-nickname' && <OnboardingNickname go={go} />}
        {screen === 'onboarding-create' && <OnboardingCreate go={go} />}
        {screen === 'onboarding-join' && <OnboardingJoin go={go} />}
        {screen === 'onboarding-permission' && <OnboardingPermission go={go} />}
        {screen === 'create-room' && <CreateRoom go={go} />}
        {screen === 'waiting' && <WaitingRoom go={go} />}
        {screen === 'study' && <StudyRoom go={go} />}
        {screen === 'break' && <BreakReturn go={go} />}
        {screen === 'retrospective' && <Retrospective go={go} />}
      </main>

      {/* Dev-only screen switcher */}
      <nav className="dev-nav" aria-label="화면 전환(개발용)">
        {SCREENS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`dev-nav__btn${screen === s.id ? ' dev-nav__btn--active' : ''}`}
            onClick={() => go(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
