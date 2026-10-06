-- =====================================================================
--  밴드 곡 선정 앱 v1 (다수결) — 첫 DB 마이그레이션
--
--  이 파일은 Supabase GitHub 연동이 main에 push될 때 자동으로 적용해 줌.
--  (수동으로 하고 싶으면 SQL Editor에 통째로 붙여넣고 Run 해도 됨. 여러 번 실행해도 안전)
--
--  ⚠ 이미 적용된 마이그레이션 파일은 고치지 말 것!
--     DB를 바꾸고 싶으면 migrations/ 에 "새 파일"을 추가해야 함. (README 참고)
--
--  설계 핵심 — "브라우저는 테이블을 직접 못 만진다"
--    1) 모든 테이블에 RLS를 켜고 정책(policy)을 하나도 안 만든다.
--       → anon 키로는 어떤 행도 읽기/쓰기 불가.
--    2) 브라우저는 오직 아래 public 함수(RPC)만 호출할 수 있다.
--       함수는 security definer(= DB 주인 권한)로 돌면서,
--       "누가 불렀는지(세션 토큰)" 확인 → 규칙 검사 → 필요한 것만 돌려준다.
--    3) 그래서 PIN 해시, 남의 투표, 익명 곡의 작성자, 마감 전 득표수는
--       애초에 브라우저로 "내려오지 않는다". (UI로 가리는 게 아님)
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- 내부 도우미 함수 전용 스키마. API로 노출되지 않음.
create schema if not exists private;
revoke all on schema private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon, authenticated';
  end if;
end $$;


-- ---------------------------------------------------------------------
--  테이블
-- ---------------------------------------------------------------------

create table if not exists public.bands (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 30),
  invite_code       text not null unique,
  status            text not null default 'setup'
                    check (status in ('setup', 'collecting', 'voting', 'done')),
  max_members       int  not null default 8  check (max_members between 2 and 30),
  songs_per_member  int  not null default 2  check (songs_per_member between 1 and 10),
  votes_per_member  int  not null default 3  check (votes_per_member between 1 and 20),
  anonymous_songs   boolean not null default false,
  anonymous_votes   boolean not null default true,
  allow_comments    boolean not null default true,
  allow_vote_change boolean not null default true,
  collect_deadline  timestamptz,
  vote_deadline     timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists public.members (
  id               uuid primary key default gen_random_uuid(),
  band_id          uuid not null references public.bands(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 12),
  pin_hash         text not null,                       -- bcrypt 해시. 절대 밖으로 안 나감
  role             text not null default 'member' check (role in ('leader', 'member')),
  must_change_pin  boolean not null default false,      -- 방장이 PIN 초기화하면 true
  failed_attempts  int not null default 0,              -- PIN 틀린 횟수 (무차별 대입 방지)
  locked_until     timestamptz,
  created_at       timestamptz not null default now()
);
-- 이름 중복 금지를 DB가 강제 (대소문자 무시)
create unique index if not exists members_band_name_uniq
  on public.members (band_id, lower(name));

