// 여러 화면에서 같이 쓰는 작은 부품들
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';
import { usePlayer } from '../player/PlayerContext';

/* ---------- 바텀시트 (모달) ----------
   열리면 미니 플레이어는 닫음: 시트가 플레이어를 덮으면 유튜브 규정 위반이라서. */
export function Sheet({ title, onClose, children, footer, tone }) {
  const player = usePlayer();
  const stop = player?.stop;
  const panelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    stop?.();
  }, [stop]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        className={`sheet${tone ? ` sheet-${tone}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="닫기">
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- 토스트 ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((text, kind = 'info') => {
    clearTimeout(timer.current);
    setToast({ text, kind, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 4500 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            {toast.text}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- PIN 4자리 ---------- */
export function PinField({ value, onChange, label = 'PIN 4자리', reveal = false, autoFocus, onEnter }) {
  const [show, setShow] = useState(reveal);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pin-row">
        <input
          id={id}
          className="pin-input"
          type={show ? 'text' : 'password'}
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={4}
          value={value}
          autoFocus={autoFocus}
          placeholder="••••"
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        />
        <button type="button" className="ghost-btn small" onClick={() => setShow((s) => !s)}>
          {show ? '숨기기' : '보기'}
        </button>
      </div>
    </div>
  );
}

/* ---------- 텍스트 입력 ---------- */
export function TextField({ label, hint, ...props }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...props} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

/* ---------- 숫자 − n + ---------- */
export function Stepper({ label, value, onChange, min, max, unit, disabled, hint }) {
  return (
    <div className={`row-setting${disabled ? ' is-disabled' : ''}`}>
      <div className="row-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="stepper">
        <button type="button" onClick={() => onChange(value - 1)} disabled={disabled || value <= min} aria-label={`${label} 줄이기`}>
          −
        </button>
        <output aria-live="polite">
          {value}
          {unit}
        </output>
        <button type="button" onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label={`${label} 늘리기`}>
          +
        </button>
      </div>
    </div>
  );
}

/* ---------- 켜기/끄기 ---------- */
export function Toggle({ label, hint, checked, onChange, disabled }) {
  const id = useId();
  return (
    <div className={`row-setting${disabled ? ' is-disabled' : ''}`}>
      <label className="row-label" htmlFor={id}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch${checked ? ' on' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span />
      </button>
    </div>
  );
}

/* ---------- 버튼 (로딩 중 표시) ---------- */
export function Button({ busy, children, className = 'primary-btn', ...props }) {
  return (
    <button className={className} disabled={busy || props.disabled} {...props}>
      {busy ? <span className="spinner" aria-label="처리 중" /> : children}
    </button>
  );
}

/* ---------- 클립보드 복사 / 공유 ---------- */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 오래된 브라우저·인앱 브라우저 대비
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function inviteLink(code) {
  return `${window.location.origin}${window.location.pathname}?c=${code}`;
}
