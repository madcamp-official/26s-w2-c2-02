import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { RoomiMascot } from '../components/RoomiMascot';
import { inviteCodeLength, isInviteCodeComplete, normalizeInviteCode } from '@roomi/shared';
import type { ScreenProps } from './types';

/**
 * Onboarding 3 · 방 코드로 입장 (Figma 67:41).
 * NOTE: No screenshot was available (Figma read quota exhausted). Layout reuses
 * the confirmed Onboarding-4 card shell; inner copy inferred from the IA.
 * Verify against Figma.
 */
interface OnboardingJoinProps extends ScreenProps {
  code: string;
  error?: string;
  onCodeChange: (code: string) => void;
  onJoin: () => void;
}

export function OnboardingJoin({ code, error, onCodeChange, onJoin, go }: OnboardingJoinProps) {
  const isCodeComplete = isInviteCodeComplete(code);
  const [hasUnsupportedCodeCharacter, setHasUnsupportedCodeCharacter] = useState(false);
  const codeCharacters = normalizeInviteCode(code).padEnd(inviteCodeLength, ' ').split('');

  return (
    <div className="screen screen--onboarding">
      <div className="onb-card">
        <button
          type="button"
          className="onb-card__back"
          onClick={() => go('onboarding-create')}
          aria-label="이전 화면으로"
        >
          <ArrowLeft size={16} />
          <span>이전</span>
        </button>
        <span className="pill pill--purple onb-card__step">STEP 3 / 4 · 입장</span>
        <div className="onb-card__mascot">
          <RoomiMascot size={64} />
        </div>
        <h1 className="onb-card__title">방 코드를 입력해주세요</h1>
        <p className="onb-card__subtitle">친구에게 받은 6자리 코드를 넣으면 바로 입장해요.</p>

        <div className="onb-fieldgroup">
          <label className="onb-fieldgroup__label" htmlFor="room-code">
            방 코드
          </label>
          <div className="code-entry">
            <input
              id="room-code"
              className="code-entry__input"
              value={code}
              onChange={(e) => {
                setHasUnsupportedCodeCharacter(/[0O1IL]/i.test(e.target.value));
                onCodeChange(normalizeInviteCode(e.target.value));
              }}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={inviteCodeLength + 1}
            />
            <div className="code-entry__slots" aria-hidden="true">
              {codeCharacters.slice(0, 3).map((character, index) => (
                <span key={`prefix-${index}-${character}`} className="code-entry__slot">
                  {character.trim() ? character : ''}
                </span>
              ))}
              <span className="code-entry__dash" />
              {codeCharacters.slice(3).map((character, index) => (
                <span key={`suffix-${index}-${character}`} className="code-entry__slot">
                  {character.trim() ? character : ''}
                </span>
              ))}
            </div>
          </div>
          <p className={`onb-hint${error ? ' onb-hint--error' : ''}`} aria-live="polite">
            {error ??
              (hasUnsupportedCodeCharacter
                ? 'L, I, O, 0, 1은 방 코드에 사용되지 않아요.'
                : '코드는 방장이 알려줘요.')}
          </p>
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
