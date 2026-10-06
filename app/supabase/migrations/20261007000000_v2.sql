-- =====================================================================
--  V2 마이그레이션 — 이미 적용된 init 파일은 그대로 두고, 바뀐 것만 추가
--
--  1) 투표: 점수제(보르다) + 그룹(파트) 분류
--     · 그룹 = 곡을 담는 바구니. 방장이 수합된 곡을 A/B/C…로 나눔
--     · 투표는 그룹 단위. 그룹을 안 쓰면 투표 시작 때 '전체' 그룹 하나를 자동으로 만듦
--       → 투표·결과 코드는 늘 "그룹별"로 한 가지 방식만 다루면 됨
--     · 보르다: 그룹 곡이 n개면 1~n점을 중복 없이 전부 매겨야 제출 가능(서버가 강제)
--  2) 멤버: 입장 승인 방식(대기 → 방장 승인), 내보내기, 참여코드 새로 만들기
--  3) 파트 배분: 선정곡마다 파트 자리(보컬/기타1…) → 멤버 지원 → 방장 배정
--  4) 합주 일정: 가능한 시간 표(when2meet 방식) → 방장이 합주 확정
--  5) 곡마다 스트리밍 링크(Spotify·Apple Music 등) 저장 칸
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. 컬럼 추가
-- ---------------------------------------------------------------------

alter table public.bands
  add column if not exists vote_method    text    not null default 'majority',
  add column if not exists use_groups     boolean not null default false,
  add column if not exists multi_group    boolean not null default false,
  add column if not exists join_approval  boolean not null default false,
  add column if not exists require_listen boolean not null default false,
  add column if not exists lineup         text[]  not null default array['보컬', '기타1', '기타2', '베이스', '드럼', '키보드'];

do $$ begin
  alter table public.bands add constraint bands_vote_method_chk check (vote_method in ('majority', 'borda'));
exception when duplicate_object then null; end $$;

alter table public.members
  add column if not exists status text   not null default 'active',
  add column if not exists parts  text[] not null default '{}';

do $$ begin
  alter table public.members add constraint members_status_chk check (status in ('active', 'pending'));
exception when duplicate_object then null; end $$;

alter table public.songs
  add column if not exists links jsonb not null default '{}'::jsonb;


-- ---------------------------------------------------------------------
--  2. 새 테이블
-- ---------------------------------------------------------------------

