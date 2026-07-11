import { Camera, Mic } from 'lucide-react';
import { RoomiMascot } from '../components/RoomiMascot';
import type { ScreenProps } from './types';

/** Onboarding 4 · 카메라·마이크 권한 (Figma 67:61). */
export function OnboardingPermission({ go }: ScreenProps) {
  return (
    <div className="screen screen--onboarding">
      <div className="onb-card">
        <span className="pill pill--purple onb-card__step">STEP 4 / 4 · 권한</span>
        <div className="onb-card__mascot">
          <RoomiMascot size={64} />
        </div>
        <h1 className="onb-card__title">카메라와 마이크를 확인할게요</h1>
        <p className="onb-card__subtitle">집중 상태를 함께 나누려면 권한이 필요해요.</p>

        <div className="perm-list">
          <div className="perm-row">
            <span className="perm-row__icon">
              <Camera size={18} />
            </span>
            <div className="perm-row__body">
              <div className="perm-row__title">카메라</div>
              <div className="perm-row__desc">집중 상태 확인에 사용돼요</div>
            </div>
            <span className="badge badge--green">허용됨</span>
          </div>

          <div className="perm-row">
            <span className="perm-row__icon">
              <Mic size={18} />
            </span>
            <div className="perm-row__body">
              <div className="perm-row__title">마이크</div>
              <div className="perm-row__desc">휴식/복귀 안내에 사용돼요</div>
            </div>
            <span className="badge badge--green">허용됨</span>
          </div>
        </div>

        <p className="onb-note">화면 내용은 저장되지 않고, 판정 결과만 사용돼요.</p>

        <div className="onb-actions">
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => go('waiting')}
          >
            입장 준비 완료
          </button>
        </div>
      </div>
    </div>
  );
}
