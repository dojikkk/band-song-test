// 설정중 단계에서 멤버가 보는 화면 — 방장이 준비를 마치면 자동으로 곡 수합 화면으로 바뀜
export default function WaitingRoom({ state }) {
  const { band, members } = state;
  return (
    <section className="waiting">
      <div className="waiting-pulse" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2 className="h-md">방장이 방을 준비하고 있어요</h2>
      <p className="muted">
        준비가 끝나면 이 화면이 곡 올리기 화면으로 바뀌어요. 그동안 어떤 곡을 올릴지 유튜브 링크를 골라 두면 좋아요.
      </p>
      <h3 className="section-title">
        들어온 사람 {members.length}/{band.max_members}
      </h3>
      <ul className="chips">
        {members.map((m) => (
          <li key={m.id} className={m.role === 'leader' ? 'chip leader' : 'chip'}>
            {m.name}
            {m.role === 'leader' && <small>방장</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}
