// 입장 승인 대기 화면 — 방장이 승인하면 자동으로 방 화면으로 바뀜 (주기적 새로고침)
export default function PendingRoom({ state, onLogout, onOtherRooms }) {
  return (
    <div className="screen">
      <section className="waiting">
        <div className="waiting-pulse" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h1 className="h-md">{state.band.name}</h1>
        <p className="muted">
          <strong>{state.me.name}</strong>(으)로 입장을 신청했어요. 방장이 승인하면 이 화면이 바로 바뀌어요. 방장에게
          단톡방에서 한마디 해 두면 빨라요.
        </p>
        <div className="row-btns left">
          <button className="ghost-btn" onClick={onOtherRooms}>
            다른 방으로
          </button>
          <button className="ghost-btn" onClick={onLogout}>
            신청 그만두기
          </button>
        </div>
      </section>
    </div>
  );
}
