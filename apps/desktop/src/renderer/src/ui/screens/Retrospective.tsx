import { RoomiMascot } from '../components/RoomiMascot';
import type { ScreenProps } from './types';

/** Retrospective · 세션 회고 (Figma 72:41). Built from exact node metadata. */
export function Retrospective({ go }: ScreenProps) {
  return (
    <div className="screen screen--app">
      <div className="retro__body">
        <div className="retro__doc">
          {/* Header */}
          <div className="retro__head">
            <RoomiMascot size={84} mood="wink" />
            <div className="retro__head-text">
              <span className="retro__badge">세션 회고</span>
              <h1 className="retro__title">오늘 세션, 잘 마쳤어요!</h1>
              <p className="retro__subtitle">
                50분 집중 세션을 함께 끝냈어요. 이번 흐름을 정리해볼게요.
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="retro__stats">
            <div className="retro-stat">
              <div className="retro-stat__label">집중 시간</div>
              <div className="retro-stat__value">42분</div>
              <div className="retro-stat__note">목표의 92%</div>
            </div>
            <div className="retro-stat">
              <div className="retro-stat__label">평균 몰입도</div>
              <div className="retro-stat__value">84%</div>
              <div className="retro-stat__note">방 평균보다 높아요</div>
            </div>
            <div className="retro-stat">
              <div className="retro-stat__label">목표 결과</div>
              <div className="retro-stat__value">달성</div>
              <div className="retro-stat__note">수학 문제집 5장 완료</div>
            </div>
          </div>

          {/* Lumi one-line */}
          <div className="retro__lumi">
            <div className="retro__lumi-label">루미의 한 줄 회고</div>
            <p className="retro__lumi-text">
              오늘 소요는 초반에 살짝 흔들렸지만 후반 집중이 확 올라왔어. 다음엔 시작 5분을
              워밍업으로 쓰면 더 부드럽게 몰입할 수 있을 거야 😊
            </p>
          </div>

          {/* Two blocks */}
          <div className="retro__blocks">
            <div className="retro-block">
              <div className="retro-block__title">잘 된 점</div>
              <p className="retro-block__text">후반 30분 동안 자리 이탈 없이 깊게 몰입했어요.</p>
            </div>
            <div className="retro-block">
              <div className="retro-block__title">아쉬운 점</div>
              <p className="retro-block__text">시작 직후 10분은 집중이 조금 흐트러졌어요.</p>
            </div>
          </div>

          {/* Actions */}
          <div className="retro__actions">
            <button type="button" className="btn btn--ghost" onClick={() => go('onboarding-nickname')}>
              홈으로
            </button>
            <button type="button" className="btn btn--primary" onClick={() => go('waiting')}>
              한 번 더 집중하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
