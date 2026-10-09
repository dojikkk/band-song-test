// [D] 방장 전용 오버레이 — 진행 중 어디서나 열림
//  D-2 진행 제어: 단계 수동 마감 (+ 참여 현황, 독촉 메시지, 그룹 나누기)
//  D-1 멤버 관리: 입장 승인/거절, PIN 초기화, 내보내기, 참여코드 새로 만들기
//  ⚠ 방장도 참여자 → 마감 전 투표 결과는 방장도 못 봄 (DB가 안 내려줌)
import { useState } from 'react';
import Icon from '../../components/Icon';
import StatusSteps from '../../components/StatusSteps';
import { Button, Sheet, copyText, inviteLink, useToast } from '../../components/ui';
import {
  advanceStatus,
  approveMember,
  errorText,
  regenerateInviteCode,
  removeMember,
  resetPin,
} from '../../lib/api';
import { groupsBySong } from '../../lib/selectors';
import { dday, fmtDeadline } from '../../lib/time';

export function groupStatus(groupCount, songCount, ungrouped) {
  if (groupCount === 0) return '아직 그룹이 없어요 · 눌러서 만들기';
  if (songCount === 0) return `그룹 ${groupCount}개 · 곡이 올라오면 나눠요`;
  return `그룹 ${groupCount}개 · ${ungrouped > 0 ? `미분류 ${ungrouped}곡` : '모든 곡 분류 완료'}`;
}

const NEXT = {
  setup: {
    label: '곡 수합 시작하기',
    warn: '멤버들이 곡을 올릴 수 있게 돼요.',
  },
  collecting: {
    label: '곡 수합 마감하고 투표 시작',
    warn: '투표가 시작되면 곡을 더 올리거나 바꿀 수 없고, 그룹도 고정돼요. 되돌릴 수 없어요.',
  },
  voting: {
    label: '투표 마감하고 결과 공개',
    warn: '마감하면 더는 투표할 수 없고, 결과가 모두에게 동시에 공개돼요. 되돌릴 수 없어요.',
  },
};

