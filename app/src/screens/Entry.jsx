// [A-1] 역할 선택 — "참여코드로 입장"을 크게, "방 만들기"는 작게
import { useState } from 'react';
import Icon from '../components/Icon';
import { listRooms } from '../lib/rooms';
import { waveHeights } from '../lib/youtube';

const HERO = waveHeights('setlist-hero', 44);

export default function Entry({ onJoin, onCreate, onOpenRoom, notice }) {
  const [code, setCode] = useState('');
  const rooms = listRooms();

  const submit = (e) => {
    e.preventDefault();
    const c = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (c.length >= 4) onJoin(c);
  };

  return (
    <div className="screen entry">
      <header className="entry-hero">
        <div className="wordmark" aria-label="셋리스트">
          <span className="wm-dot" aria-hidden="true" />
          셋리스트
        </div>
        <p className="entry-tag">밴드 공연곡, 다 같이 듣고 투표해서 정해요.</p>
        <div className="hero-wave" aria-hidden="true">
          <div className="wave">
            {HERO.map((h, i) => (
              <span key={i} style={{ height: `${h}%`, '--i': i }} />
            ))}
          </div>
        </div>
      </header>

      {notice && <p className="banner">{notice}</p>}

      <form className="join-card" onSubmit={submit}>
        <label htmlFor="code" className="join-label">
          참여코드로 입장
        </label>
        <p className="join-help">방장이 단톡방에 올린 6자리 코드를 넣어요.</p>
        <div className="code-row">
          <input
            id="code"
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
          />
          <button className="primary-btn" type="submit" disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 6}>
            입장
          </button>
        </div>
      </form>

      <button className="create-link" onClick={onCreate}>
        <span>
          <strong>새 방 만들기</strong>
          <small>방장이 처음 한 번만 해요</small>
        </span>
        <Icon name="chevron" size={18} />
      </button>

      {rooms.length > 0 && (
        <section className="my-rooms" aria-label="이 기기에서 들어간 방">
          <h2 className="section-title">이 기기에서 들어간 방</h2>
          <ul>
            {rooms.map((r) => (
              <li key={r.band_id}>
                <button className="room-row" onClick={() => onOpenRoom(r)}>
                  <span className="room-name">{r.band_name}</span>
                  <span className="room-me">{r.name}</span>
                  <Icon name="chevron" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="entry-foot">
        참여코드 + 이름 + PIN만 기억하면 다른 폰에서도 같은 사람으로 이어져요.
      </footer>
    </div>
  );
}
