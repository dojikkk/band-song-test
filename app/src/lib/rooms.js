// 이 기기에서 들어간 방 목록을 브라우저(localStorage)에 기억.
// 토큰을 잃어버려도(브라우저 바뀜) 코드+이름+PIN으로 다시 들어오면 되니까
// 여기는 "편의용 기억"일 뿐, 신원의 진짜 근거는 DB에 있음.
const KEY = 'setlist.rooms.v1';
const CURRENT = 'setlist.current.v1';

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 사생활 보호 모드 등에서 실패해도 앱은 계속 동작 */
  }
}

export function listRooms() {
  return read().sort((a, b) => (b.last || 0) - (a.last || 0));
}

export function saveRoom({ band_id, band_name, invite_code, token, name }) {
  const list = read().filter((r) => r.band_id !== band_id);
  list.push({ band_id, band_name, invite_code, token, name, last: Date.now() });
  write(list);
  setCurrent(band_id);
}

export function updateRoom(band_id, patch) {
  write(read().map((r) => (r.band_id === band_id ? { ...r, ...patch } : r)));
}

export function removeRoom(band_id) {
  write(read().filter((r) => r.band_id !== band_id));
  if (getCurrentId() === band_id) setCurrent(null);
}

export function getCurrentId() {
  try {
    return localStorage.getItem(CURRENT);
  } catch {
    return null;
  }
}

export function setCurrent(band_id) {
  try {
    if (band_id) localStorage.setItem(CURRENT, band_id);
    else localStorage.removeItem(CURRENT);
  } catch {
    /* 무시 */
  }
}

export function getCurrentRoom() {
  const id = getCurrentId();
  return id ? read().find((r) => r.band_id === id) || null : null;
}
