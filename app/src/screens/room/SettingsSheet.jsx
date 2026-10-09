// 진행 중 "방 설정 수정" — 확정 전까지 수정 가능 (단, 이미 시작된 약속은 잠김)
import { useState } from 'react';
import { Button, Sheet, useToast } from '../../components/ui';
import { errorText, updateSettings } from '../../lib/api';
import {
  BasicFields,
  LineupField,
  DeadlineFields,
  RuleFields,
  VoteFields,
  diffSettings,
  pickSettings,
  settingsProblem,
} from '../settings/SettingsFields';

export default function SettingsSheet({ state, token, notify, onClose }) {
  const { band, members } = state;
  const toast = useToast();
  const [draft, setDraft] = useState(() => pickSettings(band));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const patch = diffSettings(pickSettings(band), draft);
  const changed = Object.keys(patch).length > 0;
  const problem = settingsProblem(draft); // 예: 인당 0곡 + 방장 자유 추가 모드 꺼짐 → 저장 막음

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateSettings(token, patch);
      toast('설정을 저장했어요');
      await notify();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="방 설정 수정"
      onClose={onClose}
      footer={
        <>
          {error && <p className="form-error" role="alert">{error}</p>}
          {problem && <p className="form-error" role="alert">{problem}</p>}
          <Button busy={busy} onClick={save} disabled={!changed || !draft.name?.trim() || !!problem}>
            저장
          </Button>
        </>
      }
    >
      {band.status === 'done' && (
        <p className="hint">확정된 방이라 이름·인원·입장 방식·파트 편성만 바꿀 수 있어요.</p>
      )}
      {band.status !== 'done' && (
        <>
          <h3 className="section-title">마감일</h3>
          <DeadlineFields draft={draft} set={set} status={band.status} />
        </>
      )}
      <h3 className="section-title">기본</h3>
      <BasicFields draft={draft} set={set} status={band.status} memberCount={members.length} />
      {band.status !== 'done' && (
        <>
          <h3 className="section-title">투표</h3>
          <VoteFields draft={draft} set={set} status={band.status} />
          <h3 className="section-title">참여 규칙</h3>
          <RuleFields draft={draft} set={set} status={band.status} initial={band} />
        </>
      )}
      <h3 className="section-title">파트 편성</h3>
      <LineupField draft={draft} set={set} />
    </Sheet>
  );
}
