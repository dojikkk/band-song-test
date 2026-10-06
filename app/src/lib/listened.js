// "청취 후 투표" 옵션용 — 이 기기에서 어떤 곡을 들었는지 기억
// (서버로 검증할 방법이 없어서 화면에서만 지키는 규칙. 강제력보다는 "듣고 투표하자"는 장치)
import { useEffect, useState } from 'react';

const KEY = (bandId) => `setlist.listened.${bandId}`;
const EVENT = 'setlist:listened';

function read(bandId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY(bandId)) || '[]'));
  } catch {
    return new Set();
  }
}

export function markListened(bandId, songId) {
  if (!bandId || !songId) return;
  const set = read(bandId);
  if (set.has(songId)) return;
  set.add(songId);
  try {
    localStorage.setItem(KEY(bandId), JSON.stringify([...set]));
  } catch {
    /* 저장 못 해도 이번 화면에서는 반영 */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { bandId, songId } }));
}

export function useListened(bandId) {
  const [set, setSet] = useState(() => read(bandId));
  useEffect(() => {
    const on = (e) => {
      if (e.detail?.bandId === bandId) setSet((prev) => new Set(prev).add(e.detail.songId));
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [bandId]);
  return set;
}
