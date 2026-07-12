import { RoomiMascot } from '../components/RoomiMascot';
import type { ScreenProps } from './types';

/**
 * Onboarding 3 · 방 코드로 입장 (Figma 67:41).
 * NOTE: No screenshot was available (Figma read quota exhausted). Layout reuses
 * the confirmed Onboarding-4 card shell; inner copy inferred from the IA.
 * Verify against Figma.
 */
interface OnboardingJoinProps extends ScreenProps {
  code: string;
  onCodeChange: (code: string) => void;
  onJoin: () => void;
}

export function OnboardingJoin({ code, onCodeChange, onJoin }: OnboardingJoinProps) {
  const isCodeComplete = code.length === 4;

  return (
    <div className="screen screen--onboarding">
      <div className="onb-card">
        <span className="pill pill--purple onb-card__step">STEP 3 / 4 · 입장</span>
        <div className="onb-card__mascot">
          <RoomiMascot size={64} />
        </div>
        <h1 className="onb-card__title">방 코드를 입력해주세요</h1>
        <p className="onb-card__subtitle">친구에게 받은 4자리 코드를 넣으면 바로 입장해요.</p>

        <div className="onb-fieldgroup">
          <label className="onb-fieldgroup__label" htmlFor="room-code">
            방 코드
          </label>
          <input
            id="room-code"
            className="field field--code"
            placeholder="0000"
            value={code}
            onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
          />
          <p className="onb-hint">코드는 방장이 알려줘요.</p>
        </div>

        <div className="onb-actions">
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={!isCodeComplete}
            onClick={onJoin}
          >
            입장하기
          </button>
        </div>
      </div>
    </div>
  );
}
