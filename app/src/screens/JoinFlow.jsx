// [A-2] 참여 입장 — 신원의 핵심: 초대코드 + 이름 + 4자리 PIN
//  · 처음 왔어요: 이름 직접 입력 + PIN 설정 (이름 중복이면 거절)
//  · 다시 들어왔어요: 같은 이름 + PIN → 다른 기기에서도 같은 사람으로 복원
import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { Button, PinField, TextField } from '../components/ui';
import { errorText, joinBand, loginMember, peekBand } from '../lib/api';

const STATUS_LABEL = { setup: '방장이 준비 중', collecting: '곡 수합 중', voting: '투표 중', done: '확정됨' };

export default function JoinFlow({ initialCode, onBack, onEntered }) {
  const [code, setCode] = useState(initialCode || '');
  const [band, setBand] = useState(null);
  const [mode, setMode] = useState('new'); // 'new' | 'return'
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const peek = async (c) => {
    setBusy(true);
    setError(null);
    try {
      setBand(await peekBand(c));
    } catch (e) {
      setBand(null);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialCode) peek(initialCode);
  }, [initialCode]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!name.trim() || pin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === 'new' ? await joinBand(band.invite_code, name, pin) : await loginMember(band.invite_code, name, pin);
      onEntered({ ...res, name: name.trim() });
    } catch (err) {
      setError(errorText(err));
      if (err.code === 'NAME_TAKEN') setMode('new');
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
        <h1 className="topbar-title">참여코드로 입장</h1>
      </header>

      {!band ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            peek(code);
          }}
        >
          <TextField
            label="참여코드"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button busy={busy} type="submit" disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 6}>
            코드 확인
          </Button>
        </form>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="band-peek">
            <div>
              <div className="band-peek-name">{band.band_name}</div>
              <div className="muted small">
                {STATUS_LABEL[band.status]} · {band.member_count}/{band.max_members}명
              </div>
            </div>
            <button type="button" className="ghost-btn small" onClick={() => setBand(null)}>
              코드 바꾸기
            </button>
          </div>

          <div className="seg wide" role="tablist" aria-label="입장 방식">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'new'}
              className={mode === 'new' ? 'on' : ''}
              onClick={() => {
                setMode('new');
                setError(null);
              }}
            >
              처음 왔어요
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'return'}
              className={mode === 'return' ? 'on' : ''}
              onClick={() => {
                setMode('return');
                setError(null);
              }}
            >
              다시 들어왔어요
            </button>
          </div>

          <TextField
            label="이름"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 12))}
            placeholder="예: 김준호, 준호(보컬)"
            autoComplete="off"
            hint={
              mode === 'new'
                ? '이 방에서 쓸 이름이에요. 다시 들어올 때도 똑같이 써야 해요.'
                : '처음 들어올 때 썼던 이름을 그대로 써요.'
            }
          />
          <PinField
            key={mode}
            value={pin}
            onChange={setPin}
            label={mode === 'new' ? 'PIN 4자리 정하기' : 'PIN 4자리'}
            reveal={mode === 'new'}
            onEnter={submit}
          />
          {mode === 'new' && (
            <p className="hint">다른 폰이나 브라우저에서 다시 들어올 때 필요해요. 잊으면 방장이 초기화해 줄 수 있어요.</p>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          <Button busy={busy} type="submit" disabled={!name.trim() || pin.length !== 4}>
            {mode === 'new' ? '입장하기' : '다시 입장하기'}
          </Button>
        </form>
      )}
    </div>
  );
}
