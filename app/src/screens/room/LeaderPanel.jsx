// [D] 방장 전용 오버레이 — 진행 중 어디서나 열림
//  D-2 진행 제어: 단계 수동 마감 (+ 참여 현황, 독촉 메시지)
//  D-1 멤버 관리: PIN 초기화
//  ⚠ 방장도 참여자 → 마감 전 투표 결과는 방장도 못 봄 (DB가 안 내려줌)
import { useState } from 'react';
import Icon from '../../components/Icon';
import StatusSteps from '../../components/StatusSteps';
import { Button, Sheet, copyText, inviteLink, useToast } from '../../components/ui';
import { advanceStatus, errorText, resetPin } from '../../lib/api';
import { dday, fmtDeadline } from '../../lib/time';

const NEXT = {
  setup: {
    label: '곡 수합 시작하기',
    warn: '멤버들이 곡을 올릴 수 있게 돼요.',
  },
  collecting: {
    label: '곡 수합 마감하고 투표 시작',
    warn: '투표가 시작되면 곡을 더 올리거나 바꿀 수 없어요. 되돌릴 수 없어요.',
  },
  voting: {
    label: '투표 마감하고 결과 공개',
    warn: '마감하면 더는 투표할 수 없고, 결과가 모두에게 동시에 공개돼요. 되돌릴 수 없어요.',
  },
};

export default function LeaderPanel({ state, token, notify, onClose, onEditSettings }) {
  const { band, members, me } = state;
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [resetFor, setResetFor] = useState(null); // member id (확인 중)
  const [tempPin, setTempPin] = useState(null); // { name, pin }

  const next = NEXT[band.status];

  // 참여 현황: 곡 수합이면 "곡 낸 사람", 투표면 "투표한 사람"
  const pending =
    band.status === 'collecting'
      ? members.filter((m) => m.song_count === 0)
      : band.status === 'voting'
        ? members.filter((m) => !m.voted)
        : [];
  const doneCount = members.length - pending.length;
  const progressLabel = band.status === 'collecting' ? '곡을 올린 사람' : '투표한 사람';
  const deadline = band.status === 'collecting' ? band.collect_deadline : band.vote_deadline;

  const advance = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await advanceStatus(token, band.status);
      toast(r.status === 'voting' ? '투표를 시작했어요' : r.status === 'done' ? '투표를 마감했어요. 결과가 공개됐어요' : '곡 수합을 시작했어요');
      setConfirming(false);
      await notify();
      onClose();
    } catch (e) {
      setError(errorText(e));
      if (e.code === 'STALE_STATUS') await notify();
    } finally {
      setBusy(false);
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

  const doReset = async (m) => {
    setBusy(true);
    try {
      const r = await resetPin(token, m.id);
      setTempPin({ name: m.name, pin: r.temp_pin });
      setResetFor(null);
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="방장 메뉴" onClose={onClose} tone="leader">
      <section className="lp-section">
        <h3 className="section-title">진행</h3>
        <StatusSteps status={band.status} />

        {band.status === 'collecting' || band.status === 'voting' ? (
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
        ) : null}

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
              <div className="row-btns">
                <button className="ghost-btn" onClick={() => setConfirming(false)} disabled={busy}>
                  취소
                </button>
                <Button className="leader-btn" busy={busy} onClick={advance}>
                  넘어가기
                </Button>
              </div>
            </div>
          )
        ) : (
          <p className="muted small">모든 단계가 끝났어요. 결과 화면에서 최종 곡을 선정해요.</p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {band.status === 'voting' && (
          <p className="hint">방장도 참여자라서, 득표수는 마감한 뒤에 모두와 같이 봐요.</p>
        )}
      </section>

      <section className="lp-section">
        <h3 className="section-title">초대</h3>
        <div className="invite-box flat">
          <div>
            <div className="invite-code">{band.invite_code}</div>
            <div className="muted small">
              {members.length}/{band.max_members}명
            </div>
          </div>
          <button className="ghost-btn" onClick={shareInvite}>
            <Icon name="copy" size={16} /> 초대하기
          </button>
        </div>
      </section>

      <section className="lp-section">
        <h3 className="section-title">멤버</h3>
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
          {members.map((m) => (
            <li key={m.id}>
              <span className="m-name">
                {m.name}
                {m.role === 'leader' && <small className="leader-chip">방장</small>}
              </span>
              <span className="m-state small muted">
                {band.status === 'voting' || band.status === 'done'
                  ? m.voted
                    ? '투표함'
                    : '투표 전'
                  : `곡 ${m.song_count}개`}
              </span>
              {m.id !== me.id &&
                (resetFor === m.id ? (
                  <span className="m-confirm">
                    <button className="ghost-btn small" onClick={() => setResetFor(null)} disabled={busy}>
                      취소
                    </button>
                    <Button className="danger-btn small" busy={busy} onClick={() => doReset(m)}>
                      초기화
                    </Button>
                  </span>
                ) : (
                  <button className="ghost-btn small" onClick={() => setResetFor(m.id)}>
                    <Icon name="key" size={14} /> PIN 초기화
                  </button>
                ))}
            </li>
          ))}
        </ul>
        <p className="hint">PIN을 잊은 멤버만 초기화해요. 초기화하면 그 사람의 기존 로그인은 모두 풀려요.</p>
      </section>

      <section className="lp-section">
        <button className="row-link" onClick={onEditSettings} disabled={band.status === 'done'}>
          <span>
            <strong>방 설정 수정</strong>
            <small>{band.status === 'done' ? '확정된 방은 바꿀 수 없어요' : '마감일, 인원수, 규칙 등'}</small>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      </section>
    </Sheet>
  );
}
