// 내 메뉴 — PIN 바꾸기 / 다른 방 / 이 기기에서 나가기
import { useState } from 'react';
import Icon from '../../components/Icon';
import { Button, PinField, Sheet, useToast } from '../../components/ui';
import { changePin, errorText } from '../../lib/api';

export default function MeSheet({ state, token, onClose, onOtherRooms, onLogout }) {
  const { me, band } = state;
  const [mode, setMode] = useState('menu'); // 'menu' | 'pin'

  if (mode === 'pin') {
    return <ChangePinSheet token={token} onDone={onClose} onClose={() => setMode('menu')} />;
  }

  return (
    <Sheet title={me.name} onClose={onClose}>
      <p className="muted small">
        {band.name} · 참여코드 {band.invite_code}
        {me.role === 'leader' && ' · 방장'}
      </p>
      <p className="hint">
        다른 폰에서도 참여코드 <strong>{band.invite_code}</strong> + 이름 <strong>{me.name}</strong> + 내 PIN으로 들어오면
        같은 사람으로 이어져요.
      </p>
      <div className="menu-list">
        <button className="row-link" onClick={() => setMode('pin')}>
          <span>
            <strong>PIN 바꾸기</strong>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        <button className="row-link" onClick={onOtherRooms}>
          <span>
            <strong>다른 방으로</strong>
            <small>이 방에서 로그인은 유지돼요</small>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        <button className="row-link danger" onClick={onLogout}>
          <span>
            <strong>이 기기에서 로그아웃</strong>
            <small>{me.role === 'leader' ? '방장은 방을 나갈 수 없어요. 로그아웃만 돼요.' : '방에서 빠지는 건 아니에요'}</small>
          </span>
        </button>
      </div>
    </Sheet>
  );
}

export function ChangePinSheet({ token, forced, onDone, onClose }) {
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    if (pin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      await changePin(token, pin);
      toast('PIN을 바꿨어요');
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={forced ? '새 PIN을 정해 주세요' : 'PIN 바꾸기'}
      onClose={forced ? null : onClose}
      footer={
        <Button busy={busy} onClick={save} disabled={pin.length !== 4}>
          새 PIN 저장
        </Button>
      }
    >
      {forced && <p className="muted">방장이 PIN을 초기화했어요. 앞으로 쓸 PIN을 새로 정해요.</p>}
      <PinField value={pin} onChange={setPin} label="새 PIN 4자리" reveal autoFocus onEnter={save} />
      {error && <p className="form-error" role="alert">{error}</p>}
    </Sheet>
  );
}
