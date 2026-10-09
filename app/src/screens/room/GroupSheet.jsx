// 그룹(파트) 나누기 — 방장 전용, 투표 시작 전까지
// 그룹 = 투표자를 나누는 게 아니라 "곡을 담는 바구니".
// 예) 남보컬 / 여보컬1 / 여보컬2 → 그룹마다 따로 순위를 내서 공연 구성 균형을 맞춤
import { useState } from 'react';
import Icon from '../../components/Icon';
import { Button, Sheet, useToast } from '../../components/ui';
import { createGroup, deleteGroup, errorText, renameGroup, setSongGroups } from '../../lib/api';
import { groupsBySong } from '../../lib/selectors';
import { SongThumb } from '../../components/SongCard';

export default function GroupSheet({ state, token, notify, onClose }) {
  const { band, songs, groups } = state;
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }
  const [confirmDel, setConfirmDel] = useState(null);
  const [busy, setBusy] = useState(null); // 처리 중인 곡/그룹 id
  const bySong = groupsBySong(state);
  const ungrouped = songs.filter((s) => !bySong.has(s.id)).length;

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      await fn();
      if (okMsg) toast(okMsg);
      await notify();
      return true;
    } catch (e) {
      toast(errorText(e), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const add = async (e) => {
    e?.preventDefault();
    if (!newName.trim()) return;
    if (await run('new', () => createGroup(token, newName))) setNewName('');
  };

  const toggle = (song, groupId) => {
    const current = (bySong.get(song.id) || []).map((g) => g.id);
    let next;
    if (current.includes(groupId)) next = current.filter((id) => id !== groupId);
    else next = band.multi_group ? [...current, groupId] : [groupId];
    run(song.id, () => setSongGroups(token, song.id, next));
  };

  return (
    <Sheet title="그룹 나누기" onClose={onClose}>
      <p className="muted small">
        곡을 바구니(그룹)로 나눠요. 투표와 순위는 그룹 안에서만 따로 매겨요. 모두가 모든 그룹에 투표해요.
        {band.multi_group ? ' 한 곡을 여러 그룹에 넣을 수 있어요.' : ' 한 곡은 그룹 하나에만 들어가요.'}
      </p>

      <h3 className="section-title">그룹 {groups.length}개</h3>
      <ul className="group-list">
        {groups.map((g) => (
          <li key={g.id}>
            {editing?.id === g.id ? (
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run(g.id, () => renameGroup(token, g.id, editing.name))) setEditing(null);
                }}
              >
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value.slice(0, 20) })}
                  autoFocus
                  aria-label="그룹 이름"
                />
                <Button className="primary-btn small" busy={busy === g.id} type="submit">
                  저장
                </Button>
              </form>
            ) : confirmDel === g.id ? (
              <div className="inline-form">
                <span className="grow">‘{g.name}’ 그룹을 지울까요? 곡은 미분류로 돌아가요.</span>
                <button className="ghost-btn small" onClick={() => setConfirmDel(null)}>
                  아니요
                </button>
                <Button
                  className="danger-btn small"
                  busy={busy === g.id}
                  onClick={async () => (await run(g.id, () => deleteGroup(token, g.id))) && setConfirmDel(null)}
                >
                  지우기
                </Button>
              </div>
            ) : (
              <>
                <span className="group-name">{g.name}</span>
                <span className="muted small">{g.song_ids.length}곡</span>
                <button className="icon-btn" onClick={() => setEditing({ id: g.id, name: g.name })} aria-label={`${g.name} 이름 바꾸기`}>
                  <Icon name="edit" size={16} />
                </button>
                <button className="icon-btn" onClick={() => setConfirmDel(g.id)} aria-label={`${g.name} 지우기`}>
                  <Icon name="trash" size={16} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value.slice(0, 20))}
          placeholder="새 그룹 이름 (예: 남보컬)"
          aria-label="새 그룹 이름"
        />
        <Button className="primary-btn small" busy={busy === 'new'} type="submit" disabled={!newName.trim()}>
          <Icon name="plus" size={15} /> 추가
        </Button>
      </form>

      <h3 className="section-title">
        곡 {songs.length}개{ungrouped > 0 && <span className="warn-text"> · 미분류 {ungrouped}곡</span>}
      </h3>
      {groups.length === 0 ? (
        <p className="empty-line">먼저 그룹을 만들어 주세요.</p>
      ) : songs.length === 0 ? (
        <p className="empty-line">아직 올라온 곡이 없어요.</p>
      ) : (
        <ul className="assign-list">
          {songs.map((s) => {
            const mine = (bySong.get(s.id) || []).map((g) => g.id);
            return (
              <li key={s.id} className={mine.length === 0 ? 'is-ungrouped' : ''}>
                <div className="assign-song">
                  <SongThumb song={s} />
                  <div>
                    <strong>{s.title}</strong>
                    <small>{s.artist || '아티스트 미입력'}</small>
                  </div>
                </div>
                <div className="chip-row" role="group" aria-label={`${s.title} 그룹`}>
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      className={`chip-btn${mine.includes(g.id) ? ' on' : ''}`}
                      aria-pressed={mine.includes(g.id)}
                      onClick={() => toggle(s, g.id)}
                      disabled={busy === s.id}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="hint">투표를 시작하면 그룹은 고정돼요. 곡이 하나도 없는 그룹은 그때 자동으로 지워져요.</p>
    </Sheet>
  );
}
