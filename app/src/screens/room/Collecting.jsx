// [C-1] 곡 수합 — 곡 올리기 / 내 곡 교체·취소 / 남의 곡 미리듣기 (투표는 아직)
//  · 방장 자유 추가 모드면 방장은 개수 제한 없이 올림
//  · 인당 0곡인 방이면 멤버는 올리기 칸 없이 후보곡 듣기만 (투표는 다음 단계)
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
  const unlimited = isLeader && band.leader_unlimited;
  const myLimit = unlimited ? Infinity : band.songs_per_member;
  const canUpload = myLimit > 0;
  const full = mine.length >= myLimit;
  const yt = band.youtube_enabled;
  // 멤버가 못 올리는 방(인당 0곡)의 방장: 다른 사람 곡 칸은 비어 있을 테니 숨김 (그룹 나누기 버튼만)
  const hideOthers = isLeader && band.songs_per_member === 0 && others.length === 0;

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
      {!canUpload && mine.length === 0 && (
        <section className="block">
          <div className="notice-box">
            <strong>이 방은 방장이 후보곡을 올려요</strong>
            <span>
              {yt ? '올라온 곡을 미리 들어 보고' : '올라온 곡을 음악 앱에서 미리 찾아 들어 보고'}, 투표가 열리면 투표만 하면
              돼요.
            </span>
          </div>
        </section>
      )}

      {(canUpload || mine.length > 0) && (
        <section className="block">
          <div className="block-head">
            <h2 className="h-md">
              내 곡{' '}
              <span className="count">{unlimited ? mine.length : `${mine.length}/${band.songs_per_member}`}</span>
              {unlimited && <em className="free-chip">제한 없음</em>}
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
                <strong>{unlimited ? '후보곡을 올려 주세요' : '하고 싶은 곡을 올려 주세요'}</strong>
                <small>
                  {yt
                    ? '유튜브 링크를 붙여 넣고, 들려주고 싶은 부분을 하이라이트로 잡아요'
                    : '곡 제목과 아티스트만 적으면 돼요'}
                  {unlimited && ' · 방장은 개수 제한 없이 올릴 수 있어요'}
                </small>
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
            <p className="hint">
              {canUpload
                ? '올릴 수 있는 곡을 다 채웠어요. 바꾸고 싶으면 교체를 눌러요.'
                : '이제 이 방은 방장만 곡을 올려요. 올린 곡은 바꾸거나 취소할 수 있어요.'}
            </p>
          )}
        </section>
      )}

      <section className="block">
        <div className="block-head">
          <h2 className="h-md">
            {hideOthers ? '투표 준비' : canUpload ? '모두가 올린 곡' : isLeader ? '다른 사람이 올린 곡' : '후보곡'}{' '}
            {!hideOthers && <span className="count">{others.length}</span>}
          </h2>
        </div>
        <p className="muted small">
          {hideOthers
            ? '멤버는 곡을 안 올리는 방이에요. 후보곡을 다 올렸으면 방장 메뉴에서 투표를 시작해요.'
            : `${yt ? '미리 들어 볼 수 있어요.' : '음악 앱에서 미리 찾아 들어 볼 수 있어요.'} 투표는 방장이 곡 수합을 마감하면 열려요.`}
        </p>
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
        {hideOthers ? null : others.length === 0 ? (
          <p className="empty-line">{canUpload ? '아직 다른 사람이 올린 곡이 없어요.' : '아직 올라온 곡이 없어요.'}</p>
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
