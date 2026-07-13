import { Users, User } from 'lucide-react';
import { RoomiMascot } from '../components/RoomiMascot';
import type { ScreenProps } from './types';

/** Break & Return · 휴식/복귀 (Figma 68:41). */
export function BreakReturn({ go }: ScreenProps) {
  return (
    <div className="screen screen--break">
      <div className="break__wrap">
        <div className="break__status">휴식 중</div>
        <div className="break__meta">
          <span className="pill pill--purple">방 코드 7KQ-2MD</span>
        </div>
        <p className="break__hint">다 같이 쉬는 시간</p>
        <div className="break__timer">04:32</div>
        <p className="break__subhint">휴식이 끝나면 루미가 다시 모아줄게요</p>

        <div className="break__lumi">
          <RoomiMascot size={64} mood="wink" />
          <div className="break__bubble">
            <div className="break__bubble-label">루미의 복귀 메시지</div>
            <p className="break__bubble-text">
              물 한 잔 마시고 어깨 쭉 펴자! 이제 슬슬 돌아올 준비 하면 딱 좋아 😊
            </p>
          </div>
        </div>

        <div className="break__options">
          <div className="break-option break-option--active">
            <span className="break-option__icon">
              <Users size={18} />
            </span>
            <div className="break-option__title">방 전체 휴식</div>
            <p className="break-option__desc">모두 같은 시간에 쉬고 같은 시간에 다시 모여요.</p>
            <div className="break-option__foot break-option__foot--active">지금 이 방식이에요</div>
          </div>

          <div className="break-option">
            <span className="break-option__icon">
              <User size={18} />
            </span>
            <div className="break-option__title">개인 자율 휴식</div>
            <p className="break-option__desc">각자 원할 때 잠깐 쉬고 자유롭게 복귀해요.</p>
            <div className="break-option__foot break-option__foot--muted">방장이 바꿀 수 있어요</div>
          </div>
        </div>

        <div className="break__actions">
          <button type="button" className="btn btn--ghost">
            5분 더 쉬기
          </button>
          <button type="button" className="btn btn--primary" onClick={() => go('study')}>
            지금 바로 복귀하기
          </button>
        </div>
      </div>
    </div>
  );
}
