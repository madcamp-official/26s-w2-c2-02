import { ChevronRight, KeyRound, Plus } from 'lucide-react';
import { RoomiMascot } from '../components/RoomiMascot';
import type { ScreenProps } from './types';

/**
 * Onboarding 2 · 방 만들기 (Figma 64:41).
 * NOTE: No screenshot was available (Figma read quota exhausted). Modeled as the
 * create/join fork implied by the IA (Onboarding-2 방 만들기 → Create Room,
 * Onboarding-3 방 코드로 입장). Verify against Figma.
 */
interface OnboardingCreateProps extends ScreenProps {
  nickname: string;
}

export function OnboardingCreate({ nickname, go }: OnboardingCreateProps) {
  return (
    <div className="screen screen--onboarding">
      <div className="onb-card">
        <span className="pill pill--purple onb-card__step">STEP 2 / 4 · 방</span>
        <div className="onb-card__mascot">
          <RoomiMascot size={64} />
        </div>
        <h1 className="onb-card__title">어떻게 시작할까요?</h1>
        <p className="onb-card__subtitle">
          {nickname.trim() || '친구'}님, 새로 방을 만들거나 친구 방에 들어갈 수 있어요.
        </p>

        <div className="onb-choices">
          <button type="button" className="choice" onClick={() => go('create-room')}>
            <span className="choice__icon">
              <Plus size={20} />
            </span>
            <span>
              <span className="choice__title">새로운 방 만들기</span>
              <span className="choice__desc">세션 규칙을 정하고 친구를 초대해요</span>
            </span>
            <ChevronRight className="choice__arrow" size={20} />
          </button>

          <button type="button" className="choice" onClick={() => go('onboarding-join')}>
            <span className="choice__icon">
              <KeyRound size={20} />
            </span>
            <span>
              <span className="choice__title">방 코드로 입장하기</span>
              <span className="choice__desc">친구에게 받은 코드로 바로 들어가요</span>
            </span>
            <ChevronRight className="choice__arrow" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
