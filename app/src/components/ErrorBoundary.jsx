// 화면을 그리다 예상 못 한 오류가 나도 "까만 화면"으로 멈추지 않게 붙잡는 안전망.
// React는 그리는 중 에러가 나면 화면 전체를 지워 버림 → 여기서 잡아서 안내 + 복구 버튼을 보여줌.
import { Component } from 'react';
import { setCurrent } from '../lib/rooms';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // 개발자 도구(F12) 콘솔에서 자세한 위치를 볼 수 있게
    console.error('[셋리스트] 화면 오류', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="screen">
        <div className="empty">
          <h1 className="h-md">화면을 그리다 문제가 생겼어요</h1>
          <p className="muted">
            새로고침해도 계속되면 처음 화면으로 나갔다가 다시 들어와 주세요. 아래 오류 내용을 캡처해서 보내 주면 고치기 쉬워요.
          </p>
          <pre className="error-detail">{String(error?.message || error)}</pre>
          <div className="row-btns left">
            <button className="primary-btn" onClick={() => window.location.reload()}>
              새로고침
            </button>
            <button
              className="ghost-btn"
              onClick={() => {
                setCurrent(null);
                window.location.href = window.location.pathname;
              }}
            >
              처음 화면으로
            </button>
          </div>
        </div>
      </div>
    );
  }
}
