// 화면 전체에서 유튜브 플레이어는 딱 하나 (유튜브 규정: 한 화면 동시 재생 금지).
// 곡 카드의 ▶ 는 "이 곡 틀어줘"라고 여기다 요청만 하고,
// 실제 재생은 화면 아래 MiniPlayer 한 곳에서 함.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const PlayerCtx = createContext(null);

export function PlayerProvider({ bandId, children }) {
  const [current, setCurrent] = useState(null);
  const [queue, setQueue] = useState([]);
  const [playing, setPlaying] = useState(false);
  const controls = useRef(null); // MiniPlayer가 등록하는 { toggle }
  const currentRef = useRef(null);
  currentRef.current = current;

  const play = useCallback((song, list) => {
    if (list) setQueue(list);
    // 지금 나오는 곡을 또 누르면 일시정지/재생 토글
    if (currentRef.current && currentRef.current.id === song.id) {
      controls.current?.toggle();
      return;
    }
    setPlaying(false);
    setCurrent(song);
  }, []);

  const stop = useCallback(() => {
    setCurrent(null);
    setPlaying(false);
  }, []);

  const value = useMemo(() => {
    const idx = current ? queue.findIndex((s) => s.id === current.id) : -1;
    const next = idx >= 0 && idx < queue.length - 1 ? queue[idx + 1] : null;
    return { bandId, current, playing, setPlaying, play, stop, next, controls };
  }, [bandId, current, queue, playing, play, stop]);

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export function usePlayer() {
  return useContext(PlayerCtx);
}