-- 로그인 세션. 토큰 원문은 브라우저만 갖고, DB엔 해시만 저장.
create table if not exists public.sessions (
  token_hash  text primary key,
  member_id   uuid not null references public.members(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists sessions_member_idx on public.sessions (member_id);

create table if not exists public.songs (
  id               uuid primary key default gen_random_uuid(),
  band_id          uuid not null references public.bands(id) on delete cascade,
  member_id        uuid not null references public.members(id) on delete cascade,
  youtube_id       text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  title            text not null check (char_length(title) between 1 and 100),
  artist           text check (artist is null or char_length(artist) <= 60),
  highlight_start  int  check (highlight_start is null or highlight_start >= 0),
  highlight_end    int,
  comment          text check (comment is null or char_length(comment) <= 200),
  selected         boolean not null default false,       -- 결과 단계에서 방장이 최종 선정
  created_at       timestamptz not null default now(),
  check (highlight_end is null or (highlight_start is not null and highlight_end > highlight_start)),
  unique (band_id, youtube_id)                           -- 같은 영상 두 번 올리기 금지
);
create index if not exists songs_band_idx on public.songs (band_id);

create table if not exists public.votes (
  id          uuid primary key default gen_random_uuid(),
  band_id     uuid not null references public.bands(id) on delete cascade,
  song_id     uuid not null references public.songs(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (song_id, member_id)                            -- 한 곡에 한 표를 DB가 강제
);
create index if not exists votes_band_idx on public.votes (band_id);


-- ---------------------------------------------------------------------
--  잠금: RLS 켜고 정책 없음 = 브라우저 직접 접근 전면 차단
-- ---------------------------------------------------------------------

alter table public.bands    enable row level security;
alter table public.members  enable row level security;
alter table public.sessions enable row level security;
alter table public.songs    enable row level security;
alter table public.votes    enable row level security;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.bands, public.members, public.sessions, public.songs, public.votes from anon, authenticated';
  end if;
end $$;


-- ---------------------------------------------------------------------
--  내부 도우미 (private 스키마 — 브라우저에서 호출 불가)
-- ---------------------------------------------------------------------

create or replace function private.hash_token(p_token text)
returns text language sql immutable
set search_path = ''
as $$ select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') $$;

-- 토큰으로 "지금 누가 부르는지" 확인. 없으면 SESSION_EXPIRED.
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
  return m;
end $$;

create or replace function private.new_session(p_member_id uuid)
returns text language plpgsql security definer
set search_path = ''
as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into public.sessions (token_hash, member_id)
  values (private.hash_token(v_token), p_member_id);
  return v_token;
end $$;

-- 헷갈리는 글자(0/O, 1/I) 뺀 6자리 초대코드
create or replace function private.new_invite_code()
returns text language plpgsql volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32글자
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.bands where invite_code = code);
  end loop;
  return code;
end $$;

create or replace function private.clean_code(p text)
returns text language sql immutable set search_path = ''
as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

create or replace function private.clean_name(p text)
returns text language sql immutable set search_path = ''
as $$ select regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g') $$;

create or replace function private.check_name_pin(p_name text, p_pin text)
returns void language plpgsql immutable set search_path = ''
as $$
begin
  if char_length(p_name) < 1 or char_length(p_name) > 12 then raise exception 'BAD_NAME'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then raise exception 'BAD_PIN'; end if;
end $$;

create or replace function private.require_leader(m public.members)
returns void language plpgsql immutable set search_path = ''
as $$
begin
  if m.role <> 'leader' then raise exception 'LEADER_ONLY'; end if;
end $$;

revoke all on all functions in schema private from public;


-- ---------------------------------------------------------------------
--  [A] 진입 — 방 만들기 / 코드 확인 / 처음 입장 / 다시 입장
-- ---------------------------------------------------------------------

-- A-3 방 생성: 밴드 + 방장 멤버 + 세션을 한 번에
create or replace function public.create_band(p_band_name text, p_leader_name text, p_pin text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_band_name text := private.clean_name(p_band_name);
  v_name      text := private.clean_name(p_leader_name);
  v_band      public.bands;
  v_member_id uuid;
begin
  if char_length(v_band_name) < 1 or char_length(v_band_name) > 30 then raise exception 'BAD_BAND_NAME'; end if;
  perform private.check_name_pin(v_name, p_pin);

  insert into public.bands (name, invite_code)
  values (v_band_name, private.new_invite_code())
  returning * into v_band;

  insert into public.members (band_id, name, pin_hash, role)
  values (v_band.id, v_name, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), 'leader')
  returning id into v_member_id;

  return jsonb_build_object(
    'ok', true,
    'token', private.new_session(v_member_id),
    'band_id', v_band.id,
    'band_name', v_band.name,
    'invite_code', v_band.invite_code
  );
end $$;

-- A-2 1단계: 초대코드가 맞는지, 어떤 밴드인지만 살짝 보기
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
    'max_members', b.max_members
  );
end $$;

-- A-2 처음 왔어요: 이름 + PIN 설정 → 새 멤버
create or replace function public.join_band(p_invite_code text, p_name text, p_pin text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := private.clean_name(p_name);
  b public.bands;
  v_member_id uuid;
begin
  perform private.check_name_pin(v_name, p_pin);

  -- 정원 검사와 동시 입장 경쟁을 막으려고 밴드 행을 잠금
  select * into b from public.bands
  where invite_code = private.clean_code(p_invite_code) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'NO_BAND'); end if;

  if exists (select 1 from public.members where band_id = b.id and lower(name) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'error', 'NAME_TAKEN');
  end if;
  if (select count(*) from public.members where band_id = b.id) >= b.max_members then
    return jsonb_build_object('ok', false, 'error', 'BAND_FULL');
  end if;

  insert into public.members (band_id, name, pin_hash, role)
  values (b.id, v_name, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), 'member')
  returning id into v_member_id;

  return jsonb_build_object(
    'ok', true,
    'token', private.new_session(v_member_id),
    'band_id', b.id,
    'band_name', b.name,
    'invite_code', b.invite_code
  );
