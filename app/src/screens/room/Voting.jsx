// [C-2] 투표 — 그룹마다 따로 제출
//  · 다수결: 그룹마다 마음에 드는 곡 최대 N곡 고르기
//  · 점수제(보르다): 곡을 줄 세우기. 맨 위가 1위(n점) … 맨 아래가 꼴찌(1점).
//    한 곡 = 얇은 한 줄. ▲▼ 버튼으로 한 칸씩, ⤒로 맨 위로. "상세보기"를 누르면 펼쳐져서
//    썸네일(재생)·하이라이트·다른 앱 링크·코멘트가 보임. 처음 순서는 사람마다 무작위로 섞음
//    (모두 같은 순서로 시작하면 그대로 낸 표가 먼저 올라온 곡에 몰리니까)
//  · 청취 후 투표(옵션): 이 기기에서 들어본 곡만 고를 수 있음. 점수제는 전부 들어야 제출
//  · 투표 제한: 방장이 나를 뺀 그룹은 곡만 들을 수 있고 투표 칸이 없음
// 고른 내용은 내 화면에만 있다가 "제출"을 눌러야 DB로 감
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import SongCard from '../../components/SongCard';
import { DockBar } from '../../components/Dock';
import { Button, useToast } from '../../components/ui';
import { errorText, submitBallot } from '../../lib/api';
import { blockedGroupIds, eligibleVoters, myBallots, showGroupTabs, songsInGroup } from '../../lib/selectors';
import { useListened } from '../../lib/listened';
import { particle } from '../../lib/josa';
import { usePlayer } from '../../player/PlayerContext';

const same = (a = [], b = [], ordered) =>
  a.length === b.length && (ordered ? a.every((x, i) => x === b[i]) : a.every((x) => b.includes(x)));

const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

