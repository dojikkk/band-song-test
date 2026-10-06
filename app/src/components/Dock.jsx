// 화면 맨 아래 고정 영역(독)에 붙는 버튼 줄. 미니 플레이어 바로 위에 쌓임.
import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

export const DockCtx = createContext(null);

export function DockBar({ children }) {
  const el = useContext(DockCtx);
  return el ? createPortal(<div className="dock-bar">{children}</div>, el) : null;
}
