// [B] 방 설정 입력 묶음 — 처음 설정 마법사와 "방 설정 수정" 시트가 같이 씀.
// 잠금 규칙은 DB 함수(update_settings)와 똑같이 맞춰 둠 (화면은 안내, 진짜 강제는 DB).
import { Stepper, TextField, Toggle } from '../../components/ui';
import { fmtDeadline, fromLocalInput, toLocalInput } from '../../lib/time';

export function locks(status) {
  return {
    all: status === 'done',
    anonSongs: status !== 'setup',
    voteRules: status === 'voting' || status === 'done',
  };
}

export function BasicFields({ draft, set, status, memberCount = 1 }) {
  const l = locks(status);
  return (
    <div className="stack">
      <TextField
        label="밴드 이름"
        value={draft.name}
        onChange={(e) => set({ name: e.target.value.slice(0, 30) })}
        disabled={l.all}
      />
      <Stepper
        label="최대 인원"
        hint={memberCount > 1 ? `지금 ${memberCount}명 들어와 있어요` : '방장 포함'}
        value={draft.max_members}
        onChange={(v) => set({ max_members: v })}
        min={Math.max(2, memberCount)}
        max={30}
        unit="명"
        disabled={l.all}
      />
      <fieldset className="choice-group">
        <legend>입장 방식</legend>
        <label className="choice on">
          <input type="radio" checked readOnly />
          <span>
            <strong>코드만 있으면 바로 입장</strong>
            <small>참여코드를 아는 사람은 누구나 들어와요</small>
          </span>
        </label>
        <label className="choice is-disabled">
          <input type="radio" disabled />
          <span>
            <strong>방장 승인 후 입장</strong>
            <small>다음 버전에서 열려요</small>
          </span>
        </label>
      </fieldset>
    </div>
  );
}

export function VoteFields({ draft, set, status }) {
  const l = locks(status);
  return (
    <div className="stack">
      <fieldset className="choice-group">
        <legend>투표 방식</legend>
        <label className="choice on">
          <input type="radio" checked readOnly />
          <span>
            <strong>다수결</strong>
            <small>각자 마음에 드는 곡을 몇 개 고르고, 표를 많이 받은 순서로 정해요</small>
          </span>
        </label>
        <label className="choice is-disabled">
          <input type="radio" disabled />
          <span>
            <strong>점수제 (순위 매기기)</strong>
            <small>다음 버전에서 열려요</small>
          </span>
        </label>
      </fieldset>
      <Stepper
        label="한 사람이 고를 수 있는 곡"
        hint={l.voteRules ? '투표가 시작돼서 바꿀 수 없어요' : '예: 3이면 마음에 드는 곡 3개까지 투표'}
        value={draft.votes_per_member}
        onChange={(v) => set({ votes_per_member: v })}
        min={1}
        max={20}
        unit="곡"
        disabled={l.voteRules}
      />
      <Toggle
        label="익명 투표"
        hint={
          l.voteRules
            ? '투표가 시작돼서 바꿀 수 없어요'
            : draft.anonymous_votes
              ? '결과에 득표수만 나오고 누가 찍었는지는 안 나와요'
              : '결과에 곡마다 누가 찍었는지 이름이 나와요'
        }
        checked={draft.anonymous_votes}
        onChange={(v) => set({ anonymous_votes: v })}
        disabled={l.voteRules}
      />
    </div>
  );
}

