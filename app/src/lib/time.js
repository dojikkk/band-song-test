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
