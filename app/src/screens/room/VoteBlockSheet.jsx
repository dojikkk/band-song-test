// [D] 투표 제한 — 방장 전용. 그룹마다 "이 사람은 투표 안 함"을 정함
//  · 빠진 사람도 그 그룹 곡은 보고 들을 수 있음. 투표만 막힘 (DB가 강제)
//  · 설정중·곡 수합·투표 중에 바꿀 수 있고, 확정되면 고정
//  · 투표 중에 빼면 그 사람이 그 그룹에 이미 낸 표는 지워짐 → 한 번 더 물어봄
import { useState } from 'react';
import Icon from '../../components/Icon';
import { Button, Sheet, useToast } from '../../components/ui';
import { errorText, setVoteBlock } from '../../lib/api';
import { josa } from '../../lib/josa';
import { activeMembers } from '../../lib/selectors';


export default function VoteBlockSheet({ state, token, notify, onClose, onOpenGroups }) {
  const { band, groups } = state;
  const toast = useToast();
  const members = activeMembers(state);
  const [busy, setBusy] = useState(null); // `${groupId}:${memberId}`
  const [confirm, setConfirm] = useState(null); // { group, member }
  const done = band.status === 'done';
  const voting = band.status === 'voting';

  const blockedSet = new Set((state.vote_blocks || []).map((b) => `${b.group_id}:${b.member_id}`));
  const isBlocked = (g, m) => blockedSet.has(`${g.id}:${m.id}`);

  const apply = async (group, member, blocked) => {
    const key = `${group.id}:${member.id}`;
    setBusy(key);
    try {
      const r = await setVoteBlock(token, group.id, member.id, blocked);
      setConfirm(null);
      toast(
        blocked
          ? `‘${group.name}’ 투표에서 ${josa(member.name, '을', '를')} 뺐어요${r?.removed_votes ? ' · 낸 표는 지웠어요' : ''}`
          : `${member.name}도 ‘${group.name}’에 투표해요`,
      );
      await notify();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const tap = (group, member) => {
    if (done || busy) return;
    const blocked = isBlocked(group, member);
    // 투표 중에 빼는 건 표가 지워질 수 있어서 한 번 더 확인
    if (!blocked && voting) return setConfirm({ group, member });
    apply(group, member, !blocked);
  };

  return (
    <Sheet title="투표 제한" onClose={onClose}>
      <p className="hint">
        그룹마다 투표할 사람을 정해요. <strong className="vb-legend on">초록</strong>은 투표함,{' '}
        <strong className="vb-legend off">줄 그은 이름</strong>은 빠짐. 누를 때마다 바뀌어요. 빠진 사람도 그 그룹 곡은 듣고 볼
        수 있어요.
        {voting && ' 투표 중에 빼면 그 사람이 그 그룹에 이미 낸 표는 지워져요.'}
      </p>
      {done && <p className="hint warn">확정된 방이라 바꿀 수 없어요.</p>}

      {groups.length === 0 ? (
        band.use_groups ? (
          <div className="stack">
            <p className="empty-line">아직 그룹이 없어요. 그룹을 먼저 만들어 주세요.</p>
            {onOpenGroups && (
              <button className="row-link boxed" onClick={onOpenGroups}>
                <span>
                  <strong>그룹 나누기</strong>
                  <small>그룹을 만들고 곡을 넣어요</small>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            )}
          </div>
        ) : (
          <p className="empty-line">
            그룹을 안 쓰는 방이에요. 투표가 시작되면 ‘전체’ 그룹이 생기고, 그때 투표에서 뺄 사람을 정할 수 있어요.
          </p>
        )
      ) : (
        groups.map((g) => {
          const allowed = members.filter((m) => !isBlocked(g, m)).length;
          return (
            <section className="vb-group" key={g.id}>
              <div className="vb-head">
                <strong>{g.name}</strong>
                <small>
                  {g.song_ids.length}곡 · 투표 {allowed}/{members.length}명
                </small>
              </div>
              <div className="chip-row" role="group" aria-label={`${g.name} 투표할 사람`}>
                {members.map((m) => {
                  const off = isBlocked(g, m);
                  return (
                    <button
                      key={m.id}
                      className={`chip-btn vb-chip${off ? ' off' : ' on'}`}
                      aria-pressed={!off}
                      aria-label={`${m.name} ${off ? '빠짐' : '투표함'}`}
                      onClick={() => tap(g, m)}
                      disabled={done || busy === `${g.id}:${m.id}`}
                    >
                      {off ? <s>{m.name}</s> : m.name}
                    </button>
                  );
                })}
              </div>
              {allowed === 0 && <p className="form-error small">아무도 이 그룹에 투표하지 못해요. 이대로면 모든 곡이 0점이에요.</p>}
              {confirm?.group.id === g.id && (
                <div className="confirm-box">
                  <p>
                    ‘{g.name}’ 투표에서 {josa(confirm.member.name, '을', '를')} 빼요? {josa(confirm.member.name, '이', '가')} 이 그룹에 이미 낸 표가 있으면
                    지워져요.
                  </p>
                  <div className="row-btns">
                    <button className="ghost-btn" onClick={() => setConfirm(null)} disabled={!!busy}>
                      취소
                    </button>
                    <Button
                      className="danger-btn"
                      busy={busy === `${g.id}:${confirm.member.id}`}
                      onClick={() => apply(g, confirm.member, true)}
                    >
                      빼기
                    </Button>
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}
    </Sheet>
  );
}
