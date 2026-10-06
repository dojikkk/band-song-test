// 파트 배분 — 선정된 곡마다 파트 자리(보컬/기타1…)를 누가 맡을지
//  1) 각자 "내 파트"(칠 수 있는 악기)를 표시
//  2) 곡마다 하고 싶은 자리에 "할래요" 손들기
//  3) 방장이 보고 배정 (사람 문제는 사람이 — 앱은 정리만 도와줌)
import { useState } from 'react';
import Icon from '../../components/Icon';
import { Button, Sheet, copyText, useToast } from '../../components/ui';
import {
  addSlot,
  assignSlot,
  errorText,
  removeSlot,
  setMyParts,
  toggleSlotRequest,
} from '../../lib/api';
import { activeMembers, memberName } from '../../lib/selectors';
import { thumbUrl } from '../../lib/youtube';

const PRESETS = ['보컬', '코러스', '기타', '베이스', '드럼', '키보드'];

export default function Parts({ state, token, notify, onEditSettings }) {
  const { me, band, songs, slots } = state;
  const toast = useToast();
  const isLeader = me.role === 'leader';
  const finals = songs.filter((s) => s.selected);
  const [assigning, setAssigning] = useState(null); // slot
  const [busy, setBusy] = useState(null);
  const [newSlot, setNewSlot] = useState({}); // songId → text

  const run = async (key, fn, msg) => {
    setBusy(key);
    try {
      await fn();
      if (msg) toast(msg);
      await notify();
      return true;
    } catch (e) {
      toast(errorText(e), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const slotsOf = (songId) => slots.filter((x) => x.song_id === songId);
  const assignedCount = slots.filter((x) => finals.some((f) => f.id === x.song_id) && x.assignee).length;
  const totalCount = slots.filter((x) => finals.some((f) => f.id === x.song_id)).length;

  // 멤버별 정리
  const byMember = activeMembers(state).map((m) => ({
    member: m,
    jobs: finals.flatMap((f) => slotsOf(f.id).filter((x) => x.assignee === m.id).map((x) => ({ song: f, slot: x }))),
  }));

  const copyTable = async () => {
    const lines = [`[${band.name}] 파트 배분`];
    for (const f of finals) {
      lines.push('', `▸ ${f.title}${f.artist ? ` - ${f.artist}` : ''}`);
      for (const x of slotsOf(f.id)) lines.push(`  ${x.name}: ${x.assignee ? memberName(state, x.assignee) : '미정'}`);
    }
    if (await copyText(lines.join('\n'))) toast('파트표를 복사했어요');
  };

  return (
    <>
      <MyParts me={me} token={token} notify={notify} />

      <section className="block">
        <div className="block-head">
          <h2 className="h-md">
            곡별 파트 {totalCount > 0 && <span className="count">{assignedCount}/{totalCount} 배정</span>}
          </h2>
          {finals.length > 0 && (
            <button className="ghost-btn small" onClick={copyTable}>
              <Icon name="copy" size={15} /> 파트표 복사
            </button>
          )}
        </div>
        {finals.length === 0 ? (
          <p className="empty-line">
            {isLeader ? '결과 화면에서 곡을 ‘선정’하면 여기에 파트 자리가 생겨요.' : '방장이 최종 곡을 선정하면 여기서 파트를 나눠요.'}
          </p>
        ) : (
          <>
            <p className="muted small">
              {isLeader
                ? '자리를 누르면 사람을 배정할 수 있어요. 손든 사람이 위에 보여요.'
                : '하고 싶은 자리에 ‘할래요’를 눌러 손을 들어요. 배정은 방장이 해요.'}
              {isLeader && (
                <>
                  {' '}
                  <button className="text-btn inline" onClick={onEditSettings}>
                    기본 편성 바꾸기
                  </button>
                </>
              )}
            </p>
            {finals.map((f) => (
              <article className="card part-card" key={f.id}>
                <div className="part-head">
                  <img src={thumbUrl(f.youtube_id)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  <div>
                    <strong>{f.title}</strong>
                    <small>{f.artist || '아티스트 미입력'}</small>
                  </div>
                </div>
                <ul className="slot-list">
                  {slotsOf(f.id).map((x) => {
                    const mineReq = x.requests.includes(me.id);
                    const inner = (
                      <>
                        <span className="slot-name">{x.name}</span>
                        <span className={`slot-who${x.assignee ? '' : ' unassigned'}`}>
                          {x.assignee ? memberName(state, x.assignee) : '미정'}
                          {x.requests.length > 0 && (
                            <small>손든 사람 {x.requests.map((id) => memberName(state, id)).join(', ')}</small>
                          )}
                        </span>
                      </>
                    );
                    return (
                      <li key={x.id} className={x.assignee === me.id ? 'is-me' : ''}>
                        {isLeader ? (
                          <button className="slot-main" onClick={() => setAssigning(x)} aria-label={`${f.title} ${x.name} 배정`}>
                            {inner}
                          </button>
                        ) : (
                          <div className="slot-main">{inner}</div>
                        )}
                        <Button
                          className={`hand-btn${mineReq ? ' on' : ''}`}
                          busy={busy === x.id}
                          onClick={() => run(x.id, () => toggleSlotRequest(token, x.id))}
                          aria-pressed={mineReq}
                        >
                          {mineReq ? '손 내리기' : '할래요'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                {isLeader && (
                  <form
                    className="inline-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const name = (newSlot[f.id] || '').trim();
                      if (!name) return;
                      if (await run(`add-${f.id}`, () => addSlot(token, f.id, name))) setNewSlot((s) => ({ ...s, [f.id]: '' }));
                    }}
                  >
                    <input
                      value={newSlot[f.id] || ''}
                      onChange={(e) => setNewSlot((s) => ({ ...s, [f.id]: e.target.value.slice(0, 12) }))}
                      placeholder="이 곡에만 파트 추가 (예: 신디)"
                      aria-label={`${f.title} 파트 추가`}
                    />
                    <Button className="ghost-btn small" busy={busy === `add-${f.id}`} type="submit">
                      <Icon name="plus" size={14} /> 추가
                    </Button>
                  </form>
                )}
              </article>
            ))}
          </>
        )}
      </section>

      {finals.length > 0 && (
        <section className="block">
          <h2 className="h-md">사람별로 보기</h2>
          <ul className="who-list">
            {byMember.map(({ member, jobs }) => (
              <li key={member.id} className={member.id === me.id ? 'is-me' : ''}>
                <span className="who-name">
                  {member.name}
                  <small>{jobs.length}곡</small>
                </span>
                <span className="who-jobs">
                  {jobs.length === 0 ? '아직 없음' : jobs.map((j) => `${j.song.title}(${j.slot.name})`).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {assigning && (
        <AssignSheet
          state={state}
          slot={assigning}
          song={songs.find((s) => s.id === assigning.song_id)}
          onClose={() => setAssigning(null)}
          onAssign={async (memberId) => {
            if (await run('assign', () => assignSlot(token, assigning.id, memberId))) setAssigning(null);
          }}
          onRemove={async () => {
            if (await run('remove', () => removeSlot(token, assigning.id), `${assigning.name} 자리를 뺐어요`)) setAssigning(null);
          }}
          busy={busy}
        />
      )}
    </>
  );
}

// 내가 칠 수 있는 파트 표시
function MyParts({ me, token, notify }) {
  const toast = useToast();
  const [parts, setParts] = useState(me.parts || []);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(parts) !== JSON.stringify(me.parts || []);
  const all = [...PRESETS, ...parts.filter((p) => !PRESETS.includes(p))];

  const toggle = (p) => setParts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : cur.length >= 6 ? cur : [...cur, p]));

  const save = async () => {
    setBusy(true);
    try {
      await setMyParts(token, parts);
      toast('내 파트를 저장했어요');
      await notify();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="block">
      <div className="block-head">
        <h2 className="h-md">내 파트</h2>
        {dirty && (
          <Button className="primary-btn small" busy={busy} onClick={save}>
            저장
          </Button>
        )}
      </div>
      <p className="muted small">내가 맡을 수 있는 악기를 골라 두면 방장이 배정할 때 참고해요.</p>
      <div className="chip-row">
        {all.map((p) => (
          <button key={p} className={`chip-btn${parts.includes(p) ? ' on' : ''}`} aria-pressed={parts.includes(p)} onClick={() => toggle(p)}>
            {p}
          </button>
        ))}
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = custom.trim().slice(0, 10);
          if (v && !parts.includes(v) && parts.length < 6) setParts([...parts, v]);
          setCustom('');
        }}
      >
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="다른 악기 (예: 바이올린)" aria-label="다른 악기" />
        <button className="ghost-btn small" type="submit" disabled={!custom.trim()}>
          <Icon name="plus" size={14} /> 추가
        </button>
      </form>
    </section>
  );
}

// 방장: 자리에 사람 배정
function AssignSheet({ state, slot, song, onClose, onAssign, onRemove, busy }) {
  const members = activeMembers(state);
  const req = new Set(slot.requests);
  const base = slot.name.replace(/\d+$/, '');
  const ordered = [...members].sort((a, b) => {
    const score = (m) => (req.has(m.id) ? 2 : 0) + (m.parts?.some((p) => base.includes(p) || p.includes(base)) ? 1 : 0);
    return score(b) - score(a);
  });
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <Sheet title={`${song?.title ?? ''} · ${slot.name}`} onClose={onClose}>
      <ul className="pick-list">
        {ordered.map((m) => (
          <li key={m.id}>
            <button
              className={`pick-row${slot.assignee === m.id ? ' on' : ''}`}
              onClick={() => onAssign(m.id)}
              disabled={busy === 'assign'}
            >
              <span className="pick-name">{m.name}</span>
              <span className="pick-tags">
                {req.has(m.id) && <span className="tag spot">손듦</span>}
                {m.parts?.map((p) => (
                  <span key={p} className="tag">
                    {p}
                  </span>
                ))}
              </span>
              {slot.assignee === m.id && <Icon name="check" size={16} />}
            </button>
          </li>
        ))}
      </ul>
      <button className="ghost-btn" onClick={() => onAssign(null)} disabled={busy === 'assign' || !slot.assignee}>
        미정으로 두기
      </button>
      {!confirmRemove ? (
        <button className="text-btn danger" onClick={() => setConfirmRemove(true)}>
          이 곡에서 ‘{slot.name}’ 자리 빼기
        </button>
      ) : (
        <div className="confirm-box">
          <p>‘{slot.name}’ 자리와 손든 기록이 지워져요.</p>
          <div className="row-btns">
            <button className="ghost-btn" onClick={() => setConfirmRemove(false)}>
              취소
            </button>
            <Button className="danger-btn" busy={busy === 'remove'} onClick={onRemove}>
              빼기
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