-- 그룹(곡 바구니)
create table if not exists public.song_groups (
  id          uuid primary key default gen_random_uuid(),
  band_id     uuid not null references public.bands(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 20),
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists song_groups_band_idx on public.song_groups (band_id);

-- 어떤 곡이 어떤 그룹에 들어 있나 (중복 배정 옵션이면 한 곡이 여러 그룹에)
create table if not exists public.song_group_items (
  group_id  uuid not null references public.song_groups(id) on delete cascade,
  song_id   uuid not null references public.songs(id) on delete cascade,
  primary key (group_id, song_id)
);
create index if not exists song_group_items_song_idx on public.song_group_items (song_id);

-- 곡별 파트 자리
create table if not exists public.song_slots (
  id          uuid primary key default gen_random_uuid(),
  band_id     uuid not null references public.bands(id) on delete cascade,
  song_id     uuid not null references public.songs(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 12),
  sort        int  not null default 0,
  assignee    uuid references public.members(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (song_id, name)
);
create index if not exists song_slots_band_idx on public.song_slots (band_id);

-- 파트 자리에 "저 할래요" 지원
create table if not exists public.slot_requests (
  slot_id    uuid not null references public.song_slots(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (slot_id, member_id)
);

-- 합주 일정 조율 (밴드당 하나. 새로 만들면 이전 것 대체)
create table if not exists public.schedule_polls (
  id          uuid primary key default gen_random_uuid(),
  band_id     uuid not null unique references public.bands(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 40),
  start_date  date not null,
  end_date    date not null,
  start_hour  int  not null check (start_hour between 0 and 23),
  end_hour    int  not null check (end_hour between 1 and 24),
  created_at  timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 20),
  check (end_hour > start_hour)
);

-- 가능한 시간 (1시간 단위 칸)
create table if not exists public.availability (
  poll_id    uuid not null references public.schedule_polls(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  day        date not null,
  hour       smallint not null check (hour between 0 and 23),
  primary key (poll_id, member_id, day, hour)
);

-- "가능한 시간 없음"도 응답으로 치려고 따로 기록
create table if not exists public.availability_responses (
  poll_id     uuid not null references public.schedule_polls(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  updated_at  timestamptz not null default now(),
  primary key (poll_id, member_id)
);

-- 확정된 합주
create table if not exists public.rehearsals (
  id          uuid primary key default gen_random_uuid(),
  band_id     uuid not null references public.bands(id) on delete cascade,
  day         date not null,
  start_hour  int  not null check (start_hour between 0 and 23),
  end_hour    int  not null check (end_hour between 1 and 24),
  place       text check (place is null or char_length(place) <= 40),
  note        text check (note is null or char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  check (end_hour > start_hour)
);
create index if not exists rehearsals_band_idx on public.rehearsals (band_id);


-- ---------------------------------------------------------------------
--  3. 투표를 그룹 단위로 — 기존 표 보존(백필)
-- ---------------------------------------------------------------------

alter table public.votes
  add column if not exists group_id uuid references public.song_groups(id) on delete cascade,
  add column if not exists points   int  not null default 1;

-- 이미 투표가 시작됐던 방은 '전체' 그룹 하나를 만들어 기존 표를 그 안으로
do $$
declare
  r record;
  v_gid uuid;
begin
  for r in
    select bd.id from public.bands bd
    where bd.status in ('voting', 'done')
      and not exists (select 1 from public.song_groups sg where sg.band_id = bd.id)
  loop
    insert into public.song_groups (band_id, name, sort) values (r.id, '전체', 0) returning id into v_gid;
    insert into public.song_group_items (group_id, song_id)
      select v_gid, s.id from public.songs s where s.band_id = r.id;
    update public.votes set group_id = v_gid where band_id = r.id and group_id is null;
  end loop;
end $$;

delete from public.votes where group_id is null;
alter table public.votes alter column group_id set not null;
alter table public.votes drop constraint if exists votes_song_id_member_id_key;
create unique index if not exists votes_group_song_member_uniq on public.votes (group_id, song_id, member_id);
create index if not exists votes_member_idx on public.votes (member_id);


-- ---------------------------------------------------------------------
--  4. 잠금 (새 테이블도 브라우저 직접 접근 차단)
-- ---------------------------------------------------------------------

alter table public.song_groups            enable row level security;
alter table public.song_group_items       enable row level security;
alter table public.song_slots             enable row level security;
alter table public.slot_requests          enable row level security;
alter table public.schedule_polls         enable row level security;
alter table public.availability           enable row level security;
alter table public.availability_responses enable row level security;
alter table public.rehearsals             enable row level security;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.song_groups, public.song_group_items, public.song_slots, public.slot_requests,
             public.schedule_polls, public.availability, public.availability_responses, public.rehearsals
             from anon, authenticated';
  end if;
end $$;


-- ---------------------------------------------------------------------
--  5. 내부 도우미
-- ---------------------------------------------------------------------

-- 승인 대기 중인 사람은 보기(get_state)만 가능, 나머지 기능은 PENDING_APPROVAL
create or replace function private.auth(p_token text)
returns public.members language plpgsql stable security definer
set search_path = ''
as $$
declare m public.members;
begin
  select mem.* into m
  from public.sessions s join public.members mem on mem.id = s.member_id
  where s.token_hash = private.hash_token(p_token);
  if not found then raise exception 'SESSION_EXPIRED'; end if;
  if m.status = 'pending' then raise exception 'PENDING_APPROVAL'; end if;
  return m;
end $$;

create or replace function private.auth_any(p_token text)
returns public.members language plpgsql stable security definer
set search_path = ''
as $$
declare m public.members;
begin
  select mem.* into m
  from public.sessions s join public.members mem on mem.id = s.member_id
  where s.token_hash = private.hash_token(p_token);
  if not found then raise exception 'SESSION_EXPIRED'; end if;
  return m;
end $$;

-- 글자 배열 정리: 공백 정리, 빈 값/중복 제거, 순서 유지
create or replace function private.clean_list(p text[], p_max_len int)
returns text[] language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(v order by first_ord), '{}')
  from (
    select v, min(ord) as first_ord
    from (
      select regexp_replace(btrim(x), '\s+', ' ', 'g') as v, ord
      from unnest(coalesce(p, '{}')) with ordinality as t(x, ord)
    ) a
    where char_length(v) between 1 and p_max_len
    group by v
  ) b
$$;

-- 곡이 선정되면 밴드 편성(lineup)대로 파트 자리 자동 생성
create or replace function private.ensure_slots(p_song_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_band public.bands;
begin
  if exists (select 1 from public.song_slots where song_id = p_song_id) then return; end if;
  select bd.* into v_band from public.bands bd join public.songs s on s.band_id = bd.id where s.id = p_song_id;
  insert into public.song_slots (band_id, song_id, name, sort)
  select v_band.id, p_song_id, x, ord::int
  from unnest(v_band.lineup) with ordinality as t(x, ord)
  on conflict (song_id, name) do nothing;
end $$;

revoke all on all functions in schema private from public;


-- ---------------------------------------------------------------------
--  6. [A] 진입 — 승인 방식 반영
-- ---------------------------------------------------------------------

create or replace function public.peek_band(p_invite_code text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare b public.bands;
begin
  select * into b from public.bands where invite_code = private.clean_code(p_invite_code);
  if not found then return jsonb_build_object('ok', false, 'error', 'NO_BAND'); end if;
  return jsonb_build_object(
    'ok', true,
    'band_name', b.name,
    'invite_code', b.invite_code,
    'status', b.status,
    'member_count', (select count(*) from public.members where band_id = b.id),
    'max_members', b.max_members,
    'join_approval', b.join_approval
  );
end $$;

create or replace function public.join_band(p_invite_code text, p_name text, p_pin text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := private.clean_name(p_name);
  b public.bands;
  v_member_id uuid;
  v_status text;
begin
  perform private.check_name_pin(v_name, p_pin);

  select * into b from public.bands
  where invite_code = private.clean_code(p_invite_code) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'NO_BAND'); end if;

  if exists (select 1 from public.members where band_id = b.id and lower(name) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'error', 'NAME_TAKEN');
  end if;
  if (select count(*) from public.members where band_id = b.id) >= b.max_members then
    return jsonb_build_object('ok', false, 'error', 'BAND_FULL');
  end if;

  v_status := case when b.join_approval then 'pending' else 'active' end;
  insert into public.members (band_id, name, pin_hash, role, status)
  values (b.id, v_name, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), 'member', v_status)
  returning id into v_member_id;

  return jsonb_build_object(
    'ok', true,
    'token', private.new_session(v_member_id),
    'band_id', b.id,
    'band_name', b.name,
    'invite_code', b.invite_code,
    'pending', v_status = 'pending'
  );
end $$;


-- ---------------------------------------------------------------------
--  7. [C] 상태 한 번에 — V2 (그룹·점수·파트·합주 포함)
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
      'lineup', to_jsonb(b.lineup)),

    -- 참여 현황만 (뭘 찍었는지는 없음). 승인 대기자는 방장에게만 보임
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', m.id, 'name', m.name, 'role', m.role, 'status', m.status, 'parts', to_jsonb(m.parts),
          'song_count', (select count(*) from public.songs s where s.member_id = m.id),
          'voted_groups', (select count(distinct v.group_id) from public.votes v where v.member_id = m.id),
          'voted', v_group_count > 0 and
                   (select count(distinct v.group_id) from public.votes v where v.member_id = m.id) >= v_group_count)
        order by (m.role = 'leader') desc, (m.status = 'pending') desc, m.created_at)
      from public.members m
      where m.band_id = b.id and (m.status = 'active' or v_is_leader)), '[]'::jsonb),

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
      from public.song_slots sl where sl.band_id = b.id), '[]'::jsonb) else '[]'::jsonb end,

    -- 합주 일정 조율
    'schedule', (
      select jsonb_build_object(
        'id', p.id, 'title', p.title, 'start_date', p.start_date, 'end_date', p.end_date,
        'start_hour', p.start_hour, 'end_hour', p.end_hour,
        'cells', coalesce((
          select jsonb_agg(jsonb_build_object('day', a.day, 'hour', a.hour, 'member_ids', a.ids))
          from (select day, hour, jsonb_agg(member_id) as ids
                from public.availability where poll_id = p.id group by day, hour) a), '[]'::jsonb),
        'responded', coalesce((select jsonb_agg(member_id) from public.availability_responses
                               where poll_id = p.id), '[]'::jsonb))
      from public.schedule_polls p where p.band_id = b.id),

    'rehearsals', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', r.id, 'day', r.day, 'start_hour', r.start_hour, 'end_hour', r.end_hour,
          'place', r.place, 'note', r.note)
        order by r.day, r.start_hour)
      from public.rehearsals r where r.band_id = b.id), '[]'::jsonb)
  );