export default function LeaderPanel({ state, token, notify, onClose, onEditSettings, onOpenGroups }) {
  const { band, me } = state;
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [openMember, setOpenMember] = useState(null); // 메뉴 펼친 멤버 id
  const [confirmAction, setConfirmAction] = useState(null); // { id, kind: 'reset'|'kick' }
  const [tempPin, setTempPin] = useState(null); // { name, pin }
  const [confirmCode, setConfirmCode] = useState(false);

  const members = state.members.filter((m) => m.status !== 'pending');
  const waiting = state.members.filter((m) => m.status === 'pending');
  const next = NEXT[band.status];
  const bySong = band.use_groups ? groupsBySong(state) : null;
  const ungrouped = bySong ? state.songs.filter((s) => !bySong.has(s.id)).length : 0;

  // 인당 0곡인 방: 곡 수합은 방장 혼자 → "곡 낸 사람" 현황 대신 후보곡 수만
  const leaderOnly = band.songs_per_member === 0;

  // 참여 현황: 곡 수합이면 "곡 낸 사람", 투표면 "모든 그룹 투표 끝낸 사람"
  const pending =
    band.status === 'collecting' && leaderOnly
      ? []
      : band.status === 'collecting'
      ? members.filter((m) => m.song_count === 0)
      : band.status === 'voting'
        ? members.filter((m) => !m.voted)
        : [];
  const doneCount = members.length - pending.length;
  const progressLabel = band.status === 'collecting' ? '곡을 올린 사람' : '투표 끝낸 사람';
  const deadline = band.status === 'collecting' ? band.collect_deadline : band.vote_deadline;

  const act = async (key, fn, okMsg) => {
    setBusy(key);
    setError(null);
    try {
      const r = await fn();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      await notify();
      return r;
    } catch (e) {
      toast(errorText(e), 'error');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const advance = async () => {
    setBusy('advance');
    setError(null);
    try {
      const r = await advanceStatus(token, band.status);
      toast(
        r.status === 'voting'
          ? '투표를 시작했어요'
          : r.status === 'done'
            ? '투표를 마감했어요. 결과가 공개됐어요'
            : '곡 수합을 시작했어요',
      );
      setConfirming(false);
      await notify();
      onClose();
    } catch (e) {
      setError(errorText(e));
      if (e.code === 'STALE_STATUS') await notify();
    } finally {
      setBusy(null);
    }
  };

  const nudge = async () => {
    const what = band.status === 'collecting' ? '곡 올리기' : '투표';
    const when = deadline ? ` 마감은 ${fmtDeadline(deadline)}이에요.` : '';
    const text = `[${band.name}] ${what} 아직 안 한 사람: ${pending.map((m) => m.name).join(', ')}.${when}\n${inviteLink(band.invite_code)}`;
    if (await copyText(text)) toast('독촉 메시지를 복사했어요');
  };

  const shareInvite = async () => {
    const text = `[${band.name}] 공연곡 정하는 방이에요.\n참여코드: ${band.invite_code}\n${inviteLink(band.invite_code)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: band.name, text });
        return;
      } catch {
        /* 취소 → 복사 */
      }
    }
    if (await copyText(text)) toast('초대 메시지를 복사했어요');
  };

  return (
    <Sheet title="방장 메뉴" onClose={onClose} tone="leader">
      {waiting.length > 0 && (
        <section className="lp-section">
          <h3 className="section-title">입장 대기 {waiting.length}명</h3>
          <ul className="member-list">
            {waiting.map((m) => (
              <li key={m.id}>
                <span className="m-name">{m.name}</span>
                <span className="m-confirm">
                  <Button
                    className="ghost-btn small"
                    busy={busy === `rej-${m.id}`}
                    onClick={() => act(`rej-${m.id}`, () => removeMember(token, m.id), `${m.name} 거절했어요`)}
                  >
                    거절
                  </Button>
                  <Button
                    className="primary-btn small"
                    busy={busy === `ok-${m.id}`}
                    onClick={() => act(`ok-${m.id}`, () => approveMember(token, m.id), `${m.name} 들어왔어요`)}
                  >
                    승인
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="lp-section">
        <h3 className="section-title">진행</h3>
        <StatusSteps status={band.status} />

        {band.status === 'collecting' && leaderOnly && (
          <div className="lp-progress">
            <div className="lp-progress-top">
              <span>
                후보곡 <strong>{state.songs.length}</strong>곡
              </span>
              {deadline && <span className="deadline-chip">{dday(deadline)}</span>}
            </div>
            <p className="hint">멤버는 곡을 안 올리는 방이에요. 후보곡을 다 올렸으면 투표를 시작해요.</p>
          </div>
        )}

        {((band.status === 'collecting' && !leaderOnly) || band.status === 'voting') && (
          <div className="lp-progress">
            <div className="lp-progress-top">
              <span>
                {progressLabel} <strong>{doneCount}</strong>/{members.length}
              </span>
              {deadline && <span className="deadline-chip">{dday(deadline)}</span>}
            </div>
            <div className="progress-line">
              <span style={{ width: `${(doneCount / Math.max(1, members.length)) * 100}%` }} />
            </div>
            {pending.length > 0 && (
              <div className="lp-pending">
                <span className="muted small">아직: {pending.map((m) => m.name).join(', ')}</span>
                <button className="ghost-btn small" onClick={nudge}>
                  <Icon name="copy" size={14} /> 독촉 메시지 복사
                </button>
              </div>
            )}
            <p className="hint">다 안 해도 넘어갈 수 있어요. 앱은 막지 않으니 필요하면 단톡방에서 독촉해요.</p>
          </div>
        )}

        {band.use_groups && (band.status === 'setup' || band.status === 'collecting') && (
          <button className="row-link boxed" onClick={onOpenGroups}>
            <span>
              <strong>그룹 나누기</strong>
              <small>
                {groupStatus(state.groups.length, state.songs.length, ungrouped)}
              </small>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        )}

        {next ? (
          !confirming ? (
            <Button className="leader-btn" onClick={() => setConfirming(true)}>
              {next.label}
            </Button>
          ) : (
            <div className="confirm-box">
              <p>{next.warn}</p>
              {band.status === 'collecting' && state.songs.length === 0 && (
                <p className="form-error">아직 올라온 곡이 없어요.</p>
              )}
              {band.status === 'collecting' && ungrouped > 0 && (
                <p className="form-error">그룹에 안 넣은 곡이 {ungrouped}개 있어요. 먼저 그룹 나누기를 끝내 주세요.</p>
              )}
              <div className="row-btns">
                <button className="ghost-btn" onClick={() => setConfirming(false)} disabled={busy === 'advance'}>
                  취소
                </button>
                <Button className="leader-btn" busy={busy === 'advance'} onClick={advance}>
                  넘어가기
                </Button>
              </div>
            </div>
          )
        ) : (
          <p className="muted small">모든 단계가 끝났어요. 결과 화면에서 최종 곡을 선정하고, 파트 탭에서 파트를 나눠요.</p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {band.status === 'voting' && <p className="hint">방장도 참여자라서, 점수는 마감한 뒤에 모두와 같이 봐요.</p>}
      </section>

      <section className="lp-section">
        <h3 className="section-title">초대</h3>
        <div className="invite-box flat">
          <div>
            <div className="invite-code">{band.invite_code}</div>
            <div className="muted small">
              {members.length + waiting.length}/{band.max_members}명 · {band.join_approval ? '승인 후 입장' : '바로 입장'}
            </div>
          </div>
          <button className="ghost-btn" onClick={shareInvite}>
            <Icon name="copy" size={16} /> 초대하기
          </button>
        </div>
        {!confirmCode ? (
          <button className="text-btn" onClick={() => setConfirmCode(true)}>
            참여코드 새로 만들기
          </button>
        ) : (
          <div className="confirm-box">
            <p>예전 코드와 링크로는 더 못 들어와요. 이미 들어온 사람은 그대로예요. 다시 로그인할 땐 새 코드를 써야 해요.</p>
            <div className="row-btns">
              <button className="ghost-btn" onClick={() => setConfirmCode(false)}>
                취소
              </button>
              <Button
                className="primary-btn"
                busy={busy === 'code'}
                onClick={async () => {
                  const r = await act('code', () => regenerateInviteCode(token), (x) => `새 코드: ${x.invite_code}`);
                  if (r) setConfirmCode(false);
                }}
              >
                새로 만들기
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="lp-section">
        <h3 className="section-title">멤버 {members.length}명</h3>
        {tempPin && (
          <div className="temp-pin" role="status">
            <div>
              <strong>{tempPin.name}</strong>의 임시 PIN
            </div>
            <div className="temp-pin-num">{tempPin.pin}</div>
            <p className="small">
              본인에게만 알려 주세요. 이 PIN으로 들어오면 새 PIN을 정하게 돼요. 이 창을 닫으면 다시 볼 수 없어요.
            </p>
            <button className="ghost-btn small" onClick={async () => (await copyText(tempPin.pin)) && toast('복사했어요')}>
              복사
            </button>
          </div>
        )}
        <ul className="member-list">
          {members.map((m) => {
            const open = openMember === m.id;
            const confirmKind = confirmAction?.id === m.id ? confirmAction.kind : null;
            return (
              <li key={m.id} className={open ? 'open' : ''}>
                <div className="member-row">
                  <span className="m-name">
                    {m.name}
                    {m.role === 'leader' && <small className="leader-chip">방장</small>}
                    {m.parts?.length > 0 && <small className="m-parts">{m.parts.join(' · ')}</small>}
                  </span>
                  <span className="m-state small muted">
                    {band.status === 'voting' || band.status === 'done'
                      ? m.voted
                        ? '투표함'
                        : state.groups.length > 1 && m.voted_groups > 0
                          ? `투표 ${m.voted_groups}/${state.groups.length}`
                          : '투표 전'
                      : `곡 ${m.song_count}개`}
                  </span>
                  {m.id !== me.id && (
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setOpenMember(open ? null : m.id);
                        setConfirmAction(null);
                      }}
                      aria-expanded={open}
                      aria-label={`${m.name} 관리`}
                    >
                      <Icon name={open ? 'close' : 'key'} size={16} />
                    </button>
                  )}
                </div>
                {open && (
                  <div className="member-actions">
                    {confirmKind ? (
                      <>
                        <span className="grow small">
                          {confirmKind === 'reset'
                            ? `${m.name}의 PIN을 초기화할까요? 기존 로그인이 모두 풀려요.`
                            : `${m.name}을(를) 내보낼까요? 올린 곡과 표도 같이 지워져요.`}
                        </span>
                        <button className="ghost-btn small" onClick={() => setConfirmAction(null)}>
                          아니요
                        </button>
                        <Button
                          className="danger-btn small"
                          busy={busy === `${confirmKind}-${m.id}`}
                          onClick={async () => {
                            if (confirmKind === 'reset') {
                              const r = await act(`reset-${m.id}`, () => resetPin(token, m.id));
                              if (r) setTempPin({ name: m.name, pin: r.temp_pin });
                            } else {
                              await act(`kick-${m.id}`, () => removeMember(token, m.id), `${m.name} 내보냈어요`);
                            }
                            setConfirmAction(null);
                            setOpenMember(null);
                          }}
                        >
                          {confirmKind === 'reset' ? '초기화' : '내보내기'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <button className="ghost-btn small" onClick={() => setConfirmAction({ id: m.id, kind: 'reset' })}>
                          <Icon name="key" size={14} /> PIN 초기화
                        </button>
                        <button className="ghost-btn small danger" onClick={() => setConfirmAction({ id: m.id, kind: 'kick' })}>
                          <Icon name="trash" size={14} /> 내보내기
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="hint">PIN을 잊은 멤버는 PIN 초기화, 잘못 들어온 사람은 내보내기.</p>
      </section>

      <section className="lp-section">
        <button className="row-link" onClick={onEditSettings}>
          <span>
            <strong>방 설정 수정</strong>
            <small>{band.status === 'done' ? '이름, 인원, 입장 방식, 파트 편성' : '마감일, 인원수, 투표·참여 규칙, 파트 편성'}</small>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      </section>
    </Sheet>
  );
}
