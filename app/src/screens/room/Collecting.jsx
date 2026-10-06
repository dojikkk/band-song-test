// [C-1] 곡 수합 — 곡 올리기 / 내 곡 교체·취소 / 남의 곡 미리듣기 (투표는 아직)
import { useState } from 'react';
import Icon from '../../components/Icon';
import SongCard from '../../components/SongCard';
import { Button, useToast } from '../../components/ui';
import { deleteSong, errorText } from '../../lib/api';
import AddSongSheet from './AddSongSheet';
import { groupsBySong } from '../../lib/selectors';
import { groupStatus } from './LeaderPanel';

export default function Collecting({ state, token, notify, onOpenGroups }) {
  const { band, songs, me } = state;
  const isLeader = me.role === 'leader';
  const bySong = band.use_groups ? groupsBySong(state) : null;
  const ungrouped = bySong ? songs.filter((s) => !bySong.has(s.id)).length : 0;
  const toast = useToast();
  const mine = songs.filter((s) => s.mine);
  const others = songs.filter((s) => !s.mine);
  const queue = [...mine, ...others];
  const full = mine.length >= band.songs_per_member;

  const [sheet, setSheet] = useState(null); // { editing: song|null }
  const [confirmDel, setConfirmDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const remove = async (song) => {
    setBusy(true);
    try {
      await deleteSong(token, song.id);
      toast('올린 곡을 취소했어요');
      setConfirmDel(null);
      await notify();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="block">
        <div className="block-head">
          <h2 className="h-md">
            내 곡 <span className="count">{mine.length}/{band.songs_per_member}</span>
          </h2>
          {!full && (
            <button className="primary-btn small" onClick={() => setSheet({ editing: null })}>
              <Icon name="plus" size={16} /> 곡 올리기
            </button>
          )}
        </div>

        {mine.length === 0 ? (
          <button className="empty-add" onClick={() => setSheet({ editing: null })}>
            <Icon name="plus" size={22} />
            <span>
              <strong>하고 싶은 곡을 올려 주세요</strong>
              <small>유튜브 링크를 붙여 넣고, 들려주고 싶은 부분을 하이라이트로 잡아요</small>
            </span>
          </button>
        ) : (
          mine.map((s) => (
            <SongCard key={s.id} song={s} queue={queue} showSubmitter={false} groups={bySong?.get(s.id)}>
              {confirmDel === s.id ? (
                <div className="card-actions confirm">
                  <span>이 곡을 빼요?</span>
                  <button className="ghost-btn small" onClick={() => setConfirmDel(null)} disabled={busy}>
                    아니요
                  </button>
                  <Button className="danger-btn small" busy={busy} onClick={() => remove(s)}>
                    빼기
                  </Button>
                </div>
              ) : (
                <div className="card-actions">
                  <button className="ghost-btn small" onClick={() => setSheet({ editing: s })}>
                    <Icon name="edit" size={15} /> 교체·수정
                  </button>
                  <button className="ghost-btn small" onClick={() => setConfirmDel(s.id)}>
                    <Icon name="trash" size={15} /> 취소
                  </button>
                </div>
              )}
            </SongCard>
          ))
        )}
        {full && mine.length > 0 && (
          <p className="hint">올릴 수 있는 곡을 다 채웠어요. 바꾸고 싶으면 교체를 눌러요.</p>
        )}
      </section>

      <section className="block">
        <div className="block-head">
          <h2 className="h-md">
            모두가 올린 곡 <span className="count">{others.length}</span>
          </h2>
        </div>
        <p className="muted small">미리 들어 볼 수 있어요. 투표는 방장이 곡 수합을 마감하면 열려요.</p>
        {isLeader && band.use_groups && (
          <button className="row-link boxed" onClick={onOpenGroups}>
            <span>
              <strong>그룹 나누기</strong>
              <small>
                {groupStatus(state.groups.length, songs.length, ungrouped)}
                {ungrouped > 0 && state.groups.length > 0 && ' — 투표 전에 모두 넣어야 해요'}
              </small>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        )}
        {others.length === 0 ? (
          <p className="empty-line">아직 다른 사람이 올린 곡이 없어요.</p>
        ) : (
          others.map((s) => <SongCard key={s.id} song={s} queue={queue} groups={bySong?.get(s.id)} />)
        )}
      </section>

      {sheet && (
        <AddSongSheet
          token={token}
          band={band}
          editing={sheet.editing}
          onClose={() => setSheet(null)}
          notify={notify}
          onSaved={async (msg) => {
            setSheet(null);
            toast(msg);
            await notify();
          }}
        />
      )}
    </>
  );
}
