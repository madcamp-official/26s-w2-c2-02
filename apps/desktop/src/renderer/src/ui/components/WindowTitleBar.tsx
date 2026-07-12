import { Minus, Square, X } from 'lucide-react';
import { RoomiMascot } from './RoomiMascot';

const roomi = window.roomi;
const platform = roomi?.platform ?? 'win32';
const isMac = platform === 'darwin';

export function WindowTitleBar() {
  const controls = roomi?.windowControls;

  const minimize = () => void controls?.minimize();
  const toggleMaximize = () => void controls?.toggleMaximize();
  const close = () => void controls?.close();

  return (
    <header className={`window-titlebar window-titlebar--${isMac ? 'mac' : 'windows'}`}>
      {isMac ? (
        <div className="window-titlebar__controls window-titlebar__controls--mac">
          <button
            type="button"
            className="window-control window-control--mac window-control--close"
            aria-label="창 닫기"
            onClick={close}
          />
          <button
            type="button"
            className="window-control window-control--mac window-control--minimize"
            aria-label="창 최소화"
            onClick={minimize}
          />
          <button
            type="button"
            className="window-control window-control--mac window-control--maximize"
            aria-label="창 최대화"
            onClick={toggleMaximize}
          />
        </div>
      ) : null}

      <div className="window-titlebar__brand">
        <RoomiMascot size={24} />
        <span>Roomi</span>
      </div>

      {!isMac ? (
        <div className="window-titlebar__controls window-titlebar__controls--windows">
          <button type="button" className="window-control" aria-label="창 최소화" onClick={minimize}>
            <Minus size={16} />
          </button>
          <button
            type="button"
            className="window-control"
            aria-label="창 최대화"
            onClick={toggleMaximize}
          >
            <Square size={13} />
          </button>
          <button
            type="button"
            className="window-control window-control--danger"
            aria-label="창 닫기"
            onClick={close}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="window-titlebar__mac-spacer" />
      )}
    </header>
  );
}
