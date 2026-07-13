import { useEffect, useRef, useState } from 'react';
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
  isJoining?: boolean;
  onCodeChange: (code: string) => void;
  onJoin: () => void;
}

export function OnboardingJoin({
  code,
  error,
  isJoining = false,
  onCodeChange,
  onJoin,
  go
}: OnboardingJoinProps) {
  const isCodeComplete = isInviteCodeComplete(code);
  const [inputValue, setInputValue] = useState(code);
  const isComposingRef = useRef(false);
  const [hasUnsupportedCodeCharacter, setHasUnsupportedCodeCharacter] = useState(false);
  const [isCodeFocused, setIsCodeFocused] = useState(false);
  const normalizedCode = normalizeInviteCode(code);
  const activeSlotIndex = normalizedCode.length < inviteCodeLength ? normalizedCode.length : -1;
  const codeCharacters = normalizedCode.padEnd(inviteCodeLength, ' ').split('');
  const handleCodeChange = (value: string) => {
    setHasUnsupportedCodeCharacter(/[0O1IL]/i.test(value));
    const normalized = normalizeInviteCode(value);
    setInputValue(normalized);
    onCodeChange(normalized);
  };

  useEffect(() => {
    if (!isComposingRef.current) setInputValue(code);
  }, [code]);

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
              value={inputValue}
              lang="en"
              onChange={(e) => {
                if (isComposingRef.current) {
                  setInputValue(e.target.value);
                  return;
                }
                handleCodeChange(e.target.value);
              }}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                isComposingRef.current = false;
                handleCodeChange(event.currentTarget.value);
              }}
              onFocus={() => setIsCodeFocused(true)}
              onBlur={() => setIsCodeFocused(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && isCodeComplete && !isJoining) {
                  event.preventDefault();
                  onJoin();
                }
              }}
              inputMode="text"
              pattern="[A-Za-z0-9]*"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="code-entry__slots" aria-hidden="true">
              {codeCharacters.slice(0, 3).map((character, index) => (
                <span
                  key={`prefix-${index}-${character}`}
                  className={`code-entry__slot${
                    isCodeFocused && activeSlotIndex === index ? ' code-entry__slot--active' : ''
                  }`}
                >
                  {character.trim() ? character : ''}
                </span>
              ))}
              <span className="code-entry__dash" />
              {codeCharacters.slice(3).map((character, index) => (
                <span
                  key={`suffix-${index}-${character}`}
                  className={`code-entry__slot${
                    isCodeFocused && activeSlotIndex === index + 3 ? ' code-entry__slot--active' : ''
                  }`}
                >
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
            disabled={!isCodeComplete || isJoining}
            onClick={onJoin}
          >
            {isJoining ? '방 입장 중' : '입장하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
