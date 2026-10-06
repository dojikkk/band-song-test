// [C-3] 결과 · 확정 — 득표 순위 + 방장이 고른 최종 선정 곡
import { useState } from 'react';
import Icon from '../../components/Icon';
import SongCard from '../../components/SongCard';
import { copyText, useToast } from '../../components/ui';
import { errorText, setSelected } from '../../lib/api';

export default function Results({ state, token, notify }) {
  const { band, songs, members, me } = state;
  const toast = useToast();
  const isLeader = me.role === 'leader';
  const [busyId, setBusyId] = useState(null);

  const byId = Object.fromEntries(songs.map((s) => [s.id, s]));
  const rows = (state.results || []).map((r) => ({ ...r, song: byId[r.song_id] })).filter((r) => r.song);
  const max = Math.max(1, ...rows.map((r) => r.votes));
  const rankOf = (v) => 1 + rows.filter((r) => r.votes > v).length;
  const finals = rows.filter((r) => r.song.selected);
  const queue = rows.map((r) => r.song);
  const voters = members.filter((m) => m.voted).length;

  const toggle = async (song) => {
    setBusyId(song.id);
    try {
      await setSelected(token, song.id, !song.selected);
      await notify();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const copyResult = async () => {
    const lines = [`[${band.name}] 곡 선정 결과`];
    if (finals.length) {
      lines.push('', '최종 선정');
      finals.forEach((r, i) => lines.push(`${i + 1}. ${r.song.title}${r.song.artist ? ` - ${r.song.artist}` : ''}`));
    }
    lines.push('', `득표 순위 (${voters}명 투표)`);
    rows.forEach((r) => lines.push(`${rankOf(r.votes)}위 ${r.song.title} · ${r.votes}표`));
    if (await copyText(lines.join('\n'))) toast('결과를 복사했어요. 단톡방에 붙여 넣어요.');
  };

  return (
    <>
      <section className="block">
        <div className="block-head">
          <h2 className="h-md">
            최종 선정 곡 <span className="count">{finals.length}</span>
          </h2>
          <button className="ghost-btn small" onClick={copyResult}>
            <Icon name="copy" size={15} /> 결과 복사
          </button>
        </div>
        {finals.length === 0 ? (
          <p className="empty-line">
            {isLeader
              ? '아래 득표를 보고 공연할 곡에 ‘선정’을 눌러 주세요. 몇 곡을 할지는 밴드끼리 정하면 돼요.'
              : '방장이 득표를 보고 최종 곡을 고르고 있어요.'}
          </p>
        ) : (
          <ol className="finals">
            {finals.map((r, i) => (
              <li key={r.song_id}>
                <span className="final-no">{i + 1}</span>
                <span className="final-title">
                  {r.song.title}
                  {r.song.artist && <small>{r.song.artist}</small>}
                </span>
                <span className="final-votes">{r.votes}표</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="block">
        <div className="block-head">
          <h2 className="h-md">득표 순위</h2>
          <span className="muted small">{voters}명 투표</span>
        </div>
        {rows.map((r) => (
          <SongCard
            key={r.song_id}
            song={r.song}
            queue={queue}
            className={r.song.selected ? 'is-final' : ''}
            badge={<span className={`rank${rankOf(r.votes) === 1 ? ' top' : ''}`}>{rankOf(r.votes)}</span>}
          >
            <div className="tally">
              <div className="tally-bar">
                <span style={{ width: `${(r.votes / max) * 100}%` }} />
              </div>
              <strong>{r.votes}표</strong>
            </div>
            {r.voters && r.voters.length > 0 && <p className="voters">{r.voters.join(', ')}</p>}
            {isLeader ? (
              <button
                className={`pick-btn final${r.song.selected ? ' on' : ''}`}
                onClick={() => toggle(r.song)}
                disabled={busyId === r.song.id}
                aria-pressed={r.song.selected}
              >
                {r.song.selected ? (
                  <>
                    <Icon name="check" size={16} /> 선정됨
                  </>
                ) : (
                  '선정'
                )}
              </button>
            ) : (
              r.song.selected && <span className="final-tag">선정</span>
            )}
          </SongCard>
        ))}
      </section>
    </>
  );
}
