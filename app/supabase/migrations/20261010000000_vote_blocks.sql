-- =====================================================================
--  투표 제한 — 방장이 "이 사람은 이 그룹에 투표 안 함"을 정함
--
--  · vote_blocks(group_id, member_id) 한 줄 = 그 사람은 그 그룹에 투표 못 함
--    (곡은 그대로 보이고 들을 수 있음. 투표만 막힘)
--  · 설정중·곡 수합·투표 중에 방장이 바꿀 수 있음. 확정되면 고정
--  · 투표 중에 막으면 그 사람이 그 그룹에 이미 낸 표는 지움
--  · "투표 완료" 계산은 그 사람이 투표할 수 있는 그룹만 셈
--  · 테이블·함수를 "추가"만 함 → 곡 수합 중에 적용해도 기존 데이터·화면에 영향 없음
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. 테이블
-- ---------------------------------------------------------------------

create table if not exists public.vote_blocks (
  group_id    uuid not null references public.song_groups(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (group_id, member_id)
);
create index if not exists vote_blocks_member_idx on public.vote_blocks (member_id);

-- 브라우저 직접 접근 차단 (다른 테이블과 같은 방식)
alter table public.vote_blocks enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.vote_blocks from anon, authenticated';
  end if;
end $$;


-- ---------------------------------------------------------------------
--  2. [D] 방장: 투표 제한 켜기/끄기
-- ---------------------------------------------------------------------

create or replace function public.set_vote_block(p_token text, p_group_id uuid, p_member_id uuid, p_blocked boolean)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  b  public.bands;
  v_removed int := 0;
begin
  perform private.require_leader(me);
  select * into b from public.bands where id = me.band_id;
  if b.status = 'done' then raise exception 'BAND_DONE'; end if;
  if not exists (select 1 from public.song_groups where id = p_group_id and band_id = b.id) then
    raise exception 'BAD_GROUP';
  end if;
  if not exists (select 1 from public.members where id = p_member_id and band_id = b.id and status = 'active') then
    raise exception 'NO_MEMBER';
  end if;

  if coalesce(p_blocked, false) then
    insert into public.vote_blocks (group_id, member_id) values (p_group_id, p_member_id)
    on conflict do nothing;
    -- 이미 낸 표가 있으면 지움 (막힌 그룹 표가 결과에 섞이지 않게)
    delete from public.votes where group_id = p_group_id and member_id = p_member_id;
    get diagnostics v_removed = row_count;
  else
    delete from public.vote_blocks where group_id = p_group_id and member_id = p_member_id;
  end if;

  return jsonb_build_object('ok', true, 'removed_votes', v_removed);
end $$;


-- ---------------------------------------------------------------------
--  3. [C-2] 투표 제출 — 막힌 그룹이면 거절 (나머지는 V2와 같음)
-- ---------------------------------------------------------------------

create or replace function public.submit_ballot(p_token text, p_group_id uuid, p_song_ids uuid[])
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  b  public.bands;
  v_ids uuid[];
  v_group_songs uuid[];
  n int;
begin
  select * into b from public.bands where id = me.band_id;
  if b.status <> 'voting' then raise exception 'NOT_VOTING'; end if;
  if not exists (select 1 from public.song_groups where id = p_group_id and band_id = b.id) then
    raise exception 'BAD_GROUP';
  end if;
  -- 방장이 이 그룹 투표에서 뺀 사람
  if exists (select 1 from public.vote_blocks where group_id = p_group_id and member_id = me.id) then
    raise exception 'VOTE_BLOCKED';
  end if;

  select coalesce(array_agg(song_id), '{}') into v_group_songs
  from public.song_group_items where group_id = p_group_id;
  n := cardinality(v_group_songs);

  -- 중복 제거하되 순서(순위)는 유지
  select coalesce(array_agg(x order by first_ord), '{}') into v_ids
  from (select x, min(ord) as first_ord
        from unnest(coalesce(p_song_ids, '{}')) with ordinality as t(x, ord) group by x) s;

  if cardinality(v_ids) = 0 then raise exception 'NO_VOTES'; end if;
  if not (v_ids <@ v_group_songs) then raise exception 'BAD_SONG'; end if;

  if b.vote_method = 'borda' then
    if cardinality(v_ids) <> n then raise exception 'INCOMPLETE_RANKING'; end if;
  elsif cardinality(v_ids) > b.votes_per_member then
    raise exception 'TOO_MANY_VOTES';
  end if;

  perform 1 from public.members where id = me.id for update;

  if not b.allow_vote_change and exists (
       select 1 from public.votes where member_id = me.id and group_id = p_group_id) then
    raise exception 'VOTE_LOCKED';
  end if;

  delete from public.votes where member_id = me.id and group_id = p_group_id;
  insert into public.votes (band_id, group_id, song_id, member_id, points)
  select b.id, p_group_id, x, me.id,
         case when b.vote_method = 'borda' then n - ord::int + 1 else 1 end
  from unnest(v_ids) with ordinality as t(x, ord);

  return jsonb_build_object('ok', true, 'count', cardinality(v_ids));
end $$;


-- ---------------------------------------------------------------------
--  4. [C] 상태 — 투표 제한 목록 + "투표 완료"를 투표할 수 있는 그룹 기준으로
--     + 결과에 그룹별 투표 인원 (나머지는 V3와 같음)
-- ---------------------------------------------------------------------

create or replace function public.get_state(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  me public.members := private.auth_any(p_token);
  b  public.bands;
  v_is_leader boolean := me.role = 'leader';
  v_group_count int;
begin
  select * into b from public.bands where id = me.band_id;

  -- 승인 대기 중이면 방 이름 정도만
  if me.status = 'pending' then
    return jsonb_build_object(
      'pending', true,
      'me', jsonb_build_object('id', me.id, 'name', me.name, 'role', me.role, 'status', me.status,
                               'must_change_pin', me.must_change_pin, 'parts', to_jsonb(me.parts)),
      'band', jsonb_build_object('id', b.id, 'name', b.name, 'invite_code', b.invite_code, 'status', b.status));
  end if;

  select count(*) into v_group_count from public.song_groups where band_id = b.id;

  return jsonb_build_object(
    'pending', false,

    'me', jsonb_build_object(
      'id', me.id, 'name', me.name, 'role', me.role, 'status', me.status,
      'must_change_pin', me.must_change_pin, 'parts', to_jsonb(me.parts)),

    'band', jsonb_build_object(
      'id', b.id, 'name', b.name, 'invite_code', b.invite_code, 'status', b.status,
      'max_members', b.max_members,
      'songs_per_member', b.songs_per_member, 'votes_per_member', b.votes_per_member,
      'anonymous_songs', b.anonymous_songs, 'anonymous_votes', b.anonymous_votes,
      'allow_comments', b.allow_comments, 'allow_vote_change', b.allow_vote_change,
      'collect_deadline', b.collect_deadline, 'vote_deadline', b.vote_deadline,
      'vote_method', b.vote_method, 'use_groups', b.use_groups, 'multi_group', b.multi_group,
      'join_approval', b.join_approval, 'require_listen', b.require_listen,
      'youtube_enabled', b.youtube_enabled, 'leader_unlimited', b.leader_unlimited,
      'lineup', to_jsonb(b.lineup)),

    -- 참여 현황만 (뭘 찍었는지는 없음). 승인 대기자는 방장에게만 보임
    -- vote_groups: 이 사람이 투표할 수 있는 그룹 수 (방장이 막은 그룹 빼고)
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', m.id, 'name', m.name, 'role', m.role, 'status', m.status, 'parts', to_jsonb(m.parts),
          'song_count', (select count(*) from public.songs s where s.member_id = m.id),
          'vote_groups', c.allowed,
          'voted_groups', c.voted,
          'voted', c.allowed > 0 and c.voted >= c.allowed)
        order by (m.role = 'leader') desc, (m.status = 'pending') desc, m.created_at)
      from public.members m
      cross join lateral (
        select
          v_group_count - (select count(*) from public.vote_blocks vb
                           join public.song_groups g on g.id = vb.group_id
                           where vb.member_id = m.id and g.band_id = b.id) as allowed,
          (select count(distinct v.group_id) from public.votes v
           where v.member_id = m.id
             and not exists (select 1 from public.vote_blocks vb
                             where vb.group_id = v.group_id and vb.member_id = m.id)) as voted
      ) c
      where m.band_id = b.id and (m.status = 'active' or v_is_leader)), '[]'::jsonb),

    -- 투표 제한: 방장은 전부, 멤버는 나한테 걸린 것만
    'vote_blocks', coalesce((
      select jsonb_agg(jsonb_build_object('group_id', vb.group_id, 'member_id', vb.member_id))
      from public.vote_blocks vb join public.song_groups g on g.id = vb.group_id
      where g.band_id = b.id and (v_is_leader or vb.member_id = me.id)), '[]'::jsonb),

    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', g.id, 'name', g.name, 'sort', g.sort,
          'song_ids', coalesce((select jsonb_agg(i.song_id) from public.song_group_items i where i.group_id = g.id), '[]'::jsonb))
        order by g.sort, g.created_at)
      from public.song_groups g where g.band_id = b.id), '[]'::jsonb),

    'songs', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'youtube_id', s.youtube_id, 'title', s.title, 'artist', s.artist,
          'highlight_start', s.highlight_start, 'highlight_end', s.highlight_end,
          'comment', case when b.allow_comments then s.comment end,
          'selected', s.selected, 'created_at', s.created_at, 'links', s.links,
          'mine', s.member_id = me.id,
          'submitter', case when s.member_id = me.id or not b.anonymous_songs
                            then (select name from public.members where id = s.member_id) end)
        order by s.created_at)
      from public.songs s where s.band_id = b.id), '[]'::jsonb),

    -- 내 표만 (그룹별, 점수 포함)
    'my_votes', coalesce((
      select jsonb_agg(jsonb_build_object('group_id', v.group_id, 'song_id', v.song_id, 'points', v.points))
      from public.votes v where v.member_id = me.id), '[]'::jsonb),

    -- 결과는 확정 단계에서만, 방장 포함 모두에게 동시에. 그룹끼리 점수 비교는 안 함
    'results', case when b.status = 'done' then coalesce((
      select jsonb_agg(jsonb_build_object(
          'group_id', g.id,
          'voter_count', (select count(distinct v.member_id) from public.votes v where v.group_id = g.id),
          'rows', coalesce((
            select jsonb_agg(r order by (r->>'score')::int desc, (r->>'voters_count')::int desc, r->>'created_at')
            from (
              select jsonb_build_object(
                'song_id', s.id,
                'created_at', s.created_at,
                'score', coalesce((select sum(v.points) from public.votes v
                                   where v.group_id = g.id and v.song_id = s.id), 0),
                'voters_count', (select count(*) from public.votes v where v.group_id = g.id and v.song_id = s.id),
                'voters', case when b.anonymous_votes then null else coalesce((
                    select jsonb_agg(jsonb_build_object('name', m.name, 'points', v.points)
                                     order by v.points desc, m.name)
                    from public.votes v join public.members m on m.id = v.member_id
                    where v.group_id = g.id and v.song_id = s.id), '[]'::jsonb) end) as r
              from public.song_group_items i join public.songs s on s.id = i.song_id
              where i.group_id = g.id
            ) t), '[]'::jsonb))
        order by g.sort, g.created_at)
      from public.song_groups g where g.band_id = b.id), '[]'::jsonb) end,

    -- 파트 배분 (확정 단계에서만)
    'slots', case when b.status = 'done' then coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', sl.id, 'song_id', sl.song_id, 'name', sl.name, 'sort', sl.sort, 'assignee', sl.assignee,
          'requests', coalesce((select jsonb_agg(rq.member_id order by rq.created_at)
                                from public.slot_requests rq where rq.slot_id = sl.id), '[]'::jsonb))
        order by sl.sort, sl.created_at)
      from public.song_slots sl where sl.band_id = b.id), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;


-- ---------------------------------------------------------------------
--  5. 권한
-- ---------------------------------------------------------------------

do $$
declare
  fn text;
  fns text[] := array[
    'public.set_vote_block(text, uuid, uuid, boolean)',
    'public.submit_ballot(text, uuid, uuid[])',
    'public.get_state(text)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function %s to anon, authenticated', fn);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
