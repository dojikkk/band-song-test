// 앱의 큰 갈림길: 로그인 전 [A] 화면들 ↔ 방 안(Room)
import { useCallback, useEffect, useState } from 'react';
import { isConfigured } from './lib/supabase';
import { getCurrentRoom, listRooms, removeRoom, saveRoom, setCurrent } from './lib/rooms';
import Entry from './screens/Entry';
import JoinFlow from './screens/JoinFlow';
import CreateBand from './screens/CreateBand';
import Room from './screens/Room';
import InAppNotice from './components/InAppNotice';

// 주소창에서 ?c= 를 지우기 전에 원래 주소를 기억 (카톡 → 브라우저로 열기 할 때 그대로 넘기려고)
const ORIGINAL_HREF = window.location.href;

// 초대 링크(?c=ABC123)로 들어왔는지
function readInviteCode() {
  const c = new URLSearchParams(window.location.search).get('c');
  if (!c) return null;
  // 주소창에서 ?c= 지워두기 (새로고침해도 다시 입장 화면으로 안 튀게)
  window.history.replaceState(null, '', window.location.pathname);
  return c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

// 페이지 열릴 때 딱 한 번만 읽음 (React 개발 모드는 초기화 함수를 두 번 부르기도 해서)
const INVITE_CODE = readInviteCode();

function initialView() {
  const code = INVITE_CODE;
  if (code) {
    const already = listRooms().find((r) => r.invite_code === code);
    if (already) {
      setCurrent(already.band_id);
      return { name: 'room', room: already };
    }
    return { name: 'join', code };
  }
  const room = getCurrentRoom();
  return room ? { name: 'room', room } : { name: 'entry' };
}

export default function App() {
  const [view, setView] = useState(initialView);
  const [notice, setNotice] = useState(null);

  const enterRoom = useCallback((res) => {
    const room = {
      band_id: res.band_id,
      band_name: res.band_name,
      invite_code: res.invite_code,
      token: res.token,
      name: res.name,
    };
    saveRoom(room);
    setNotice(null);
    setView({ name: 'room', room });
  }, []);

  const leaveToEntry = useCallback((msg) => {
    setCurrent(null);
    setNotice(msg || null);
    setView({ name: 'entry' });
  }, []);

  // 세션이 끊김 (PIN 초기화 등) → 방 목록에서 빼고, 같은 코드로 다시 입장하게
  const onExpired = useCallback((room) => {
    removeRoom(room.band_id);
    setNotice('로그인이 풀렸어요. 이름과 PIN으로 다시 들어와 주세요.');
    setView({ name: 'join', code: room.invite_code });
  }, []);

  useEffect(() => {
    document.title = view.name === 'room' && view.room ? `${view.room.band_name} · 셋리스트` : '셋리스트';
  }, [view]);

  if (!isConfigured) return <NotConfigured />;

  return (
    <>
      <InAppNotice href={ORIGINAL_HREF} />
      <Screen
        view={view}
        notice={notice}
        setView={setView}
        enterRoom={enterRoom}
        leaveToEntry={leaveToEntry}
        onExpired={onExpired}
      />
    </>
  );
}

function Screen({ view, notice, setView, enterRoom, leaveToEntry, onExpired }) {
  if (view.name === 'join') {
    return (
      <>
        {notice && <p className="banner top">{notice}</p>}
        <JoinFlow initialCode={view.code} onBack={() => leaveToEntry()} onEntered={enterRoom} />
      </>
    );
  }
  if (view.name === 'create') {
    return <CreateBand onBack={() => leaveToEntry()} onCreated={enterRoom} />;
  }
  if (view.name === 'room') {
    return (
      <Room
        key={view.room.band_id}
        room={view.room}
        onExit={leaveToEntry}
        onExpired={() => onExpired(view.room)}
      />
    );
  }
  return (
    <Entry
      notice={notice}
      onJoin={(code) => {
        const already = listRooms().find((r) => r.invite_code === code);
        if (already) {
          setCurrent(already.band_id);
          setView({ name: 'room', room: already });
        } else setView({ name: 'join', code });
      }}
      onCreate={() => setView({ name: 'create' })}
      onOpenRoom={(room) => {
        setCurrent(room.band_id);
        setView({ name: 'room', room });
      }}
    />
  );
}

function NotConfigured() {
  return (
    <div className="screen">
      <div className="empty">
        <h1 className="h-lg">Supabase 연결 정보가 없어요</h1>
        <p>
          프로젝트 폴더에 <code>.env.local</code> 파일을 만들고 <code>VITE_SUPABASE_URL</code>,{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> 두 줄을 넣은 뒤 개발 서버를 다시 켜 주세요. 배포했다면 Vercel의
          Environment Variables에 같은 두 값을 넣어야 해요. 자세한 건 README에 있어요.
        </p>
      </div>
    </div>
  );
}
