// [C-3] 결과 · 확정 — 그룹별 순위 + 방장이 고른 최종 선정 곡
// 그룹끼리는 점수를 비교하지 않음 (곡 수가 달라서 만점이 다름)
import { useState } from 'react';
import Icon from '../../components/Icon';
import SongCard from '../../components/SongCard';
import { copyText, useToast } from '../../components/ui';
import { errorText, setSelected } from '../../lib/api';
import { activeMembers, showGroupTabs } from '../../lib/selectors';

export default function Results({ state, token, notify }) {
  const { band, songs, me, groups } = state;
  const toast = useToast();
  const isLeader = me.role === 'leader';
  const borda = band.vote_method === 'borda';
  const tabs = showGroupTabs(state);
  const [busyId, setBusyId] = useState(null);

  const byId = Object.fromEntries(songs.map((s) => [s.id, s]));
  const sections = (state.results || [])
    .map((res) => ({
      group: groups.find((g) => g.id === res.group_id),
      rows: res.rows.map((r) => ({ ...r, song: byId[r.song_id] })).filter((r) => r.song),
    }))
    .filter((x) => x.group);
  const finals = songs.filter((s) => s.selected);
  const voters = activeMembers(state).filter((m) => m.voted).length;
  const unit = borda ? '점' : '표';

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
      finals.forEach((s, i) => lines.push(`${i + 1}. ${s.title}${s.artist ? ` - ${s.artist}` : ''}`));
    }
    for (const sec of sections) {
      lines.push('', `${tabs ? `[${sec.group.name}] ` : ''}${borda ? '점수' : '득표'} 순위`);
      sec.rows.forEach((r) => lines.push(`${rank(sec.rows, r.score)}위 ${r.song.title} · ${r.score}${unit}`));
    }
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
              ? `아래 ${tabs ? '그룹별 ' : ''}순위를 보고 공연할 곡에 ‘선정’을 눌러 주세요. 몇 곡을 할지는 밴드끼리 정하면 돼요.`
              : '방장이 순위를 보고 최종 곡을 고르고 있어요.'}
          </p>
        ) : (
          <ol className="finals">
            {finals.map((s, i) => (
              <li key={s.id}>
                <span className="final-no">{i + 1}</span>
                <span className="final-title">
                  {s.title}
                  {s.artist && <small>{s.artist}</small>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {finals.length > 0 && <p className="hint">선정된 곡은 ‘파트’ 탭에서 파트를 나눠요.</p>}
      </section>

      {sections.map((sec) => {
        const max = Math.max(1, ...sec.rows.map((r) => r.score));
        return (
          <section className="block" key={sec.group.id}>
            <div className="block-head">
              <h2 className="h-md">{tabs ? sec.group.name : borda ? '점수 순위' : '득표 순위'}</h2>
              <span className="muted small">
                {voters}명 투표{borda && ` · 1등 ${sec.rows.length}점`}
              </span>
            </div>
            {sec.rows.map((r) => {
              const rk = rank(sec.rows, r.score);
              return (
                <SongCard
                  key={r.song_id}
                  song={r.song}
                  queue={sec.rows.map((x) => x.song)}
                  className={r.song.selected ? 'is-final' : ''}
                  badge={<span className={`rank${rk === 1 ? ' top' : ''}`}>{rk}</span>}
                >
                  <div className="tally">
                    <div className="tally-bar">
                      <span style={{ width: `${(r.score / max) * 100}%` }} />
                    </div>
                    <strong>
                      {r.score}
                      {unit}
                    </strong>
                  </div>
                  {r.voters && r.voters.length > 0 && (
                    <p className="voters">
                      {r.voters.map((v) => (borda ? `${v.name} ${v.points}` : v.name)).join(', ')}
                    </p>
                  )}
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
              );
            })}
          </section>
        );
      })}
    </>
  );
}

// 공동 순위: 나보다 점수 높은 곡 수 + 1
function rank(rows, score) {
  return 1 + rows.filter((x) => x.score > score).length;
}
