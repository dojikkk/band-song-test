// 진행 흐름: 설정중 → 곡 수합 → 투표중 → 확정 (모든 전환은 방장 수동 버튼)
export const STEPS = [
  { key: 'setup', label: '설정중' },
  { key: 'collecting', label: '곡 수합' },
  { key: 'voting', label: '투표중' },
  { key: 'done', label: '확정' },
];

export default function StatusSteps({ status }) {
  const idx = STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="steps" aria-label="진행 단계">
      {STEPS.map((s, i) => (
        <li
          key={s.key}
          className={i < idx ? 'past' : i === idx ? `now${s.key === 'done' ? ' final' : ''}` : 'future'}
          aria-current={i === idx ? 'step' : undefined}
        >
          {s.label}
        </li>
      ))}
    </ol>
  );
}
