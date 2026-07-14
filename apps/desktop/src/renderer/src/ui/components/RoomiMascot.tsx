import smileUrl from '../../assets/mascot/smile.png';
import winkUrl from '../../assets/mascot/wink.png';
import surpriseUrl from '../../assets/mascot/surprise.png';
import sadUrl from '../../assets/mascot/sad.png';
import angryUrl from '../../assets/mascot/angry.png';
import curiousUrl from '../../assets/mascot/curious.png';

/** 루미가 지을 수 있는 6가지 표정. mascot.png에서 잘라낸 스프라이트와 1:1로 대응한다. */
export type RoomiMood = 'smile' | 'wink' | 'surprise' | 'sad' | 'angry' | 'curious';

const MOOD_SRC: Record<RoomiMood, string> = {
  smile: smileUrl,
  wink: winkUrl,
  surprise: surpriseUrl,
  sad: sadUrl,
  angry: angryUrl,
  curious: curiousUrl
};

const MOOD_LABEL: Record<RoomiMood, string> = {
  smile: '미소 짓는 루미',
  wink: '윙크하는 루미',
  surprise: '놀란 루미',
  sad: '시무룩한 루미',
  angry: '기운이 넘치는 루미',
  curious: '궁금해하는 루미'
};

interface RoomiMascotProps {
  size?: number;
  /** 표정(감정). 각 표정마다 짧게 반복되는 idle 애니메이션이 붙는다. 기본값 'smile'. */
  mood?: RoomiMood;
}

/**
 * Roomi(루미) 마스코트 — 친근한 보라색 로봇.
 * mascot.png에서 감정별로 잘라낸 투명 스프라이트를 표시하고, mascot.css에서
 * 감정에 맞는 짧은 루프 애니메이션을 입힌다. (prefers-reduced-motion 시 정지)
 */
export function RoomiMascot({ size = 84, mood = 'smile' }: RoomiMascotProps) {
  return (
    <span
      className={`roomi-mascot roomi-mascot--${mood}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={MOOD_LABEL[mood]}
    >
      <img className="roomi-mascot__img" src={MOOD_SRC[mood]} alt="" draggable={false} />
    </span>
  );
}