end $$;

-- A-2 다시 들어왔어요: 코드 + 이름 + PIN 으로 같은 사람 복원
-- 틀린 PIN은 예외(raise) 대신 ok:false 로 돌려줌 → 실패 횟수 기록이 롤백되지 않게.
create or replace function public.login_member(p_invite_code text, p_name text, p_pin text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := private.clean_name(p_name);
  b public.bands;
  m public.members;
  v_fails int;
begin
  select * into b from public.bands where invite_code = private.clean_code(p_invite_code);
  if not found then return jsonb_build_object('ok', false, 'error', 'NO_BAND'); end if;

  select * into m from public.members
  where band_id = b.id and lower(name) = lower(v_name) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'NO_MEMBER'); end if;

  if m.locked_until is not null and m.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'LOCKED',
      'seconds_left', ceil(extract(epoch from m.locked_until - now()))::int);
  end if;

  if m.pin_hash <> extensions.crypt(coalesce(p_pin, ''), m.pin_hash) then
    v_fails := m.failed_attempts + 1;
    -- 5번 틀릴 때마다 잠금. 잠금 시간은 5분, 10분, 15분… 점점 길어짐
    update public.members
    set failed_attempts = v_fails,
        locked_until = case when v_fails % 5 = 0
                            then now() + make_interval(mins => 5 * (v_fails / 5))
                            else locked_until end
    where id = m.id;
    return jsonb_build_object('ok', false, 'error',
      case when v_fails % 5 = 0 then 'LOCKED' else 'WRONG_PIN' end,
      'tries_left', 5 - (v_fails % 5),
      'seconds_left', case when v_fails % 5 = 0 then 300 * (v_fails / 5) else null end);
  end if;

  update public.members set failed_attempts = 0, locked_until = null where id = m.id;

  return jsonb_build_object(
    'ok', true,
    'token', private.new_session(m.id),
    'band_id', b.id,
    'band_name', b.name,
    'invite_code', b.invite_code
  );
end $$;

create or replace function public.logout(p_token text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.sessions where token_hash = private.hash_token(p_token);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.change_pin(p_token text, p_new_pin text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare me public.members := private.auth(p_token);
begin
  if coalesce(p_new_pin, '') !~ '^[0-9]{4}$' then raise exception 'BAD_PIN'; end if;
  update public.members
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)),
      must_change_pin = false
  where id = me.id;
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
--  [C] 공용 화면 — 지금 상태 한 번에 가져오기
--  "누가 보느냐"에 따라 내려주는 내용이 달라짐. 여기가 익명·공정성의 본체.
-- ---------------------------------------------------------------------