export function RuleFields({ draft, set, status }) {
  const l = locks(status);
  return (
    <div className="stack">
      <Stepper
        label="한 사람이 올릴 수 있는 곡"
        value={draft.songs_per_member}
        onChange={(v) => set({ songs_per_member: v })}
        min={1}
        max={10}
        unit="곡"
        disabled={l.all || status === 'voting'}
        hint={status === 'voting' ? '곡 수합이 끝나서 바꿀 수 없어요' : null}
      />
      <Toggle
        label="올린 사람 숨기기"
        hint={
          l.anonSongs
            ? '곡 수합이 시작돼서 바꿀 수 없어요'
            : draft.anonymous_songs
              ? '누가 어떤 곡을 올렸는지 아무도 몰라요 (방장 포함)'
              : '곡마다 올린 사람 이름이 보여요'
        }
        checked={draft.anonymous_songs}
        onChange={(v) => set({ anonymous_songs: v })}
        disabled={l.anonSongs}
      />
      <Toggle
        label="곡 코멘트 허용"
        hint="곡을 올릴 때 추천 이유를 짧게 적을 수 있어요"
        checked={draft.allow_comments}
        onChange={(v) => set({ allow_comments: v })}
        disabled={l.all}
      />
      <Toggle
        label="투표 후 수정 허용"
        hint={l.voteRules ? '투표가 시작돼서 바꿀 수 없어요' : '마감 전까지 던진 표를 바꿀 수 있어요'}
        checked={draft.allow_vote_change}
        onChange={(v) => set({ allow_vote_change: v })}
        disabled={l.voteRules}
      />
    </div>
  );
}

export function ScheduleFields({ draft, set, status }) {
  const l = locks(status);
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="cd">곡 수합 마감</label>
        <input
          id="cd"
          type="datetime-local"
          value={toLocalInput(draft.collect_deadline)}
          onChange={(e) => set({ collect_deadline: fromLocalInput(e.target.value) })}
          disabled={l.all}
        />
      </div>
      <div className="field">
        <label htmlFor="vd">투표 마감</label>
        <input
          id="vd"
          type="datetime-local"
          value={toLocalInput(draft.vote_deadline)}
          onChange={(e) => set({ vote_deadline: fromLocalInput(e.target.value) })}
          disabled={l.all}
        />
      </div>
      <p className="hint">
        비워 둬도 돼요. 마감일은 모두에게 보여 주는 안내용이고, 다음 단계로는 방장이 직접 넘겨요.
      </p>
    </div>
  );
}

export function SettingsSummary({ band }) {
  const rows = [
    ['밴드 이름', band.name],
    ['최대 인원', `${band.max_members}명`],
    ['투표 방식', `다수결 · 한 사람 ${band.votes_per_member}곡까지`],
    ['투표', band.anonymous_votes ? '익명 (득표수만 공개)' : '공개 (누가 찍었는지 공개)'],
    ['곡 올리기', `한 사람 ${band.songs_per_member}곡까지`],
    ['올린 사람', band.anonymous_songs ? '숨김' : '공개'],
    ['코멘트', band.allow_comments ? '허용' : '안 받음'],
    ['투표 후 수정', band.allow_vote_change ? '허용' : '안 됨'],
    ['곡 수합 마감', fmtDeadline(band.collect_deadline) || '안 정함'],
    ['투표 마감', fmtDeadline(band.vote_deadline) || '안 정함'],
  ];
  return (
    <dl className="summary">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// band 객체에서 설정 값만 뽑기
export function pickSettings(band) {
  const keys = [
    'name',
    'max_members',
    'songs_per_member',
    'votes_per_member',
    'anonymous_songs',
    'anonymous_votes',
    'allow_comments',
    'allow_vote_change',
    'collect_deadline',
    'vote_deadline',
  ];
  return Object.fromEntries(keys.map((k) => [k, band[k]]));
}

// 바뀐 값만 모아서 보냄 (잠긴 항목을 건드리지 않게)
export function diffSettings(before, after) {
  const out = {};
  for (const k of Object.keys(after)) {
    const a = before[k] == null ? null : before[k];
    const b = after[k] == null ? null : after[k];
    const same = k.endsWith('deadline') ? (a && new Date(a).getTime()) === (b && new Date(b).getTime()) : a === b;
    if (!same) out[k] = after[k];
  }
  return out;
}
