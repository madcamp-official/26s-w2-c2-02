import { useEffect, useRef } from 'react';
import { ArrowLeft, Camera, ChevronRight, KeyRound, Plus } from 'lucide-react';
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
  const choiceRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const actions = [() => go('create-room'), () => go('onboarding-join'), () => go('mediapipe-test')];

  useEffect(() => choiceRefs.current[0]?.focus(), []);

  const handleChoiceKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      actions[index]();
      return;
    }
    const delta = ['ArrowRight', 'ArrowDown'].includes(event.key)
      ? 1
      : ['ArrowLeft', 'ArrowUp'].includes(event.key)
        ? -1
        : 0;
    if (!delta) return;
    event.preventDefault();
    choiceRefs.current[(index + delta + actions.length) % actions.length]?.focus();
  };

  return (
    <div className="screen screen--onboarding">
      <div className="onb-card">
        <button
          type="button"
          className="onb-card__back"
          onClick={() => go('onboarding-nickname')}
          aria-label="이전 화면으로"
        >
          <ArrowLeft size={16} />
          <span>이전</span>
        </button>
        <span className="pill pill--purple onb-card__step">STEP 2 / 4 · 방</span>
        <div className="onb-card__mascot">
          <RoomiMascot size={96} />
        </div>
        <h1 className="onb-card__title">어떻게 시작할까요?</h1>
        <p className="onb-card__subtitle">
          {nickname.trim() || '친구'}님, 새로 방을 만들거나 친구 방에 들어갈 수 있어요.
        </p>

        <div className="onb-choices">
          <button ref={(node) => { choiceRefs.current[0] = node; }} type="button" className="choice" onKeyDown={(event) => handleChoiceKeyDown(event, 0)} onClick={actions[0]}>
            <span className="choice__icon">
              <Plus size={20} />
            </span>
            <span className="choice__body">
              <span className="choice__title">새로운 방 만들기</span>
              <span className="choice__desc">세션 규칙을 정하고 친구를 초대해요</span>
            </span>
            <ChevronRight className="choice__arrow" size={20} />
          </button>

          <button ref={(node) => { choiceRefs.current[1] = node; }} type="button" className="choice" onKeyDown={(event) => handleChoiceKeyDown(event, 1)} onClick={actions[1]}>
            <span className="choice__icon">
              <KeyRound size={20} />
            </span>
            <span className="choice__body">
              <span className="choice__title">방 코드로 입장하기</span>
              <span className="choice__desc">친구에게 받은 코드로 바로 들어가요</span>
            </span>
            <ChevronRight className="choice__arrow" size={20} />
          </button>

          <button ref={(node) => { choiceRefs.current[2] = node; }} type="button" className="choice" onKeyDown={(event) => handleChoiceKeyDown(event, 2)} onClick={actions[2]}>
            <span className="choice__icon">
              <Camera size={20} />
            </span>
            <span className="choice__body">
              <span className="choice__title">MediaPipe 집중도 테스트</span>
              <span className="choice__desc">웹캠 landmark와 Rule-Based label을 확인해요</span>
            </span>
            <ChevronRight className="choice__arrow" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