create or replace function public.get_state(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  b  public.bands;
begin
  select * into b from public.bands where id = me.band_id;

  return jsonb_build_object(
    'me', jsonb_build_object(
      'id', me.id, 'name', me.name, 'role', me.role,
      'must_change_pin', me.must_change_pin),

    'band', jsonb_build_object(
      'id', b.id, 'name', b.name, 'invite_code', b.invite_code, 'status', b.status,
      'max_members', b.max_members,
      'songs_per_member', b.songs_per_member, 'votes_per_member', b.votes_per_member,
      'anonymous_songs', b.anonymous_songs, 'anonymous_votes', b.anonymous_votes,
      'allow_comments', b.allow_comments, 'allow_vote_change', b.allow_vote_change,
      'collect_deadline', b.collect_deadline, 'vote_deadline', b.vote_deadline),

    -- 참여 현황(곡 몇 개 냈는지, 투표 했는지)만. "뭘 찍었는지"는 없음.
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', m.id, 'name', m.name, 'role', m.role,
          'song_count', (select count(*) from public.songs s where s.member_id = m.id),
          'voted', exists (select 1 from public.votes v where v.member_id = m.id))
        order by (m.role = 'leader') desc, m.created_at)
      from public.members m where m.band_id = b.id), '[]'::jsonb),

    -- 익명 곡이면 남의 곡 작성자 이름을 아예 안 보냄
    'songs', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'youtube_id', s.youtube_id, 'title', s.title, 'artist', s.artist,
          'highlight_start', s.highlight_start, 'highlight_end', s.highlight_end,
          'comment', case when b.allow_comments then s.comment end,
          'selected', s.selected, 'created_at', s.created_at,
          'mine', s.member_id = me.id,
          'submitter', case when s.member_id = me.id or not b.anonymous_songs
                            then (select name from public.members where id = s.member_id) end)
        order by s.created_at)
      from public.songs s where s.band_id = b.id), '[]'::jsonb),

    -- 내 투표만
    'my_votes', coalesce((
      select jsonb_agg(v.song_id) from public.votes v where v.member_id = me.id), '[]'::jsonb),

    -- 득표수는 '확정' 단계에서만, 방장 포함 모두에게 동시에 공개
    'results', case when b.status = 'done' then coalesce((
      select jsonb_agg(r order by (r->>'votes')::int desc, r->>'created_at')
      from (
        select jsonb_build_object(
          'song_id', s.id,
          'votes', (select count(*) from public.votes v where v.song_id = s.id),
          'created_at', s.created_at,
          'voters', case when b.anonymous_votes then null else coalesce((
              select jsonb_agg(m.name order by m.name)
              from public.votes v join public.members m on m.id = v.member_id
              where v.song_id = s.id), '[]'::jsonb) end) as r
        from public.songs s where s.band_id = b.id
      ) t), '[]'::jsonb) end
  );
end $$;


-- ---------------------------------------------------------------------
--  [B] 방장 설정 — 마감(확정) 전까지 수정 가능.
--  단, 이미 시작된 약속을 깨는 변경은 잠금:
--    · 곡 익명 여부: 곡 수합 시작 후 변경 불가
--    · 투표 익명/인당 표 수/표 수정 허용: 투표 시작 후 변경 불가
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
  if b.status = 'done' then raise exception 'BAND_DONE'; end if;

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

  if b.status <> 'setup' and n.anonymous_songs is distinct from b.anonymous_songs then
    raise exception 'LOCKED_ANON_SONGS';
  end if;
  if b.status = 'voting' and (
       n.anonymous_votes   is distinct from b.anonymous_votes or
       n.votes_per_member  is distinct from b.votes_per_member or
       n.allow_vote_change is distinct from b.allow_vote_change) then
    raise exception 'LOCKED_VOTE_RULES';
  end if;

  if char_length(n.name) not between 1 and 30 then raise exception 'BAD_BAND_NAME'; end if;
  if n.max_members not between 2 and 30
     or n.songs_per_member not between 1 and 10
     or n.votes_per_member not between 1 and 20 then
    raise exception 'BAD_SETTINGS';
  end if;

  select count(*) into cnt from public.members where band_id = b.id;
  if n.max_members < cnt then raise exception 'MAX_BELOW_CURRENT'; end if;

  update public.bands set
    name = n.name, max_members = n.max_members,
    songs_per_member = n.songs_per_member, votes_per_member = n.votes_per_member,
    anonymous_songs = n.anonymous_songs, anonymous_votes = n.anonymous_votes,
    allow_comments = n.allow_comments, allow_vote_change = n.allow_vote_change,
    collect_deadline = n.collect_deadline, vote_deadline = n.vote_deadline
  where id = b.id;

  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
