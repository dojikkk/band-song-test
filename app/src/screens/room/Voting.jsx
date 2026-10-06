// [C-2] 투표 — 그룹마다 따로 제출
//  · 다수결: 그룹마다 마음에 드는 곡 최대 N곡 고르기
//  · 점수제(보르다): 좋은 순서대로 눌러서 순위 → 1등 n점 … 꼴등 1점. 전부 매겨야 제출 가능
//  · 청취 후 투표(옵션): 이 기기에서 들어본 곡만 고를 수 있음
// 고른 내용은 내 화면에만 있다가 "제출"을 눌러야 DB로 감
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import SongCard from '../../components/SongCard';
import { DockBar } from '../../components/Dock';
import { Button, useToast } from '../../components/ui';
import { errorText, submitBallot } from '../../lib/api';
import { activeMembers, myBallots, showGroupTabs, songsInGroup } from '../../lib/selectors';
import { useListened } from '../../lib/listened';
import { usePlayer } from '../../player/PlayerContext';

const same = (a = [], b = [], ordered) =>
  a.length === b.length && (ordered ? a.every((x, i) => x === b[i]) : a.every((x) => b.includes(x)));

export default function Voting({ state, token, notify }) {
  const { band, groups } = state;
  const toast = useToast();
  const player = usePlayer();
  const listened = useListened(band.id);
  const borda = band.vote_method === 'borda';
  const limit = band.votes_per_member;
  const tabs = showGroupTabs(state);

  const saved = useMemo(() => myBallots(state), [state]);
  const savedKey = JSON.stringify(saved);
  const [drafts, setDrafts] = useState(() => ({ ...saved }));
  const prevSaved = useRef(saved);
  const [busy, setBusy] = useState(false);

  // 저장된 표가 "바뀐 그룹"만 화면 선택을 맞춤 (다른 그룹에서 고르던 건 그대로 둠)
  useEffect(() => {
    const prev = prevSaved.current;
    setDrafts((d) => {
      const next = { ...d };
      for (const g of groups) {
        if (JSON.stringify(prev[g.id] || []) !== JSON.stringify(saved[g.id] || [])) next[g.id] = saved[g.id] || [];
      }
      return next;
    });
    prevSaved.current = saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const firstOpen = groups.find((g) => !(saved[g.id] || []).length)?.id ?? groups[0]?.id;
  const [activeId, setActiveId] = useState(firstOpen);
  const group = groups.find((g) => g.id === activeId) || groups[0];
  if (!group) return <p className="empty-line">투표할 곡이 없어요.</p>;

  const list = songsInGroup(state, group);
  const n = list.length;
  const draft = drafts[group.id] || [];
  const mine = saved[group.id] || [];
  const submitted = mine.length > 0;
  const locked = submitted && !band.allow_vote_change;
  const dirty = !same(draft, mine, borda);
  const doneGroups = groups.filter((g) => (saved[g.id] || []).length > 0).length;
  const members = activeMembers(state);
  const votedCount = members.filter((m) => m.voted).length;

  const setDraft = (ids) => setDrafts((d) => ({ ...d, [group.id]: ids }));

  const needsListen = (song) => band.require_listen && !listened.has(song.id);

  const tap = (song) => {
    if (locked) return toast('이 방은 투표 후 수정이 꺼져 있어요.');
    if (needsListen(song)) {
      player.play(song, list);
      return toast('먼저 들어 보고 골라 주세요. 하이라이트를 끝까지 들으면 고를 수 있어요.');
    }
    const has = draft.includes(song.id);
    if (has) return setDraft(draft.filter((id) => id !== song.id)); // 점수제: 뒤 순위가 한 칸씩 당겨짐
    if (!borda && draft.length >= limit) {
      return toast(`최대 ${limit}곡까지 고를 수 있어요. 다른 곡을 먼저 빼 주세요.`);
    }
    setDraft([...draft, song.id]);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await submitBallot(token, group.id, draft);
      toast(submitted ? '투표를 바꿨어요' : tabs ? `‘${group.name}’ 투표 완료` : '투표했어요');
      await notify();
      // 아직 안 한 그룹이 있으면 그쪽으로
      const nextOpen = groups.find((g) => g.id !== group.id && !(saved[g.id] || []).length);
      if (nextOpen) setActiveId(nextOpen.id);
    } catch (e) {
      toast(errorText(e), 'error');
      await notify();
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = borda ? draft.length === n : draft.length > 0;
  const listenedHere = list.filter((s) => listened.has(s.id)).length;

  return (
    <>
      <section className="block">
        <div className="vote-intro">
          <h2 className="h-md">
            {borda ? '좋은 순서대로 순위를 매겨요' : `마음에 드는 곡을 ${limit}곡까지 골라요`}
          </h2>
          <p className="muted small">
            {borda
              ? `1등부터 차례로 누르면 순위가 붙어요. 1등 ${n}점, 꼴등 1점. ${tabs ? '그룹 안 ' : ''}곡을 전부 매겨야 제출돼요.`
              : tabs
                ? '그룹마다 따로 골라요.'
                : ''}{' '}
            {band.anonymous_votes ? '익명 투표예요.' : '공개 투표예요. 결과에 이름이 나와요.'} 결과는 방장이 마감하면 모두에게
            동시에 공개돼요.
          </p>
          <div className="progress-line" aria-label="투표 참여">
            <span style={{ width: `${(votedCount / Math.max(1, members.length)) * 100}%` }} />
          </div>
          <p className="small muted">
            {votedCount}/{members.length}명 투표 완료{tabs && ` · 나는 그룹 ${groups.length}개 중 ${doneGroups}개 완료`}
          </p>
          {band.require_listen && (
            <p className="small listen-note">
              들어본 곡만 고를 수 있어요 · 이 그룹 {n}곡 중 {listenedHere}곡 들음
            </p>
          )}
        </div>

        {tabs && (
          <div className="group-tabs" role="tablist" aria-label="그룹">
            {groups.map((g) => {
              const isDone = (saved[g.id] || []).length > 0;
              const isDirty = !same(drafts[g.id] || [], saved[g.id] || [], borda);
              return (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={g.id === group.id}
                  className={`group-tab${g.id === group.id ? ' on' : ''}${isDone ? ' done' : ''}`}
                  onClick={() => setActiveId(g.id)}
                >
                  {isDone && !isDirty && <Icon name="check" size={14} />}
                  {g.name}
                  <small>{g.song_ids.length}</small>
                  {isDirty && <span className="dot" aria-label="저장 안 함" />}
                </button>
              );
            })}
          </div>
        )}

        {list.map((s, i) => {
          const pos = draft.indexOf(s.id);
          const on = pos >= 0;
          const listenFirst = needsListen(s);
          return (
            <SongCard
              key={s.id}
              song={s}
              queue={list}
              className={on ? 'is-picked' : ''}
              badge={
                borda && on ? (
                  <span className="rank-badge on">{pos + 1}위</span>
                ) : (
                  <span className="song-no">{i + 1}</span>
                )
              }
            >
              <button
                className={`pick-btn${on ? ' on' : ''}${listenFirst ? ' listen' : ''}`}
                onClick={() => tap(s)}
                aria-pressed={on}
                disabled={locked}
              >
                {listenFirst ? (
                  <>
                    <Icon name="play" size={15} /> 먼저 들어보기
                  </>
                ) : borda ? (
                  on ? (
                    <>
                      {pos + 1}위 · {n - pos}점 <small>누르면 빼기</small>
                    </>
                  ) : (
                    `${draft.length + 1}위로 매기기`
                  )
                ) : on ? (
                  <>
                    <Icon name="check" size={16} /> 골랐어요
                  </>
                ) : (
                  '이 곡 고르기'
                )}
              </button>
            </SongCard>
          );
        })}
      </section>

      <DockBar>
        {submitted && !dirty ? (
          <div className="bar-row">
            <span className="bar-done">
              <Icon name="check" size={16} /> {tabs ? `‘${group.name}’ 완료` : '투표 완료'}
            </span>
            {tabs && doneGroups < groups.length ? (
              <button
                className="primary-btn small"
                onClick={() => setActiveId(groups.find((g) => !(saved[g.id] || []).length)?.id)}
              >
                남은 그룹 하기
              </button>
            ) : (
              <span className="muted small">{band.allow_vote_change ? '마감 전까지 바꿀 수 있어요' : '수정 안 돼요'}</span>
            )}
          </div>
        ) : (
          <div className="bar-row">
            <span className="bar-count">
              <strong>{draft.length}</strong>/{borda ? n : limit}곡 {borda ? '순위 매김' : '골랐어요'}
            </span>
            {(submitted || (borda && draft.length > 0)) && (
              <button
                className="ghost-btn small"
                onClick={() => setDraft(submitted ? mine : [])}
                disabled={busy}
              >
                {submitted ? '되돌리기' : '다시 매기기'}
              </button>
            )}
            <Button className="primary-btn small" busy={busy} onClick={submit} disabled={!canSubmit || locked}>
              {submitted ? '바꾼 걸로 제출' : '제출'}
            </Button>
          </div>
        )}
      </DockBar>
    </>
  );
}
