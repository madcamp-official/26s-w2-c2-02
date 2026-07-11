import type { ReactNode } from 'react';
import { RoomiMascot } from './RoomiMascot';

interface AppBarProps {
  /** Right-hand slot, e.g. the room-code pill or a "세션 종료" button. */
  right?: ReactNode;
}

/** Shared top bar with the 루미 Roomi wordmark. */
export function AppBar({ right }: AppBarProps) {
  return (
    <header className="appbar">
      <div className="appbar__brand">
        <RoomiMascot size={30} />
        <div className="appbar__wordmark">
          <b>루미</b>
          <span>Roomi</span>
        </div>
      </div>
      {right}
    </header>
  );
}
