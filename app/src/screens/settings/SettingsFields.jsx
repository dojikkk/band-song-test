// [B] 방 설정 입력 묶음 — 처음 설정 마법사와 "방 설정 수정" 시트가 같이 씀.
// 잠금 규칙은 DB 함수(update_settings)와 똑같이 맞춰 둠 (화면은 안내, 진짜 강제는 DB).
import { useState } from 'react';
import Icon from '../../components/Icon';
import { Stepper, TextField, Toggle } from '../../components/ui';
import { fmtDeadline, fromLocalInput, toLocalInput } from '../../lib/time';

export function locks(status) {
  return {
    done: status === 'done', // 확정 후엔 이름·인원·입장 방식·파트 편성만
    anonSongs: status !== 'setup',
    voteRules: status === 'voting' || status === 'done',
  };
}

const LOCKED_VOTE = '투표가 시작돼서 바꿀 수 없어요';

export function BasicFields({ draft, set, status, memberCount = 1 }) {
  return (
    <div className="stack">
      <TextField label="밴드 이름" value={draft.name} onChange={(e) => set({ name: e.target.value.slice(0, 30) })} />
      <Stepper
        label="최대 인원"
        hint={memberCount > 1 ? `지금 ${memberCount}명 들어와 있어요` : '방장 포함'}
        value={draft.max_members}
        onChange={(v) => set({ max_members: v })}
        min={Math.max(2, memberCount)}
        max={30}
        unit="명"
      />
      <fieldset className="choice-group">
        <legend>입장 방식</legend>
        <Choice
          on={!draft.join_approval}
          onPick={() => set({ join_approval: false })}
          title="코드만 있으면 바로 입장"
          desc="참여코드를 아는 사람은 누구나 들어와요"
        />
        <Choice
          on={draft.join_approval}
          onPick={() => set({ join_approval: true })}
          title="방장 승인 후 입장"
          desc="들어오면 대기 상태가 되고, 방장 메뉴에서 승인해야 참여할 수 있어요"
        />
      </fieldset>
    </div>
  );
}

export function VoteFields({ draft, set, status }) {
  const l = locks(status);
  const borda = draft.vote_method === 'borda';
  return (
    <div className="stack">
      <fieldset className="choice-group" disabled={l.voteRules}>
        <legend>투표 방식{l.voteRules && <small> · {LOCKED_VOTE}</small>}</legend>
        <Choice
          on={!borda}
          onPick={() => set({ vote_method: 'majority' })}
          title="다수결"
          desc="마음에 드는 곡을 몇 개 고르고, 표를 많이 받은 순서로 정해요"
          disabled={l.voteRules}
        />
        <Choice
          on={borda}
          onPick={() => set({ vote_method: 'borda' })}
          title="점수제 (순위 매기기)"
          desc="곡 전부에 순위를 매겨요. n곡이면 1등 n점 … 꼴등 1점. 전부 매겨야 제출돼요"
          disabled={l.voteRules}
        />
      </fieldset>
      {!borda && (
        <Stepper
          label={draft.use_groups ? '그룹마다 고를 수 있는 곡' : '한 사람이 고를 수 있는 곡'}
          hint={l.voteRules ? LOCKED_VOTE : '예: 3이면 마음에 드는 곡 3개까지 투표'}
          value={draft.votes_per_member}
          onChange={(v) => set({ votes_per_member: v })}
          min={1}
          max={20}
          unit="곡"
          disabled={l.voteRules}
        />
      )}
      <Toggle
        label="익명 투표"
        hint={
          l.voteRules
            ? LOCKED_VOTE
            : draft.anonymous_votes
              ? '결과에 점수만 나오고 누가 찍었는지는 안 나와요'
              : `결과에 곡마다 누가 ${borda ? '몇 점 줬는지' : '찍었는지'} 이름이 나와요`
        }
        checked={draft.anonymous_votes}
        onChange={(v) => set({ anonymous_votes: v })}
        disabled={l.voteRules}
      />
      <Toggle
        label="그룹으로 나눠서 뽑기"
        hint={
          l.voteRules
            ? LOCKED_VOTE
            : '곡을 남보컬/여보컬처럼 바구니로 나눠 그룹마다 따로 순위를 내요. 한 종류 곡만 뽑히는 걸 막아요'
        }
        checked={draft.use_groups}
        onChange={(v) => set({ use_groups: v, ...(v ? {} : { multi_group: false }) })}
        disabled={l.voteRules}
      />
      {draft.use_groups && (
        <Toggle
          label="한 곡을 여러 그룹에 넣기"
          hint={l.voteRules ? LOCKED_VOTE : '꺼져 있으면 한 곡은 그룹 하나에만 들어가요'}
          checked={draft.multi_group}
          onChange={(v) => set({ multi_group: v })}
          disabled={l.voteRules}
        />
      )}
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
        disabled={l.voteRules}
        hint={l.voteRules ? '곡 수합이 끝나서 바꿀 수 없어요' : null}
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
        disabled={l.done}
      />
      <Toggle
        label="투표 후 수정 허용"
        hint={l.voteRules ? LOCKED_VOTE : '마감 전까지 던진 표를 바꿀 수 있어요'}
        checked={draft.allow_vote_change}
        onChange={(v) => set({ allow_vote_change: v })}
        disabled={l.voteRules}
      />
      <Toggle
        label="들어본 곡만 투표"
        hint="하이라이트를 들어야 그 곡을 고를 수 있어요 (각자 기기 기준)"
        checked={draft.require_listen}
        onChange={(v) => set({ require_listen: v })}
        disabled={l.done}
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
          disabled={l.done}
        />
      </div>
      <div className="field">
        <label htmlFor="vd">투표 마감</label>
        <input
          id="vd"
          type="datetime-local"
          value={toLocalInput(draft.vote_deadline)}
          onChange={(e) => set({ vote_deadline: fromLocalInput(e.target.value) })}
          disabled={l.done}
        />
      </div>
      <p className="hint">
        비워 둬도 돼요. 마감일은 모두에게 보여 주는 안내용이고, 다음 단계로는 방장이 직접 넘겨요.
      </p>
    </div>
  );
}