end $$;


-- ---------------------------------------------------------------------
--  8. [B] 설정 — 새 옵션 + 잠금 규칙
--    · 투표 방식 / 그룹 사용 / 중복 배정: 투표 시작 후 고정
--    · 확정 후에는 이름·인원·승인 방식·파트 편성만 수정 가능
-- ---------------------------------------------------------------------

create or replace function public.update_settings(p_token text, p_patch jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me  public.members := private.auth(p_token);
  b   public.bands;
  n   public.bands;
  cnt int;
begin
  perform private.require_leader(me);
  select * into b from public.bands where id = me.band_id for update;

  n := b;
  if p_patch ? 'name'              then n.name := private.clean_name(p_patch->>'name'); end if;
  if p_patch ? 'max_members'       then n.max_members := (p_patch->>'max_members')::int; end if;
  if p_patch ? 'songs_per_member'  then n.songs_per_member := (p_patch->>'songs_per_member')::int; end if;
  if p_patch ? 'votes_per_member'  then n.votes_per_member := (p_patch->>'votes_per_member')::int; end if;
  if p_patch ? 'anonymous_songs'   then n.anonymous_songs := (p_patch->>'anonymous_songs')::boolean; end if;
  if p_patch ? 'anonymous_votes'   then n.anonymous_votes := (p_patch->>'anonymous_votes')::boolean; end if;
  if p_patch ? 'allow_comments'    then n.allow_comments := (p_patch->>'allow_comments')::boolean; end if;
  if p_patch ? 'allow_vote_change' then n.allow_vote_change := (p_patch->>'allow_vote_change')::boolean; end if;
  if p_patch ? 'collect_deadline'  then n.collect_deadline := (p_patch->>'collect_deadline')::timestamptz; end if;
  if p_patch ? 'vote_deadline'     then n.vote_deadline := (p_patch->>'vote_deadline')::timestamptz; end if;
  if p_patch ? 'vote_method'       then n.vote_method := p_patch->>'vote_method'; end if;
  if p_patch ? 'use_groups'        then n.use_groups := (p_patch->>'use_groups')::boolean; end if;
  if p_patch ? 'multi_group'       then n.multi_group := (p_patch->>'multi_group')::boolean; end if;
  if p_patch ? 'join_approval'     then n.join_approval := (p_patch->>'join_approval')::boolean; end if;
  if p_patch ? 'require_listen'    then n.require_listen := (p_patch->>'require_listen')::boolean; end if;
  if p_patch ? 'lineup' then
    n.lineup := private.clean_list(array(select jsonb_array_elements_text(p_patch->'lineup')), 12);
  end if;

  -- 확정된 방: 일부만 수정 가능
  if b.status = 'done' and (
       n.songs_per_member  is distinct from b.songs_per_member or
       n.votes_per_member  is distinct from b.votes_per_member or
       n.anonymous_songs   is distinct from b.anonymous_songs or
       n.anonymous_votes   is distinct from b.anonymous_votes or
       n.allow_comments    is distinct from b.allow_comments or
       n.allow_vote_change is distinct from b.allow_vote_change or
       n.collect_deadline  is distinct from b.collect_deadline or
       n.vote_deadline     is distinct from b.vote_deadline or
       n.vote_method       is distinct from b.vote_method or
       n.use_groups        is distinct from b.use_groups or
       n.multi_group       is distinct from b.multi_group or
       n.require_listen    is distinct from b.require_listen) then
    raise exception 'BAND_DONE';
  end if;

  if b.status <> 'setup' and n.anonymous_songs is distinct from b.anonymous_songs then
    raise exception 'LOCKED_ANON_SONGS';
  end if;
  if b.status in ('voting', 'done') and (
       n.anonymous_votes   is distinct from b.anonymous_votes or
       n.votes_per_member  is distinct from b.votes_per_member or
       n.allow_vote_change is distinct from b.allow_vote_change or
       n.vote_method       is distinct from b.vote_method or
       n.use_groups        is distinct from b.use_groups or
       n.multi_group       is distinct from b.multi_group) then
    raise exception 'LOCKED_VOTE_RULES';
  end if;

  if char_length(n.name) not between 1 and 30 then raise exception 'BAD_BAND_NAME'; end if;
  if n.max_members not between 2 and 30
     or n.songs_per_member not between 1 and 10
     or n.votes_per_member not between 1 and 20
     or n.vote_method not in ('majority', 'borda')
     or cardinality(n.lineup) > 12 then
    raise exception 'BAD_SETTINGS';
  end if;

  -- 중복 배정을 끄려는데 이미 두 그룹에 들어간 곡이 있으면 막음
  if not n.multi_group and b.multi_group and exists (
       select 1 from public.song_group_items i join public.song_groups g on g.id = i.group_id
       where g.band_id = b.id group by i.song_id having count(*) > 1) then
    raise exception 'MULTI_GROUP_IN_USE';
  end if;

  select count(*) into cnt from public.members where band_id = b.id;
  if n.max_members < cnt then raise exception 'MAX_BELOW_CURRENT'; end if;

  update public.bands set
    name = n.name, max_members = n.max_members,
    songs_per_member = n.songs_per_member, votes_per_member = n.votes_per_member,
    anonymous_songs = n.anonymous_songs, anonymous_votes = n.anonymous_votes,
    allow_comments = n.allow_comments, allow_vote_change = n.allow_vote_change,
    collect_deadline = n.collect_deadline, vote_deadline = n.vote_deadline,
    vote_method = n.vote_method, use_groups = n.use_groups, multi_group = n.multi_group,
    join_approval = n.join_approval, require_listen = n.require_listen, lineup = n.lineup
  where id = b.id;

  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
--  9. [D-2] 단계 전환 — 투표 시작 때 그룹 확정
-- ---------------------------------------------------------------------

create or replace function public.advance_status(p_token text, p_from text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  b  public.bands;
  v_next text;
  v_gid uuid;
begin
  perform private.require_leader(me);
  select * into b from public.bands where id = me.band_id for update;
  if b.status <> p_from then raise exception 'STALE_STATUS'; end if;

  v_next := case b.status
    when 'setup' then 'collecting'
    when 'collecting' then 'voting'
    when 'voting' then 'done' end;
  if v_next is null then raise exception 'BAND_DONE'; end if;

  if v_next = 'voting' then
    if not exists (select 1 from public.songs where band_id = b.id) then
      raise exception 'NO_SONGS';
    end if;

    if b.use_groups then
      if not exists (select 1 from public.song_groups where band_id = b.id) then
        raise exception 'NO_GROUPS';
      end if;
      if exists (select 1 from public.songs s where s.band_id = b.id
                 and not exists (select 1 from public.song_group_items i where i.song_id = s.id)) then
        raise exception 'UNGROUPED_SONGS';
      end if;
      -- 곡이 하나도 없는 그룹은 조용히 정리
      delete from public.song_groups g where g.band_id = b.id
        and not exists (select 1 from public.song_group_items i where i.group_id = g.id);
    else
      -- 그룹을 안 쓰면 '전체' 그룹 하나로
      delete from public.song_groups where band_id = b.id;
      insert into public.song_groups (band_id, name, sort) values (b.id, '전체', 0) returning id into v_gid;
      insert into public.song_group_items (group_id, song_id)
        select v_gid, s.id from public.songs s where s.band_id = b.id;
    end if;
  end if;

  update public.bands set status = v_next where id = b.id;
  return jsonb_build_object('ok', true, 'status', v_next);
end $$;


-- ---------------------------------------------------------------------
--  10. 그룹 나누기 (방장, 투표 시작 전까지)
-- ---------------------------------------------------------------------

create or replace function public.create_group(p_token text, p_name text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  b  public.bands;
  v_name text := private.clean_name(p_name);
  v_id uuid;
begin
  perform private.require_leader(me);
  select * into b from public.bands where id = me.band_id for update;
  if b.status not in ('setup', 'collecting') then raise exception 'GROUPS_LOCKED'; end if;
  if char_length(v_name) not between 1 and 20 then raise exception 'BAD_GROUP_NAME'; end if;
  if (select count(*) from public.song_groups where band_id = b.id) >= 10 then raise exception 'GROUP_LIMIT'; end if;
  if exists (select 1 from public.song_groups where band_id = b.id and lower(name) = lower(v_name)) then
    raise exception 'GROUP_NAME_TAKEN';
  end if;
  insert into public.song_groups (band_id, name, sort)
  values (b.id, v_name, coalesce((select max(sort) + 1 from public.song_groups where band_id = b.id), 0))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'group_id', v_id);
end $$;

create or replace function public.rename_group(p_token text, p_group_id uuid, p_name text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  v_status text;
  v_name text := private.clean_name(p_name);
begin
  perform private.require_leader(me);
  select status into v_status from public.bands where id = me.band_id;
  if v_status not in ('setup', 'collecting') then raise exception 'GROUPS_LOCKED'; end if;
  if char_length(v_name) not between 1 and 20 then raise exception 'BAD_GROUP_NAME'; end if;
  if exists (select 1 from public.song_groups where band_id = me.band_id and lower(name) = lower(v_name)
             and id <> p_group_id) then
    raise exception 'GROUP_NAME_TAKEN';
  end if;
  update public.song_groups set name = v_name where id = p_group_id and band_id = me.band_id;
  if not found then raise exception 'BAD_GROUP'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.delete_group(p_token text, p_group_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  v_status text;
begin
  perform private.require_leader(me);
  select status into v_status from public.bands where id = me.band_id;
  if v_status not in ('setup', 'collecting') then raise exception 'GROUPS_LOCKED'; end if;
  delete from public.song_groups where id = p_group_id and band_id = me.band_id;
  if not found then raise exception 'BAD_GROUP'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- 곡 하나를 어느 그룹(들)에 넣을지 통째로 지정. 빈 배열이면 미분류
create or replace function public.set_song_groups(p_token text, p_song_id uuid, p_group_ids uuid[])
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  b  public.bands;
  v_ids uuid[];
begin
  perform private.require_leader(me);
  select * into b from public.bands where id = me.band_id;
  if b.status not in ('setup', 'collecting') then raise exception 'GROUPS_LOCKED'; end if;
  if not exists (select 1 from public.songs where id = p_song_id and band_id = b.id) then
    raise exception 'BAD_SONG';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_group_ids, '{}')) x;
  if cardinality(v_ids) > 1 and not b.multi_group then raise exception 'MULTI_GROUP_OFF'; end if;
  if (select count(*) from public.song_groups where band_id = b.id and id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'BAD_GROUP';
  end if;

  delete from public.song_group_items i using public.song_groups g
  where i.group_id = g.id and g.band_id = b.id and i.song_id = p_song_id;
  insert into public.song_group_items (group_id, song_id) select x, p_song_id from unnest(v_ids) x;
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
--  11. [C-2] 투표 — 그룹 하나씩 제출
--    · 다수결: 그룹마다 1~N곡 고르기 (각 1점)
--    · 점수제(보르다): 그룹 곡 전부를 순서대로 → 1등 n점 … 꼴등 1점
--      한 곡이라도 빠지면 INCOMPLETE_RANKING (미완성 표는 아예 안 받음)
-- ---------------------------------------------------------------------

drop function if exists public.submit_votes(text, uuid[]);

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
--  12. [C-3] 선정 — 선정하면 파트 자리 자동 생성
-- ---------------------------------------------------------------------

create or replace function public.set_selected(p_token text, p_song_id uuid, p_selected boolean)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  v_status text;
begin
  perform private.require_leader(me);
  select status into v_status from public.bands where id = me.band_id;
  if v_status <> 'done' then raise exception 'NOT_DONE'; end if;
  update public.songs set selected = coalesce(p_selected, false)
  where id = p_song_id and band_id = me.band_id;
  if not found then raise exception 'BAD_SONG'; end if;
  if coalesce(p_selected, false) then perform private.ensure_slots(p_song_id); end if;
  return jsonb_build_object('ok', true);
end $$;

-- 곡마다 스트리밍 링크 저장 (올린 사람만)
create or replace function public.set_song_links(p_token text, p_song_id uuid, p_links jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  v_clean jsonb := '{}'::jsonb;
  k text;
begin
  foreach k in array array['spotify', 'apple', 'melon', 'youtube_music'] loop
    if p_links ? k and (p_links->>k) ~ '^https://\S+$' and char_length(p_links->>k) <= 300 then
      v_clean := v_clean || jsonb_build_object(k, p_links->>k);
    end if;
  end loop;
  update public.songs set links = v_clean where id = p_song_id and member_id = me.id;
  if not found then raise exception 'NOT_YOURS'; end if;
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
--  13. [D-1] 멤버 — 승인 / 내보내기 / 참여코드 새로 / 내 파트
-- ---------------------------------------------------------------------

create or replace function public.approve_member(p_token text, p_member_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare me public.members := private.auth(p_token);
begin
  perform private.require_leader(me);
  update public.members set status = 'active'
  where id = p_member_id and band_id = me.band_id and status = 'pending';
  if not found then raise exception 'NO_MEMBER'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- 승인 거절도 이걸로. 올린 곡·표·지원 기록이 같이 지워짐
create or replace function public.remove_member(p_token text, p_member_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  t  public.members;
  v_status text;
begin
  perform private.require_leader(me);
  select * into t from public.members where id = p_member_id and band_id = me.band_id;
  if not found then raise exception 'NO_MEMBER'; end if;
  if t.role = 'leader' then raise exception 'CANNOT_REMOVE_LEADER'; end if;
  select status into v_status from public.bands where id = me.band_id;
  -- 투표 중에 곡을 올린 사람을 빼면 다른 사람의 순위표가 깨짐
  if v_status = 'voting' and exists (select 1 from public.songs where member_id = t.id) then
    raise exception 'KICK_LOCKED';
  end if;
  delete from public.members where id = t.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.regenerate_invite_code(p_token text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  v_code text := private.new_invite_code();
begin
  perform private.require_leader(me);
  update public.bands set invite_code = v_code where id = me.band_id;
  return jsonb_build_object('ok', true, 'invite_code', v_code);
end $$;

create or replace function public.set_my_parts(p_token text, p_parts text[])
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  v_parts text[] := private.clean_list(p_parts, 10);
begin
  if cardinality(v_parts) > 6 then raise exception 'TOO_MANY_PARTS'; end if;
  update public.members set parts = v_parts where id = me.id;
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
--  14. 파트 배분 (확정 단계)
-- ---------------------------------------------------------------------

create or replace function public.add_slot(p_token text, p_song_id uuid, p_name text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  v_name text := private.clean_name(p_name);
  v_status text;
begin
  perform private.require_leader(me);
  select status into v_status from public.bands where id = me.band_id;
  if v_status <> 'done' then raise exception 'NOT_DONE'; end if;
  if not exists (select 1 from public.songs where id = p_song_id and band_id = me.band_id and selected) then
    raise exception 'BAD_SONG';
  end if;
  if char_length(v_name) not between 1 and 12 then raise exception 'BAD_SLOT_NAME'; end if;
  if (select count(*) from public.song_slots where song_id = p_song_id) >= 12 then raise exception 'SLOT_LIMIT'; end if;
  if exists (select 1 from public.song_slots where song_id = p_song_id and lower(name) = lower(v_name)) then
    raise exception 'DUPLICATE_SLOT';
  end if;
  insert into public.song_slots (band_id, song_id, name, sort)
  values (me.band_id, p_song_id, v_name,
          coalesce((select max(sort) + 1 from public.song_slots where song_id = p_song_id), 1));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.remove_slot(p_token text, p_slot_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare me public.members := private.auth(p_token);
begin
  perform private.require_leader(me);
  delete from public.song_slots where id = p_slot_id and band_id = me.band_id;
  if not found then raise exception 'BAD_SLOT'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.assign_slot(p_token text, p_slot_id uuid, p_member_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare me public.members := private.auth(p_token);
begin
  perform private.require_leader(me);
  if p_member_id is not null and not exists (
       select 1 from public.members where id = p_member_id and band_id = me.band_id and status = 'active') then
    raise exception 'NO_MEMBER';
  end if;
  update public.song_slots set assignee = p_member_id where id = p_slot_id and band_id = me.band_id;
  if not found then raise exception 'BAD_SLOT'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- "이 자리 할래요" 손들기 / 내리기
create or replace function public.toggle_slot_request(p_token text, p_slot_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  v_status text;
begin
  select status into v_status from public.bands where id = me.band_id;
  if v_status <> 'done' then raise exception 'NOT_DONE'; end if;
  if not exists (select 1 from public.song_slots where id = p_slot_id and band_id = me.band_id) then
    raise exception 'BAD_SLOT';
  end if;
  delete from public.slot_requests where slot_id = p_slot_id and member_id = me.id;
  if found then return jsonb_build_object('ok', true, 'requested', false); end if;
  insert into public.slot_requests (slot_id, member_id) values (p_slot_id, me.id);
  return jsonb_build_object('ok', true, 'requested', true);
end $$;


-- ---------------------------------------------------------------------
--  15. 합주 일정 조율
-- ---------------------------------------------------------------------

create or replace function public.create_schedule(
  p_token text, p_title text, p_start_date date, p_end_date date, p_start_hour int, p_end_hour int)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  v_title text := private.clean_name(p_title);
begin
  perform private.require_leader(me);
  if char_length(v_title) not between 1 and 40 then raise exception 'BAD_TITLE'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_end_date - p_start_date > 20 then
    raise exception 'BAD_DATE_RANGE';
  end if;
  if p_start_hour not between 0 and 23 or p_end_hour not between 1 and 24 or p_end_hour <= p_start_hour then
    raise exception 'BAD_HOUR_RANGE';
  end if;
  delete from public.schedule_polls where band_id = me.band_id;
  insert into public.schedule_polls (band_id, title, start_date, end_date, start_hour, end_hour)
  values (me.band_id, v_title, p_start_date, p_end_date, p_start_hour, p_end_hour);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.delete_schedule(p_token text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare me public.members := private.auth(p_token);
begin
  perform private.require_leader(me);
  delete from public.schedule_polls where band_id = me.band_id;
  return jsonb_build_object('ok', true);
end $$;

-- 내 가능 시간 통째로 저장. p_cells = [{"day":"2026-10-12","hour":19}, ...]
create or replace function public.set_availability(p_token text, p_cells jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  p  public.schedule_polls;
  v_bad int;
begin
  select * into p from public.schedule_polls where band_id = me.band_id;
  if not found then raise exception 'NO_SCHEDULE'; end if;
  if jsonb_typeof(coalesce(p_cells, '[]'::jsonb)) <> 'array' then raise exception 'BAD_CELLS'; end if;

  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_cells, '[]'::jsonb)) c
  where (c->>'day') is null or (c->>'hour') is null
     or (c->>'day')::date not between p.start_date and p.end_date
     or (c->>'hour')::int < p.start_hour or (c->>'hour')::int >= p.end_hour;
  if v_bad > 0 then raise exception 'BAD_CELLS'; end if;

  delete from public.availability where poll_id = p.id and member_id = me.id;
  insert into public.availability (poll_id, member_id, day, hour)
  select distinct p.id, me.id, (c->>'day')::date, (c->>'hour')::smallint
  from jsonb_array_elements(coalesce(p_cells, '[]'::jsonb)) c;

  insert into public.availability_responses (poll_id, member_id) values (p.id, me.id)
  on conflict (poll_id, member_id) do update set updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.add_rehearsal(
  p_token text, p_day date, p_start_hour int, p_end_hour int, p_place text, p_note text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare me public.members := private.auth(p_token);
begin
  perform private.require_leader(me);
  if p_day is null then raise exception 'BAD_DATE_RANGE'; end if;
  if p_start_hour not between 0 and 23 or p_end_hour not between 1 and 24 or p_end_hour <= p_start_hour then
    raise exception 'BAD_HOUR_RANGE';
  end if;
  if (select count(*) from public.rehearsals where band_id = me.band_id) >= 50 then
    raise exception 'REHEARSAL_LIMIT';
  end if;
  insert into public.rehearsals (band_id, day, start_hour, end_hour, place, note)
  values (me.band_id, p_day, p_start_hour, p_end_hour,
          nullif(private.clean_name(p_place), ''), nullif(btrim(coalesce(p_note, '')), ''));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.delete_rehearsal(p_token text, p_rehearsal_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare me public.members := private.auth(p_token);
begin
  perform private.require_leader(me);
  delete from public.rehearsals where id = p_rehearsal_id and band_id = me.band_id;
  if not found then raise exception 'BAD_REHEARSAL'; end if;
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
--  16. 권한: 새로 생긴 함수도 브라우저(anon)가 부를 수 있게
-- ---------------------------------------------------------------------

do $$
declare
  fn text;
  fns text[] := array[
    'public.peek_band(text)',
    'public.join_band(text, text, text)',
    'public.get_state(text)',
    'public.update_settings(text, jsonb)',
    'public.advance_status(text, text)',
    'public.create_group(text, text)',
    'public.rename_group(text, uuid, text)',
    'public.delete_group(text, uuid)',
    'public.set_song_groups(text, uuid, uuid[])',
    'public.submit_ballot(text, uuid, uuid[])',
    'public.set_selected(text, uuid, boolean)',
    'public.set_song_links(text, uuid, jsonb)',
    'public.approve_member(text, uuid)',
    'public.remove_member(text, uuid)',
    'public.regenerate_invite_code(text)',
    'public.set_my_parts(text, text[])',
    'public.add_slot(text, uuid, text)',
    'public.remove_slot(text, uuid)',
    'public.assign_slot(text, uuid, uuid)',
    'public.toggle_slot_request(text, uuid)',
    'public.create_schedule(text, text, date, date, int, int)',
    'public.delete_schedule(text)',
    'public.set_availability(text, jsonb)',
    'public.add_rehearsal(text, date, int, int, text, text)',
    'public.delete_rehearsal(text, uuid)'
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
