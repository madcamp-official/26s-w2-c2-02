import { Coffee, Copy, Mic, Timer, Video } from 'lucide-react';

const participants = [
  { name: '채훈', status: '집중중', goal: 'Socket.IO 방 상태 동기화' },
  { name: '소요', status: '준비중', goal: '대기실 화면 흐름 다듬기' }
];

export function App() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Room-AI Study Room</p>
            <h1>루미</h1>
          </div>
          <button className="invite-button" type="button">
            <Copy size={16} />
            Q4M2XD
          </button>
        </header>

        <section className="study-layout">
          <div className="video-grid" aria-label="참가자 영상 영역">
            {participants.map((participant) => (
              <article className="video-tile" key={participant.name}>
                <div className="avatar">{participant.name.slice(0, 1)}</div>
                <div className="tile-footer">
                  <span>{participant.name}</span>
                  <span>{participant.status}</span>
                </div>
              </article>
            ))}
          </div>

          <aside className="session-panel">
            <div className="timer-block">
              <Timer size={20} />
              <span>42:18</span>
            </div>

            <div className="goal-list">
              <h2>오늘 목표</h2>
              {participants.map((participant) => (
                <div className="goal-row" key={participant.goal}>
                  <strong>{participant.name}</strong>
                  <span>{participant.goal}</span>
                </div>
              ))}
            </div>

            <div className="lumi-message">
              <h2>루미</h2>
              <p>좋아, 지금 목표는 한 세션 안에 확인 가능한 단위로 잘게 나눠보자.</p>
            </div>
          </aside>
        </section>

        <footer className="control-bar">
          <button type="button" aria-label="마이크">
            <Mic size={18} />
          </button>
          <button type="button" aria-label="카메라">
            <Video size={18} />
          </button>
          <button type="button" aria-label="휴식">
            <Coffee size={18} />
          </button>
        </footer>
      </section>
    </main>
  );
}