// 파트 편성 템플릿: 곡이 선정되면 이 순서대로 파트 자리가 생김
export function LineupField({ draft, set }) {
  const [text, setText] = useState('');
  const list = draft.lineup || [];
  const add = (e) => {
    e?.preventDefault();
    const v = text.trim().replace(/\s+/g, ' ').slice(0, 12);
    if (!v || list.includes(v) || list.length >= 12) return;
    set({ lineup: [...list, v] });
    setText('');
  };
  return (
    <div className="stack">
      <p className="hint">곡이 선정되면 이 순서대로 파트 자리가 생겨요. 같은 악기가 둘이면 기타1·기타2처럼 나눠 써요.</p>
      <ul className="chips">
        {list.map((p) => (
          <li key={p} className="chip removable">
            {p}
            <button onClick={() => set({ lineup: list.filter((x) => x !== p) })} aria-label={`${p} 빼기`}>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 신디, 코러스" aria-label="파트 추가" />
        <button className="ghost-btn small" type="submit" disabled={!text.trim()}>
          <Icon name="plus" size={14} /> 추가
        </button>
      </form>
    </div>
  );
}

function Choice({ on, onPick, title, desc, disabled }) {
  return (
    <label className={`choice${on ? ' on' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input type="radio" checked={on} onChange={onPick} disabled={disabled} />
      <span>
        <strong>{title}</strong>
        <small>{desc}</small>
      </span>
    </label>
  );
}

export function SettingsSummary({ band }) {
  const borda = band.vote_method === 'borda';
  const rows = [
    ['밴드 이름', band.name],
    ['최대 인원', `${band.max_members}명`],
    ['입장', band.join_approval ? '방장 승인 후' : '코드만 있으면 바로'],
    ['투표 방식', borda ? '점수제 (순위 매기기)' : `다수결 · ${band.use_groups ? '그룹마다' : '한 사람'} ${band.votes_per_member}곡까지`],
    ['그룹', band.use_groups ? `나눠서 뽑기${band.multi_group ? ' · 여러 그룹 허용' : ''}` : '안 씀'],
    ['투표 공개', band.anonymous_votes ? '익명' : '공개 (이름 표시)'],
    ['곡 올리기', `한 사람 ${band.songs_per_member}곡까지`],
    ['올린 사람', band.anonymous_songs ? '숨김' : '공개'],
    ['코멘트', band.allow_comments ? '허용' : '안 받음'],
    ['투표 후 수정', band.allow_vote_change ? '허용' : '안 됨'],
    ['들어본 곡만 투표', band.require_listen ? '켬' : '끔'],
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

const KEYS = [
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
  'vote_method',
  'use_groups',
  'multi_group',
  'join_approval',
  'require_listen',
  'lineup',
];

// band 객체에서 설정 값만 뽑기
export function pickSettings(band) {
  return Object.fromEntries(KEYS.map((k) => [k, band[k]]));
}

// 바뀐 값만 모아서 보냄 (잠긴 항목을 건드리지 않게)
export function diffSettings(before, after) {
  const out = {};
  for (const k of Object.keys(after)) {
    const a = before[k] == null ? null : before[k];
    const b = after[k] == null ? null : after[k];
    let same;
    if (k.endsWith('deadline')) same = (a && new Date(a).getTime()) === (b && new Date(b).getTime());
    else if (Array.isArray(a) || Array.isArray(b)) same = JSON.stringify(a) === JSON.stringify(b);
    else same = a === b;
    if (!same) out[k] = after[k];
  }
  return out;
}
