// 방 안 화면. 구조 3원칙:
//  1) 방장/참여자 화면을 따로 만들지 않음 → 공용 화면[C] + 방장에게만 오버레이[D]
//  2) 설정[B]과 진행[C]은 시간축으로 분리 → 설정중이면 방장은 설정 마법사, 멤버는 대기 화면
//  3) [C]는 한 자리가 status에 따라 변신 → 곡 수합 / 투표 / 결과
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import StatusSteps from '../components/StatusSteps';
import { DockCtx } from '../components/Dock';
import { useBandState } from '../hooks/useBandState';
import { logout } from '../lib/api';
import { removeRoom, updateRoom } from '../lib/rooms';
import { dday, fmtDeadline } from '../lib/time';
import { PlayerProvider } from '../player/PlayerContext';
import MiniPlayer from '../player/MiniPlayer';
import SetupWizard from './SetupWizard';
import WaitingRoom from './WaitingRoom';
import Collecting from './room/Collecting';
import Voting from './room/Voting';
import Results from './room/Results';
import LeaderPanel from './room/LeaderPanel';
import SettingsSheet from './room/SettingsSheet';
import MeSheet, { ChangePinSheet } from './room/MeSheet';

export default function Room({ room, onExit, onExpired }) {
  return (
    <PlayerProvider>
      <RoomInner room={room} onExit={onExit} onExpired={onExpired} />
    </PlayerProvider>
  );
}

function RoomInner({ room, onExit, onExpired }) {
  const { state, loadError, refresh, notify } = useBandState(room.token, room.band_id, onExpired);
  const [sheet, setSheet] = useState(null); // 'leader' | 'settings' | 'me'
  const [barEl, setBarEl] = useState(null);
  const [dockH, setDockH] = useState(0);

  // 방 이름이 바뀌면 "이 기기에서 들어간 방" 목록도 갱신
  const bandName = state?.band.name;
  const myName = state?.me.name;
  useEffect(() => {
    if (bandName) updateRoom(room.band_id, { band_name: bandName, name: myName });
  }, [bandName, myName, room.band_id]);

  // 아래 독(투표 버튼 줄 + 미니 플레이어) 높이만큼 본문 아래 여백 확보
  const observer = useRef(null);
  const dockRef = useCallback((el) => {
    observer.current?.disconnect();
    if (!el || typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(() => setDockH(el.offsetHeight));
    observer.current.observe(el);
  }, []);

  const doLogout = async () => {
    try {
      await logout(room.token);
    } catch {
      /* 서버에 못 닿아도 이 기기에선 지움 */
    }
    removeRoom(room.band_id);
    onExit('로그아웃했어요. 참여코드·이름·PIN으로 언제든 다시 들어올 수 있어요.');
  };

  if (!state) {
    return (
      <div className="screen">
        {loadError ? (
          <div className="empty">
            <h1 className="h-md">방을 불러오지 못했어요</h1>
            <p className="muted">{loadError.text || '인터넷 연결을 확인해 주세요.'}</p>
            <div className="row-btns">
              <button className="ghost-btn" onClick={() => onExit()}>
                처음 화면
              </button>
              <button className="primary-btn" onClick={refresh}>
                다시 시도
              </button>
            </div>
          </div>
        ) : (
          <div className="loading" aria-busy="true">
            <span className="spinner" />
            <p className="muted">{room.band_name} 불러오는 중</p>
          </div>
        )}
      </div>
    );
  }

  const { band, me } = state;
  const isLeader = me.role === 'leader';
  const common = { state, token: room.token, notify };

  const sheets = (
    <>
      {sheet === 'leader' && (
        <LeaderPanel {...common} onClose={() => setSheet(null)} onEditSettings={() => setSheet('settings')} />
      )}
      {sheet === 'settings' && <SettingsSheet {...common} onClose={() => setSheet('leader')} />}
      {sheet === 'me' && (
        <MeSheet
          state={state}
          token={room.token}
          onClose={() => setSheet(null)}
          onOtherRooms={() => onExit()}
          onLogout={doLogout}
        />
      )}
      {me.must_change_pin && !sheet && (
        <ChangePinSheet token={room.token} forced onDone={refresh} />
      )}
    </>
  );

  // [B] 설정중 + 방장 → 설정 마법사
  if (band.status === 'setup' && isLeader) {
    return (
      <>
        <SetupWizard {...common} onOpenMe={() => setSheet('me')} />
        {sheets}
      </>
    );
  }

  const deadline =
    band.status === 'collecting'
      ? { label: '곡 수합 마감', at: band.collect_deadline }
      : band.status === 'voting'
        ? { label: '투표 마감', at: band.vote_deadline }
        : null;

  return (
    <DockCtx.Provider value={barEl}>
      <div className="screen room" style={{ paddingBottom: dockH + 28 }}>
        <header className="room-head">
          <div className="room-title">
            <h1>{band.name}</h1>
            <button className="me-btn" onClick={() => setSheet('me')} aria-label="내 메뉴">
              {me.name}
            </button>
          </div>
          <StatusSteps status={band.status} />
          {deadline?.at && (
            <p className="deadline">
              {deadline.label} {fmtDeadline(deadline.at)}
              <span className="deadline-chip">{dday(deadline.at)}</span>
            </p>
          )}
          {isLeader && (
            <button className="leader-bar" onClick={() => setSheet('leader')}>
              <Icon name="baton" size={18} />
              <span>
                <strong>방장 메뉴</strong>
                <small>단계 넘기기 · 참여 현황 · 멤버 · 설정</small>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          )}
        </header>

        <main>
          {band.status === 'setup' && <WaitingRoom state={state} />}
          {band.status === 'collecting' && <Collecting {...common} />}
          {band.status === 'voting' && <Voting {...common} />}
          {band.status === 'done' && <Results {...common} />}
        </main>
      </div>

      <div className="dock" ref={dockRef}>
        <div ref={setBarEl} />
        <MiniPlayer />
      </div>
      {sheets}
    </DockCtx.Provider>
  );
}
