// [C-2] 투표 (v1 다수결) — 곡을 들어보고 최대 N곡 골라서 제출
// 고른 목록은 내 화면에만 있다가 "투표하기"를 눌러야 DB로 감 (실수로 누른 표가 바로 확정되지 않게)
import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import SongCard from '../../components/SongCard';
import { DockBar } from '../../components/Dock';
import { Button, useToast } from '../../components/ui';
import { errorText, submitVotes } from '../../lib/api';

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

export default function Voting({ state, token, notify }) {
  const { band, songs, members, my_votes: myVotes } = state;
  const toast = useToast();
  const limit = band.votes_per_member;
  const saved = useMemo(() => new Set(myVotes), [myVotes]);
  const [picked, setPicked] = useState(() => new Set(myVotes));
  const [busy, setBusy] = useState(false);

  const submitted = saved.size > 0;
  const locked = submitted && !band.allow_vote_change;
  const dirty = !sameSet(picked, saved);

  // 저장된 투표 "내용"이 바뀌었을 때만(= 제출 직후, 다른 기기에서 수정) 화면 선택을 맞춤.
  // 15초마다 새로 받아오는 것만으로는 고르던 중인 선택이 초기화되지 않게 내용 기준으로 비교.
  const savedKey = [...myVotes].sort().join(',');
  useEffect(() => {
    setPicked(new Set(savedKey ? savedKey.split(',') : []));
  }, [savedKey]);

  const toggle = (id) => {
    if (locked) {
      toast('이 방은 투표 후 수정이 꺼져 있어요.');
      return;
    }
    if (!picked.has(id) && picked.size >= limit) {
      toast(`최대 ${limit}곡까지 고를 수 있어요. 다른 곡을 먼저 빼 주세요.`);
      return;
    }
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const submit = async () => {
    setBusy(true);
    try {
      await submitVotes(token, [...picked]);
      toast(submitted ? '투표를 바꿨어요' : '투표했어요');
      await notify();
    } catch (e) {
      toast(errorText(e), 'error');
      await notify();
    } finally {
      setBusy(false);
    }
  };

  const votedCount = members.filter((m) => m.voted).length;

  return (
    <>
      <section className="block">
        <div className="vote-intro">
          <h2 className="h-md">마음에 드는 곡을 {limit}곡까지 골라요</h2>
          <p className="muted small">
            {band.anonymous_votes ? '익명 투표예요. 누가 뭘 골랐는지는 아무도 몰라요.' : '공개 투표예요. 마감 후 결과에 이름이 나와요.'}{' '}
            결과는 방장이 마감하면 모두에게 동시에 공개돼요.
          </p>
          <div className="progress-line" aria-label="투표 참여">
            <span style={{ width: `${(votedCount / Math.max(1, members.length)) * 100}%` }} />
          </div>
          <p className="small muted">
            {votedCount}/{members.length}명 투표 완료
          </p>
        </div>

        {songs.map((s, i) => {
          const on = picked.has(s.id);
          return (
            <SongCard
              key={s.id}
              song={s}
              queue={songs}
              className={on ? 'is-picked' : ''}
              badge={<span className="song-no">{i + 1}</span>}
            >
              <button
                className={`pick-btn${on ? ' on' : ''}`}
                onClick={() => toggle(s.id)}
                aria-pressed={on}
                disabled={locked}
              >
                {on ? (
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
              <Icon name="check" size={16} /> 투표 완료
            </span>
            <span className="muted small">
              {band.allow_vote_change ? '마감 전까지 바꿀 수 있어요' : '이 방은 수정이 안 돼요'}
            </span>
          </div>
        ) : (
          <div className="bar-row">
            <span className="bar-count">
              <strong>{picked.size}</strong>/{limit}곡 골랐어요
            </span>
            {submitted && (
              <button className="ghost-btn small" onClick={() => setPicked(new Set(saved))} disabled={busy}>
                되돌리기
              </button>
            )}
            <Button className="primary-btn small" busy={busy} onClick={submit} disabled={picked.size === 0}>
              {submitted ? '바꾼 걸로 제출' : '투표하기'}
            </Button>
          </div>
        )}
      </DockBar>
    </>
  );
}
