// 장식용 파형 + 진행 표시. 막대를 누르면 그 위치로 이동(onSeek 있을 때)
import { useMemo } from 'react';
import { waveHeights } from '../lib/youtube';

export default function Wave({ seed, progress = 0, onSeek, count = 44, small = false }) {
  const bars = useMemo(() => waveHeights(seed || 'x', count), [seed, count]);
  const lit = Math.floor(progress * count);

  const handle = (e) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek(frac);
  };

  return (
    <div
      className={`wave${small ? ' small' : ''}${onSeek ? ' seekable' : ''}`}
      onClick={handle}
      role={onSeek ? 'slider' : undefined}
      aria-label={onSeek ? '재생 위치' : undefined}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
      aria-valuenow={onSeek ? Math.round(progress * 100) : undefined}
    >
      {bars.map((h, i) => (
        <span key={i} className={i < lit ? 'played' : ''} style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}
