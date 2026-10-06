// 방 상태를 가져오고 "다른 사람이 뭔가 바꾸면" 다시 가져오는 훅.
//
// 실시간 동기화 방식 (단순하게):
//   1) 누가 뭘 바꾸면(곡 추가, 투표 등) 그 사람 브라우저가
//      Supabase Realtime 채널에 "changed" 신호만 쏨 (데이터는 안 실음).
//   2) 신호를 받은 다른 브라우저들은 get_state를 다시 호출.
//   3) 신호를 놓쳐도 15초마다, 그리고 앱으로 돌아올 때마다 새로 가져옴.
// 데이터는 늘 DB 함수(get_state)로만 받으니까 익명·결과 비공개 규칙이 그대로 지켜짐.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getState, AppError } from '../lib/api';

const POLL_MS = 15000;

export function useBandState(token, bandId, onExpired) {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const channelRef = useRef(null);
  const inflight = useRef(null);
  const expiredRef = useRef(onExpired);
  expiredRef.current = onExpired;

  const refresh = useCallback(async () => {
    if (!token) return null;
    // 동시에 여러 번 불려도 요청은 하나만
    if (inflight.current) return inflight.current;
    inflight.current = (async () => {
      try {
        const s = normalizeState(await getState(token));
        setState(s);
        setLoadError(null);
        return s;
      } catch (e) {
        if (e instanceof AppError && e.code === 'SESSION_EXPIRED') expiredRef.current?.();
        else setLoadError(e);
        return null;
      } finally {
        inflight.current = null;
      }
    })();
    return inflight.current;
  }, [token]);

  // 처음 + 주기적 + 앱으로 돌아왔을 때
  useEffect(() => {
    setState(null);
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh]);

  // Realtime 채널 (연결 실패해도 위의 주기적 새로고침으로 굴러감)
  useEffect(() => {
    if (!bandId || !supabase) return undefined;
    let channel;
    try {
      channel = supabase
        .channel(`band-${bandId}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'changed' }, () => refresh())
        .subscribe();
      channelRef.current = channel;
    } catch {
      channelRef.current = null;
    }
    return () => {
      channelRef.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [bandId, refresh]);

  // 내가 뭔가 바꾼 뒤 부르기: 다른 사람들에게 신호 + 내 화면 갱신
  const notify = useCallback(async () => {
    const ch = channelRef.current;
    if (ch && ch.state === 'joined') {
      ch.send({ type: 'broadcast', event: 'changed', payload: {} }).catch(() => {});
    }
    return refresh();
  }, [refresh]);

  return { state, loadError, refresh, notify };
}

// 서버(DB)가 예전 버전이면 새 화면이 기대하는 칸이 없을 수 있음 → 기본값을 채우고 표시해 둠.
// (코드는 먼저 바뀌었는데 Supabase 마이그레이션이 아직 안 들어간 순간 등)
export function normalizeState(s) {
  if (!s || s.pending) return s;
  const dbOutdated = !Array.isArray(s.groups);
  return {
    ...s,
    dbOutdated,
    groups: s.groups ?? [],
    slots: s.slots ?? [],
    rehearsals: s.rehearsals ?? [],
    schedule: s.schedule ?? null,
    my_votes: s.my_votes ?? [],
    songs: (s.songs ?? []).map((x) => ({ links: {}, ...x })),
    members: (s.members ?? []).map((m) => ({ status: 'active', parts: [], voted_groups: 0, ...m })),
    me: { status: 'active', parts: [], ...s.me },
    band: {
      vote_method: 'majority',
      use_groups: false,
      multi_group: false,
      join_approval: false,
      require_listen: false,
      lineup: [],
      ...s.band,
    },
  };
}
