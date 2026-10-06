// 마감일 표시 도우미. 마감일은 "안내·독촉용"이지 자동 전환 트리거가 아님.

const fmt = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export function fmtDeadline(iso) {
  if (!iso) return null;
  return fmt.format(new Date(iso));
}

// "D-3", "오늘 마감", "마감 지남"
export function dday(iso) {
  if (!iso) return null;
  const end = new Date(iso);
  const now = new Date();
  if (end < now) return '마감 지남';
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(end) - startOf(now)) / 86400000);
  if (days === 0) return '오늘 마감';
  return `D-${days}`;
}

// <input type="datetime-local"> 값 ↔ ISO 문자열
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------- 합주 일정용 ----------
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// 'YYYY-MM-DD' (내 기기 시간대 기준 날짜)
export function ymd(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 'YYYY-MM-DD' → Date(그날 0시, 내 기기 기준)
export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function daysBetween(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

// '10/12(일)'
export function fmtDay(s) {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
}

export function weekday(s) {
  return WEEK[parseYmd(s).getDay()];
}

// 19 → '오후 7시', 24 → '자정'
export function fmtHour(h) {
  if (h === 0 || h === 24) return '자정';
  if (h === 12) return '낮 12시';
  return h < 12 ? `오전 ${h}시` : `오후 ${h - 12}시`;
}

// 구글 캘린더 "일정 추가" 링크 (한국 시간 기준)
export function googleCalendarLink({ title, day, startHour, endHour, place, note }) {
  const pad = (n) => String(n).padStart(2, '0');
  const base = day.replaceAll('-', '');
  // 끝이 24시면 다음날 0시로
  const t = (h) => (h === 24 ? `${addDays(day, 1).replaceAll('-', '')}T000000` : `${base}T${pad(h)}0000`);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${t(startHour)}/${t(endHour)}`,
    ctz: 'Asia/Seoul',
  });
  if (place) params.set('location', place);
  if (note) params.set('details', note);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
