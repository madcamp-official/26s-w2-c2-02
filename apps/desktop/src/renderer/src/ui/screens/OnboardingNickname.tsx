import { RoomiMascot } from '../components/RoomiMascot';
import type { ScreenProps } from './types';

/**
 * Onboarding 1 · 닉네임 입력 (Figma 63:41).
 * NOTE: No screenshot was available for this frame (Figma read quota exhausted).
 * Layout reuses the confirmed Onboarding-4 card shell; inner copy is inferred
 * from the IA in AGENTS.md and should be verified against Figma.
 */
interface OnboardingNicknameProps extends ScreenProps {
  nickname: string;
  onNicknameChange: (nickname: string) => void;
}

export function OnboardingNickname({ nickname, onNicknameChange, go }: OnboardingNicknameProps) {
  const trimmedNickname = nickname.trim();
  const submitNickname = () => {
    if (trimmedNickname) {
      go('onboarding-create');
    }
  };

  return (
    <div className="screen screen--onboarding">
      <form
        className="onb-card"
        onSubmit={(event) => {
          event.preventDefault();
          submitNickname();
        }}
      >
        <span className="pill pill--purple onb-card__step">STEP 1 / 4 · 닉네임</span>
        <div className="onb-card__mascot">
          <RoomiMascot size={64} />
        </div>
        <h1 className="onb-card__title">어떻게 부르면 될까요?</h1>
        <p className="onb-card__subtitle">방에서 보여줄 닉네임을 정해주세요.</p>

        <div className="onb-fieldgroup">
          <label className="onb-fieldgroup__label" htmlFor="nickname">
            닉네임
          </label>
          <input
            id="nickname"
            className="field"
            placeholder="닉네임을 입력해주세요"
            value={nickname}
            onChange={(e) => onNicknameChange(e.target.value)}
            maxLength={12}
          />
          <p className="onb-hint">언제든 바꿀 수 있어요. 최대 12자까지 가능해요.</p>
        </div>

        <div className="onb-actions">
          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={!trimmedNickname}
          >
            다음
          </button>
        </div>
      </form>
    </div>
  );
}
