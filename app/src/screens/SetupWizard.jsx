// [B] 방장 · 방 설정 (상태 = 설정중). 4단계로 나눠 차근차근.
//  B-1 기본 설정 → B-2 투표 방식 → B-3 참여 규칙 → B-4 일정·확정
//  "다음"을 누를 때마다 저장. 마지막에 "곡 수합 시작"을 눌러야 멤버들이 곡을 올릴 수 있음.
import { useState } from 'react';
import Icon from '../components/Icon';
import { Button, copyText, inviteLink, useToast } from '../components/ui';
import { advanceStatus, errorText, updateSettings } from '../lib/api';
import {
  BasicFields,
  RuleFields,
  ScheduleFields,
  SettingsSummary,
  VoteFields,
  diffSettings,
  pickSettings,
} from './settings/SettingsFields';

const PAGES = [
  { key: 'basic', title: '기본 설정', desc: '밴드 이름과 인원수를 정해요.' },
  { key: 'vote', title: '투표 방식', desc: '다수결로 할지 순위 매기기(점수제)로 할지, 곡을 그룹으로 나눌지 정해요.' },
  { key: 'rules', title: '참여 규칙', desc: '곡을 몇 개씩 올릴지, 무엇을 공개할지 정해요.' },
  { key: 'schedule', title: '일정 · 확정', desc: '마감일을 정하고 설정을 확인해요.' },
];

export default function SetupWizard({ state, token, notify, onOpenMe }) {
  const { band, members } = state;
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState(() => pickSettings(band));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    const patch = diffSettings(pickSettings(band), draft);
    if (Object.keys(patch).length === 0) return true;
    try {
      await updateSettings(token, patch);
      await notify();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };

  const go = async (delta) => {
    setBusy(true);
    setError(null);
    const ok = await save();
    setBusy(false);
    if (ok) {
      setPage((p) => p + delta);
      window.scrollTo({ top: 0 });
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await save())) return;
      await advanceStatus(token, 'setup');
      toast('곡 수합을 시작했어요');
      await notify();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const shareInvite = async () => {
    const link = inviteLink(band.invite_code);
    const text = `[${band.name}] 공연곡 정하는 방이에요.\n참여코드: ${band.invite_code}\n${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: band.name, text });
        return;
      } catch {
        /* 취소하면 복사로 */
      }
    }
    if (await copyText(text)) toast('초대 메시지를 복사했어요. 단톡방에 붙여 넣어요.');
  };

  const P = PAGES[page];

  return (
    <div className="screen wizard">
      <header className="topbar">
        {page > 0 ? (
          <button className="icon-btn" onClick={() => go(-1)} aria-label="이전 단계" disabled={busy}>
            <Icon name="back" />
          </button>
        ) : (
          <span className="icon-btn-spacer" />
        )}
        <div className="topbar-title">
          <small className="leader-chip">방장 설정</small>
          {band.name}
        </div>
        <button className="me-btn" onClick={onOpenMe}>
          {state.me.name}
        </button>
      </header>

      <ol className="wizard-dots" aria-label="설정 단계">
        {PAGES.map((p, i) => (
          <li key={p.key} className={i === page ? 'now' : i < page ? 'past' : ''}>
            <span>{i + 1}</span>
            {p.title}
          </li>
        ))}
      </ol>

      <section className="wizard-page">
        <h1 className="h-lg">{P.title}</h1>
        <p className="muted">{P.desc}</p>

        {P.key === 'basic' && <BasicFields draft={draft} set={set} status={band.status} memberCount={members.length} />}
        {P.key === 'vote' && <VoteFields draft={draft} set={set} status={band.status} />}
        {P.key === 'rules' && <RuleFields draft={draft} set={set} status={band.status} />}
        {P.key === 'schedule' && (
          <>
            <ScheduleFields draft={draft} set={set} status={band.status} />
            <h2 className="section-title">설정 요약</h2>
            <SettingsSummary band={{ ...band, ...draft }} />
            <p className="hint">곡 수합을 시작한 뒤에도 대부분 고칠 수 있어요. 단, 올린 사람 숨기기는 지금 정한 대로 고정돼요.</p>
          </>
        )}
      </section>

      <section className="invite-box">
        <div>
          <div className="muted small">참여코드</div>
          <div className="invite-code">{band.invite_code}</div>
          <div className="muted small">
            들어온 사람 {members.length}/{band.max_members}: {members.map((m) => m.name).join(', ')}
          </div>
        </div>
        <button className="ghost-btn" onClick={shareInvite}>
          <Icon name="copy" size={16} /> 초대하기
        </button>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="wizard-actions">
        {page < PAGES.length - 1 ? (
          <Button busy={busy} onClick={() => go(1)} disabled={!draft.name?.trim()}>
            다음
          </Button>
        ) : !confirming ? (
          <Button busy={busy} onClick={() => setConfirming(true)}>
            곡 수합 시작하기
          </Button>
        ) : (
          <div className="confirm-box">
            <p>
              멤버들이 지금부터 곡을 올릴 수 있어요. 되돌릴 수는 없어요.
              {members.length < 2 && ' 아직 아무도 안 들어왔지만, 시작한 뒤에도 들어올 수 있어요.'}
            </p>
            <div className="row-btns">
              <button className="ghost-btn" onClick={() => setConfirming(false)} disabled={busy}>
                취소
              </button>
              <Button busy={busy} onClick={start}>
                시작하기
              </Button>
            </div>
          </div>
        )}
        {page === PAGES.length - 1 && !confirming && (
          <button className="text-btn" onClick={async () => (await save()) && toast('저장했어요. 준비되면 시작을 눌러요.')}>
            저장만 하고 나중에 시작
          </button>
        )}
      </div>
    </div>
  );
}
