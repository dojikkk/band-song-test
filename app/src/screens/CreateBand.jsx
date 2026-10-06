// [A-3] 방 생성 — 방장으로 시작 → [B] 설정으로
import { useState } from 'react';
import Icon from '../components/Icon';
import { Button, PinField, TextField } from '../components/ui';
import { createBand, errorText } from '../lib/api';

export default function CreateBand({ onBack, onCreated }) {
  const [bandName, setBandName] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const ok = bandName.trim() && name.trim() && pin.length === 4;

  const submit = async (e) => {
    e?.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createBand(bandName, name, pin);
      onCreated({ ...res, name: name.trim() });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">
          <Icon name="back" />
        </button>
        <h1 className="topbar-title">새 방 만들기</h1>
      </header>

      <form className="stack" onSubmit={submit}>
        <TextField
          label="밴드 이름"
          value={bandName}
          onChange={(e) => setBandName(e.target.value.slice(0, 30))}
          placeholder="예: 소나기 밴드 2학기 정기공연"
          autoFocus
        />
        <TextField
          label="내 이름 (방장)"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 12))}
          placeholder="예: 준호"
          hint="방장도 곡을 올리고 투표하는 참여자예요."
        />
        <PinField value={pin} onChange={setPin} label="PIN 4자리 정하기" reveal onEnter={submit} />
        <p className="hint warn">
          방장 PIN은 초기화해 줄 사람이 없어요. 꼭 기억해 두세요.
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button busy={busy} type="submit" disabled={!ok}>
          방 만들고 설정하기
        </Button>
      </form>
    </div>
  );
}
