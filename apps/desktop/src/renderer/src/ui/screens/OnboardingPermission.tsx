import { ArrowLeft, Camera, Mic } from 'lucide-react';
import { RoomiMascot } from '../components/RoomiMascot';
import type { ScreenProps } from './types';

type MediaPermissionState = 'idle' | 'checking' | 'granted' | 'denied';

interface OnboardingPermissionProps extends ScreenProps {
  permission: MediaPermissionState;
  onPermissionChange: (permission: MediaPermissionState) => void;
  onReady: () => void;
  onBack: () => void;
}

const isMac = window.roomi?.platform === 'darwin';

/** Onboarding 4 · 카메라·마이크 권한 (Figma 67:61). */
export function OnboardingPermission({
  permission,
  onPermissionChange,
  onReady,
  onBack
}: OnboardingPermissionProps) {
  const isChecking = permission === 'checking';
  const isGranted = permission === 'granted';
  const isDenied = permission === 'denied';

  const checkMediaPermission = async () => {
    onPermissionChange('checking');

    try {
      // 데스크톱 앱에서는 먼저 OS 레벨 접근을 확보한다. (미결정이면 시스템 다이얼로그가 뜬다.)
      await window.roomi?.media.ensureAccess();

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      onPermissionChange('granted');
      onReady();
    } catch (error) {
      console.error('미디어 권한 확인 실패:', error);
      onPermissionChange('denied');
    }
  };

  const openPrivacySettings = () => {
    void window.roomi?.media.openPrivacySettings();
  };

  return (
    <div className="screen screen--onboarding">
      <div
        className="onb-card"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (event.key === 'Enter' && !isChecking && !target.closest('.onb-card__back')) {
            event.preventDefault();
            void checkMediaPermission();
          }
        }}
      >
        <button type="button" className="onb-card__back" onClick={onBack} aria-label="이전 화면으로">
          <ArrowLeft size={16} />
          <span>이전</span>
        </button>
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
              <div className="perm-row__desc">
                {isDenied ? '권한 확인이 필요해요' : '집중 상태 확인에 사용돼요'}
              </div>
            </div>
            <span className={`badge ${isGranted ? 'badge--green' : 'badge--wait'}`}>
              {isGranted ? '허용됨' : isChecking ? '확인중' : '대기'}
            </span>
          </div>

          <div className="perm-row">
            <span className="perm-row__icon">
              <Mic size={18} />
            </span>
            <div className="perm-row__body">
              <div className="perm-row__title">마이크</div>
              <div className="perm-row__desc">
                {isDenied ? '권한 확인이 필요해요' : '휴식/복귀 안내에 사용돼요'}
              </div>
            </div>
            <span className={`badge ${isGranted ? 'badge--green' : 'badge--wait'}`}>
              {isGranted ? '허용됨' : isChecking ? '확인중' : '대기'}
            </span>
          </div>
        </div>

        <p className={`onb-note${isDenied ? ' onb-note--danger' : ''}`}>
          {isDenied
            ? '권한을 확인하지 못했어요. 카메라와 마이크 접근을 허용한 뒤 다시 시도해주세요.'
            : '화면 내용은 저장되지 않고, 판정 결과만 사용돼요.'}
        </p>

        <div className="onb-actions">
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={isChecking}
            autoFocus
            onClick={checkMediaPermission}
          >
            {isChecking ? '권한 확인 중...' : isGranted ? '대기실로 이동' : '권한 확인하고 입장'}
          </button>
          {isDenied && isMac ? (
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={openPrivacySettings}
            >
              시스템 설정에서 권한 켜기
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