// 사람·그룹마다 늘 같은 무작위 순서 (새로고침해도 안 바뀜)
function seededShuffle(ids, seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619) >>> 0;
  const rand = () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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

  // 점수제 줄 세우기: 순서를 바꾼 카드가 손가락 밑에 그대로 있게 화면을 맞춰 줌
  // (안 그러면 ▲를 연달아 누를 때 방금 자리를 바꾼 옆 카드의 버튼을 누르게 됨)
  const anchor = useRef(null); // { id, top }
  // 화면을 다 못 맞춰 줄 때(페이지 맨 위 근처)는 손가락 밑에 옆 카드가 옴 → 연타가 되돌리기가 되지 않게
  // 방금 밀려난 옆 카드는 잠깐(0.5초) 안 움직이게 막음
  const lastMove = useRef({ other: null, at: 0 });
  const [flash, setFlash] = useState(null);
  const [openIds, setOpenIds] = useState(() => new Set()); // 상세보기 펼친 곡
  const toggleOpen = (id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a) return;
    anchor.current = null;
    const el = document.querySelector(`[data-rank-id="${a.id}"]`);
    if (el) window.scrollBy(0, el.getBoundingClientRect().top - a.top);
  });

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 650);
    return () => clearTimeout(t);
  }, [flash]);

  // 점수제: 기준 순서 = 낸 표가 있으면 그 순서, 없으면 나만의 무작위 순서
  const baseOrder = (g) => {
    const ids = songsInGroup(state, g).map((s) => s.id);
    const sv = saved[g.id] || [];
    if (sameSet(sv, ids)) return sv;
    return seededShuffle(ids, `${state.me.id}:${g.id}`);
  };
  // 지금 화면의 선택(다수결) / 순서(점수제)
  const current = (g) => {
    const d = drafts[g.id] || [];
    if (!borda) return d;
    const base = baseOrder(g);
    return sameSet(d, base) ? d : base;
  };
  const isDirty = (g) => (borda ? !same(current(g), baseOrder(g), true) : !same(current(g), saved[g.id] || [], false));

  // 투표 제한: 내가 빠진 그룹은 투표 대상에서 뺌 (탭은 남겨서 곡은 들을 수 있게)
  const blocked = blockedGroupIds(state, state.me.id);
  const myGroups = groups.filter((g) => !blocked.has(g.id));
  const nextOpenGroup = (exceptId) => myGroups.find((g) => g.id !== exceptId && !(saved[g.id] || []).length);

  const firstOpen = nextOpenGroup(null)?.id ?? myGroups[0]?.id ?? groups[0]?.id;
  const [activeId, setActiveId] = useState(firstOpen);
  const group = groups.find((g) => g.id === activeId) || groups[0];
  if (!group) return <p className="empty-line">투표할 곡이 없어요.</p>;
  const isBlocked = blocked.has(group.id);

  const list = songsInGroup(state, group);
  const n = list.length;
  const draft = current(group);
  const mine = saved[group.id] || [];
  const submitted = mine.length > 0;
  const locked = submitted && !band.allow_vote_change;
  const dirty = isDirty(group);
  const doneGroups = myGroups.filter((g) => (saved[g.id] || []).length > 0).length;
  const members = eligibleVoters(state); // 투표할 그룹이 하나도 없는 사람은 현황에서 뺌
  const votedCount = members.filter((m) => m.voted).length;
  const goNextOpen = () => {
    const g = nextOpenGroup(group.id);
    if (g) {
      setActiveId(g.id);
      window.scrollTo({ top: 0 });
    }
  };

  const setDraft = (ids) => setDrafts((d) => ({ ...d, [group.id]: ids }));

  const needsListen = (song) => band.require_listen && !listened.has(song.id);
  const listenedHere = list.filter((s) => listened.has(s.id)).length;
  const allListened = !band.require_listen || listenedHere === n;

  // 다수결: 눌러서 고르기/빼기
  const tap = (song) => {
    if (locked) return toast('이 방은 투표 후 수정이 꺼져 있어요.');
    if (needsListen(song)) {
      player.play(song, list);
      return toast('먼저 들어 보고 골라 주세요. 하이라이트를 끝까지 들으면 고를 수 있어요.');
    }
    const has = draft.includes(song.id);
    if (has) return setDraft(draft.filter((id) => id !== song.id));
    if (draft.length >= limit) {
      return toast(`최대 ${limit}곡까지 고를 수 있어요. 다른 곡을 먼저 빼 주세요.`);
    }
    setDraft([...draft, song.id]);
  };

  // 점수제: 순서 바꾸기
  const move = (id, to) => {
    if (locked) return toast('이 방은 투표 후 수정이 꺼져 있어요.');
    const from = draft.indexOf(id);
    if (from < 0 || to < 0 || to >= draft.length || to === from) return;
    if (lastMove.current.other === id && Date.now() - lastMove.current.at < 500) return;
    const el = document.querySelector(`[data-rank-id="${id}"]`);
    anchor.current = el ? { id, top: el.getBoundingClientRect().top } : null;
    const next = [...draft];
    next.splice(from, 1);
    next.splice(to, 0, id);
    lastMove.current = { other: next[from], at: Date.now() };
    setDraft(next);
    setFlash(id);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await submitBallot(token, group.id, draft);
      toast(submitted ? '투표를 바꿨어요' : tabs ? `‘${group.name}’ 투표 완료` : '투표했어요');
      await notify();
      // 아직 안 한 그룹이 있으면 그쪽으로
      goNextOpen();
    } catch (e) {
      toast(errorText(e), 'error');
      await notify();
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = borda ? draft.length === n && allListened && (dirty || !submitted) : draft.length > 0;
  const byId = new Map(list.map((s) => [s.id, s]));
  const shown = borda ? draft.map((id) => byId.get(id)).filter(Boolean) : list;

  return (
    <>
      <section className="block">
        <div className="vote-intro">
          <h2 className="h-md">
            {myGroups.length === 0
              ? '이번 투표에선 투표할 그룹이 없어요'
              : borda
                ? '좋은 순서대로 줄을 세워요'
                : `마음에 드는 곡을 ${limit}곡까지 골라요`}
          </h2>
          <p className="muted small">
            {borda
              ? `맨 위가 1위(${n}점), 맨 아래가 꼴찌(1점)예요. ▲▼ 버튼으로 순서를 바꾸고 제출해요. 처음 순서는 사람마다 무작위로 섞여 있어요.${tabs ? ' 그룹마다 따로 내요.' : ''}`
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
            {votedCount}/{members.length}명 투표 완료
            {tabs && myGroups.length > 0 && ` · 나는 그룹 ${myGroups.length}개 중 ${doneGroups}개 완료`}
          </p>
          {band.require_listen && !isBlocked && (
            <p className="small listen-note">
              {borda ? '전부 들어 봐야 제출할 수 있어요' : '들어본 곡만 고를 수 있어요'} · 이 그룹 {n}곡 중 {listenedHere}곡 들음
            </p>
          )}
        </div>

        {tabs && (
          <div className="group-tabs" role="tablist" aria-label="그룹">
            {groups.map((g) => {
              const off = blocked.has(g.id);
              const isDone = !off && (saved[g.id] || []).length > 0;
              const changed = !off && isDirty(g);
              return (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={g.id === group.id}
                  className={`group-tab${g.id === group.id ? ' on' : ''}${isDone ? ' done' : ''}${off ? ' off' : ''}`}
                  onClick={() => setActiveId(g.id)}
                >
                  {isDone && !changed && <Icon name="check" size={14} />}
                  {g.name}
                  <small>{off ? '투표 안 함' : g.song_ids.length}</small>
                  {changed && <span className="dot" aria-label="저장 안 함" />}
                </button>
              );
            })}
          </div>
        )}

        {isBlocked && (
          <div className="notice-box">
            <strong>
              {tabs ? `‘${group.name}’${particle(group.name, '은', '는')} 투표하지 않아요` : '이번 투표는 하지 않아요'}
            </strong>
            <span>방장이 투표에서 빼 두었어요. 곡은 들어 볼 수 있어요.</span>
          </div>
        )}

        {isBlocked
          ? list.map((s) => <SongCard key={s.id} song={s} queue={list} />)
          : shown.map((s, i) => {
            if (borda) {
              const listenFirst = needsListen(s);
              const open = openIds.has(s.id);
              const playing = player?.current?.id === s.id;
              return (
                <div
                  key={s.id}
                  data-rank-id={s.id}
                  className={`rank-item${flash === s.id ? ' flash' : ''}${open ? ' open' : ''}${playing ? ' is-current' : ''}`}
                >
                  <div className="rank-row">
                    <div className="rank-side">
                      <span className={`rank-badge on${i === 0 ? ' top' : ''}`}>{i + 1}위</span>
                      <span className="rank-pts">{n - i}점</span>
                    </div>
                    <button
                      className="rank-main"
                      onClick={() => toggleOpen(s.id)}
                      aria-expanded={open}
                      aria-label={`${s.title} 상세보기`}
                    >
                      <strong className="rank-title">{s.title}</strong>
                      <small className="rank-sub">
                        <span className="rank-artist">{s.artist || '아티스트 미입력'}</span>
                        {listenFirst && <span className="rank-unheard">안 들음</span>}
                        <span className="rank-more">
                          {open ? '접기' : '상세보기'}
                          <Icon name={open ? 'up' : 'down'} size={12} />
                        </span>
                      </small>
                    </button>
                    <div className="rank-btns">
                      <button
                        className="rank-btn"
                        onClick={() => move(s.id, 0)}
                        disabled={locked || i === 0}
                        aria-label={`${s.title} 맨 위로`}
                        title="맨 위로"
                      >
                        <Icon name="top" size={17} />
                      </button>
                      <button
                        className="rank-btn"
                        onClick={() => move(s.id, i - 1)}
                        disabled={locked || i === 0}
                        aria-label={`${s.title} 한 칸 위로`}
                        title="한 칸 위로"
                      >
                        <Icon name="up" size={17} />
                      </button>
                      <button
                        className="rank-btn"
                        onClick={() => move(s.id, i + 1)}
                        disabled={locked || i === n - 1}
                        aria-label={`${s.title} 한 칸 아래로`}
                        title="한 칸 아래로"
                      >
                        <Icon name="down" size={17} />
                      </button>
                    </div>
                  </div>
                  {open && <SongCard song={s} queue={shown} hideTitle className="rank-detail" />}
                </div>
              );
            }

            const on = draft.includes(s.id);
            const listenFirst = needsListen(s);
            return (
              <SongCard
                key={s.id}
                song={s}
                queue={list}
                className={on ? 'is-picked' : ''}
                badge={<span className="song-no">{i + 1}</span>}
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
        {isBlocked ? (
          <div className="bar-row">
            <span className="bar-count">이 그룹은 투표 안 해요</span>
            {nextOpenGroup(group.id) && (
              <button className="primary-btn small" onClick={goNextOpen}>
                남은 그룹 하기
              </button>
            )}
          </div>
        ) : submitted && !dirty ? (
          <div className="bar-row">
            <span className="bar-done">
              <Icon name="check" size={16} /> {tabs ? `‘${group.name}’ 완료` : '투표 완료'}
            </span>
            {tabs && nextOpenGroup(group.id) ? (
              <button className="primary-btn small" onClick={goNextOpen}>
                남은 그룹 하기
              </button>
            ) : (
              <span className="muted small">{band.allow_vote_change ? '마감 전까지 바꿀 수 있어요' : '수정 안 돼요'}</span>
            )}
          </div>
        ) : (
          <div className="bar-row">
            <span className="bar-count">
              {borda ? (
                !allListened ? (
                  <>
                    들은 곡 <strong>{listenedHere}</strong>/{n}
                  </>
                ) : (
                  <>
                    <strong>{n}</strong>곡 · 위에서부터 1위
                  </>
                )
              ) : (
                <>
                  <strong>{draft.length}</strong>/{limit}곡 골랐어요
                </>
              )}
            </span>
            {(borda ? dirty : submitted) && (
              <button className="ghost-btn small" onClick={() => setDraft(borda ? baseOrder(group) : mine)} disabled={busy}>
                {submitted ? '되돌리기' : '처음 순서로'}
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