--  [D-2] 진행 제어 — 단계 전환은 오직 방장 수동 버튼
--  p_from: 방장 화면이 "지금 이 단계"라고 알고 있는 값. 다르면 STALE_STATUS
--  (버튼 두 번 눌러서 두 단계 넘어가는 사고 방지)
-- ---------------------------------------------------------------------

create or replace function public.advance_status(p_token text, p_from text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  b  public.bands;
  v_next text;
begin
  perform private.require_leader(me);
  select * into b from public.bands where id = me.band_id for update;
  if b.status <> p_from then raise exception 'STALE_STATUS'; end if;

  v_next := case b.status
    when 'setup' then 'collecting'
    when 'collecting' then 'voting'
    when 'voting' then 'done' end;
  if v_next is null then raise exception 'BAND_DONE'; end if;

  if v_next = 'voting' and not exists (select 1 from public.songs where band_id = b.id) then
    raise exception 'NO_SONGS';
  end if;

  update public.bands set status = v_next where id = b.id;
  return jsonb_build_object('ok', true, 'status', v_next);
end $$;


-- ---------------------------------------------------------------------
--  [C-1] 곡 수합 — 올리기 / 교체(수정) / 취소
-- ---------------------------------------------------------------------

create or replace function public.save_song(
  p_token text, p_song_id uuid, p_youtube_id text, p_title text, p_artist text,
  p_highlight_start int, p_highlight_end int, p_comment text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  b  public.bands;
  v_title   text := private.clean_name(p_title);
  v_artist  text := nullif(private.clean_name(p_artist), '');
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_id uuid;
begin
  select * into b from public.bands where id = me.band_id;
  if b.status <> 'collecting' then raise exception 'NOT_COLLECTING'; end if;

  if coalesce(p_youtube_id, '') !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'BAD_YOUTUBE'; end if;
  if char_length(v_title) < 1 or char_length(v_title) > 100 then raise exception 'BAD_TITLE'; end if;
  if p_highlight_end is not null and (p_highlight_start is null or p_highlight_end <= p_highlight_start) then
    raise exception 'BAD_HIGHLIGHT';
  end if;
  if not b.allow_comments then v_comment := null; end if;

  -- 같은 사람이 동시에 두 번 올려서 개수 제한을 넘는 걸 막으려고 내 행을 잠금
  perform 1 from public.members where id = me.id for update;

  if exists (select 1 from public.songs where band_id = b.id and youtube_id = p_youtube_id
             and id is distinct from p_song_id) then
    raise exception 'DUPLICATE_SONG';
  end if;

  if p_song_id is null then
    if (select count(*) from public.songs where member_id = me.id) >= b.songs_per_member then
      raise exception 'SONG_LIMIT';
    end if;
    insert into public.songs (band_id, member_id, youtube_id, title, artist,
                              highlight_start, highlight_end, comment)
    values (b.id, me.id, p_youtube_id, v_title, v_artist,
            p_highlight_start, p_highlight_end, v_comment)
    returning id into v_id;
  else
    update public.songs set
      youtube_id = p_youtube_id, title = v_title, artist = v_artist,
      highlight_start = p_highlight_start, highlight_end = p_highlight_end,
      comment = v_comment
    where id = p_song_id and member_id = me.id
    returning id into v_id;
    if v_id is null then raise exception 'NOT_YOURS'; end if;
  end if;

  return jsonb_build_object('ok', true, 'song_id', v_id);
end $$;

create or replace function public.delete_song(p_token text, p_song_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  v_status text;
begin
  select status into v_status from public.bands where id = me.band_id;
  if v_status <> 'collecting' then raise exception 'NOT_COLLECTING'; end if;
  delete from public.songs where id = p_song_id and member_id = me.id;
  if not found then raise exception 'NOT_YOURS'; end if;
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
--  [C-2] 투표 (다수결) — 고른 곡 목록을 통째로 제출(덮어쓰기)
-- ---------------------------------------------------------------------

create or replace function public.submit_votes(p_token text, p_song_ids uuid[])
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  b  public.bands;
  v_ids uuid[];
begin
  select * into b from public.bands where id = me.band_id;
  if b.status <> 'voting' then raise exception 'NOT_VOTING'; end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_song_ids) x;
  if cardinality(v_ids) = 0 then raise exception 'NO_VOTES'; end if;
  if cardinality(v_ids) > b.votes_per_member then raise exception 'TOO_MANY_VOTES'; end if;
  if (select count(*) from public.songs where band_id = b.id and id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'BAD_SONG';
  end if;

  perform 1 from public.members where id = me.id for update;

  if not b.allow_vote_change and exists (select 1 from public.votes where member_id = me.id) then
    raise exception 'VOTE_LOCKED';
  end if;

  delete from public.votes where member_id = me.id;
  insert into public.votes (band_id, song_id, member_id)
  select b.id, x, me.id from unnest(v_ids) x;

  return jsonb_build_object('ok', true, 'count', cardinality(v_ids));
end $$;


-- ---------------------------------------------------------------------
--  [C-3] 결과·확정 — 방장이 최종 곡에 "선정" 표시
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
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
--  [D-1] 멤버 관리 — PIN 분실 멤버 초기화
--  임시 PIN을 만들어 방장에게 한 번만 보여줌 → 방장이 카톡으로 전달.
--  그 멤버의 기존 로그인은 전부 끊김(혹시 누가 사칭 중이었다면 쫓겨남).
-- ---------------------------------------------------------------------

create or replace function public.reset_pin(p_token text, p_member_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.auth(p_token);
  v_rand bytea := extensions.gen_random_bytes(2);
  v_pin  text  := lpad(((get_byte(v_rand, 0) * 256 + get_byte(v_rand, 1)) % 10000)::text, 4, '0');
begin
  perform private.require_leader(me);
  if p_member_id = me.id then raise exception 'USE_CHANGE_PIN'; end if;

  update public.members set
    pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 8)),
    must_change_pin = true, failed_attempts = 0, locked_until = null
  where id = p_member_id and band_id = me.band_id;
  if not found then raise exception 'NO_MEMBER'; end if;

  delete from public.sessions where member_id = p_member_id;
  return jsonb_build_object('ok', true, 'temp_pin', v_pin);
end $$;


-- ---------------------------------------------------------------------
--  권한: 브라우저(anon)는 아래 함수만 실행 가능
-- ---------------------------------------------------------------------

do $$
declare
  fn text;
  fns text[] := array[
    'public.create_band(text, text, text)',
    'public.peek_band(text)',
    'public.join_band(text, text, text)',
    'public.login_member(text, text, text)',
    'public.logout(text)',
    'public.change_pin(text, text)',
    'public.get_state(text)',
    'public.update_settings(text, jsonb)',
    'public.advance_status(text, text)',
    'public.save_song(text, uuid, text, text, text, int, int, text)',
    'public.delete_song(text, uuid)',
    'public.submit_votes(text, uuid[])',
    'public.set_selected(text, uuid, boolean)',
    'public.reset_pin(text, uuid)'
  ];
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant usage on schema public to anon, authenticated;
  end if;
  foreach fn in array fns loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function %s to anon, authenticated', fn);
    end if;
  end loop;
end $$;

-- PostgREST(Supabase API)가 새 함수를 바로 알아보게
notify pgrst, 'reload schema';
