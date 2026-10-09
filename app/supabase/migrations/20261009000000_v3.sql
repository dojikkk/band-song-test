-- =====================================================================
--  V3 마이그레이션 — 이미 적용된 init·v2 파일은 그대로 두고, 바뀐 것만 추가
--
--  1) 합주 일정 기능 제거 (가능 시간 표·합주 확정). 파트 배분은 그대로
--  2) "유튜브 링크 사용" 방 옵션 (youtube_enabled)
--     · 켜짐: 지금처럼 유튜브 링크 + 하이라이트 + 미니 플레이어
--     · 꺼짐: 곡을 "제목 + 아티스트" 텍스트로만. 링크·하이라이트 칸은 비워 둠
--     · 곡 수합이 시작되면 고정 (곡마다 형식이 섞이지 않게)
--  3) "방장 자유 추가 모드" 방 옵션 (leader_unlimited)
--     · 방장은 인당 곡 개수 제한 없이 올릴 수 있음
--     · 켜져 있으면 곡 익명 올리기는 강제로 꺼짐 (방장 곡만 많아서 익명이어도 티가 남)
--  4) 인당 곡 개수 0 허용 → 멤버는 듣기·투표만, 후보곡은 방장이 전부 올림
--  5) 인당 0곡인데 방장 자유 추가 모드도 꺼져 있으면 아무도 곡을 못 올림 → DB가 막음
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. 합주 일정 기능 제거 (함수 먼저, 그다음 테이블)
-- ---------------------------------------------------------------------

drop function if exists public.create_schedule(text, text, date, date, int, int);
drop function if exists public.delete_schedule(text);
drop function if exists public.set_availability(text, jsonb);
drop function if exists public.add_rehearsal(text, date, int, int, text, text);
drop function if exists public.delete_rehearsal(text, uuid);

drop table if exists public.availability;
drop table if exists public.availability_responses;
drop table if exists public.schedule_polls;
drop table if exists public.rehearsals;


-- ---------------------------------------------------------------------
--  2. bands — 새 옵션 + 규칙(CHECK)
-- ---------------------------------------------------------------------

alter table public.bands
  add column if not exists youtube_enabled  boolean not null default true,   -- 기존 방은 지금처럼 유튜브 사용
  add column if not exists leader_unlimited boolean not null default false;

-- 인당 곡 개수: 1~10 → 0~10. 처음(init)에 이름 없이 만든 CHECK라 정의로 찾아서 지움
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.bands'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%songs_per_member%'
  loop
    execute format('alter table public.bands drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.bands
  -- 0이면 멤버는 곡을 못 올림
  add constraint bands_songs_per_member_chk  check (songs_per_member >= 0 and songs_per_member <= 10),
  -- 방장 자유 추가 모드면 곡은 기명만
  add constraint bands_unlimited_named_chk   check (not leader_unlimited or not anonymous_songs),
  -- 인당 0곡이면 방장 자유 추가 모드가 켜져 있어야 함 (아니면 아무도 못 올림)
  add constraint bands_someone_can_add_chk   check (songs_per_member > 0 or leader_unlimited),
  -- 유튜브를 안 쓰면 '들어본 곡만 투표'는 켤 수 없음 (들을 플레이어가 없음)
  add constraint bands_listen_needs_youtube_chk check (youtube_enabled or not require_listen);


-- ---------------------------------------------------------------------
--  3. songs — 유튜브 없는 곡 허용 (제목 + 아티스트)
-- ---------------------------------------------------------------------

alter table public.songs alter column youtube_id drop not null;   -- 형식 CHECK는 그대로 (비어 있으면 통과)

-- artist 칸은 처음부터 있음. 혹시 없는 DB를 위해서만
alter table public.songs
  add column if not exists artist text check (artist is null or char_length(artist) <= 60);

-- highlight_start / highlight_end 는 원래 비워 둘 수 있음.
-- 단, 하이라이트는 유튜브 영상이 있을 때만 의미가 있으니 영상 없는 곡엔 못 넣게
do $$ begin
  alter table public.songs add constraint songs_highlight_needs_video_chk
    check (youtube_id is not null or (highlight_start is null and highlight_end is null));
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
--  4. [C] 상태 — 새 옵션 추가, 합주 일정 빼기
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
      from public.song_slots sl where sl.band_id = b.id), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;


-- ---------------------------------------------------------------------
--  5. [B] 설정 — 새 옵션 + 규칙
--    · 유튜브 사용: 설정중에만 바꿀 수 있음
--    · 방장 자유 추가 모드: 켜면 곡 익명 올리기 자동으로 꺼짐(바꿀 수 없음)
--      단, 이미 익명으로 곡을 받는 중(수합 시작 후)이면 켤 수 없음 — 익명 약속이 깨지니까
--    · 인당 0곡이면 방장 자유 추가 모드가 켜져 있어야 함
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
  if p_patch ? 'youtube_enabled'   then n.youtube_enabled := coalesce((p_patch->>'youtube_enabled')::boolean, b.youtube_enabled); end if;
  if p_patch ? 'leader_unlimited'  then n.leader_unlimited := coalesce((p_patch->>'leader_unlimited')::boolean, b.leader_unlimited); end if;
  if p_patch ? 'lineup' then
    n.lineup := private.clean_list(array(select jsonb_array_elements_text(p_patch->'lineup')), 12);
  end if;

  -- 방장 자유 추가 모드 → 곡은 기명만
  if n.leader_unlimited then
    if p_patch ? 'anonymous_songs' and n.anonymous_songs then raise exception 'UNLIMITED_NAMED_ONLY'; end if;
    -- 이미 익명으로 곡을 받고 있는 방에서 켜면 올린 사람이 드러남 → 막음
    if not b.leader_unlimited and b.anonymous_songs and b.status <> 'setup' then
      raise exception 'UNLIMITED_ANON_LOCKED';
    end if;
    n.anonymous_songs := false;
  end if;

  -- 유튜브를 안 쓰면 들을 플레이어가 없으니 '들어본 곡만 투표'도 끔
  if not n.youtube_enabled then n.require_listen := false; end if;

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
       n.require_listen    is distinct from b.require_listen or
       n.youtube_enabled   is distinct from b.youtube_enabled or
       n.leader_unlimited  is distinct from b.leader_unlimited) then
    raise exception 'BAND_DONE';
  end if;

  if b.status <> 'setup' and n.youtube_enabled is distinct from b.youtube_enabled then
    raise exception 'LOCKED_YOUTUBE';
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
     or n.songs_per_member not between 0 and 10
     or n.votes_per_member not between 1 and 20
     or n.vote_method not in ('majority', 'borda')
     or cardinality(n.lineup) > 12 then
    raise exception 'BAD_SETTINGS';
  end if;

  -- 인당 0곡 + 방장 자유 추가 모드 꺼짐 = 아무도 곡을 못 올림
  if n.songs_per_member = 0 and not n.leader_unlimited then
    raise exception 'ZERO_SONGS_NEEDS_UNLIMITED';
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
    join_approval = n.join_approval, require_listen = n.require_listen,
    youtube_enabled = n.youtube_enabled, leader_unlimited = n.leader_unlimited,
    lineup = n.lineup
  where id = b.id;

  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
--  6. [C-1] 곡 올리기 — 유튜브 없는 곡 + 방장 자유 추가 + 인당 0곡
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
  v_yt      text := nullif(btrim(coalesce(p_youtube_id, '')), '');
  v_hs      int  := p_highlight_start;
  v_he      int  := p_highlight_end;
  v_id uuid;
begin
  select * into b from public.bands where id = me.band_id;
  if b.status <> 'collecting' then raise exception 'NOT_COLLECTING'; end if;

  if b.youtube_enabled then
    if coalesce(v_yt, '') !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'BAD_YOUTUBE'; end if;
    if (v_hs is not null and v_hs < 0)
       or (v_he is not null and (v_hs is null or v_he <= v_hs)) then
      raise exception 'BAD_HIGHLIGHT';
    end if;
  else
    -- 유튜브를 안 쓰는 방: 제목 + 아티스트만. 링크·하이라이트가 와도 버림
    v_yt := null; v_hs := null; v_he := null;
    if v_artist is null then raise exception 'NEED_ARTIST'; end if;
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 100 then raise exception 'BAD_TITLE'; end if;
  if v_artist is not null and char_length(v_artist) > 60 then raise exception 'BAD_ARTIST'; end if;
  if not b.allow_comments then v_comment := null; end if;
  if v_comment is not null and char_length(v_comment) > 200 then v_comment := left(v_comment, 200); end if;

  -- 같은 사람이 동시에 두 번 올려서 개수 제한을 넘는 걸 막으려고 내 행을 잠금
  perform 1 from public.members where id = me.id for update;

  -- 같은 곡 두 번 금지: 유튜브면 같은 영상, 텍스트면 같은 제목+아티스트(대소문자 무시)
  if v_yt is not null and exists (
       select 1 from public.songs where band_id = b.id and youtube_id = v_yt
       and id is distinct from p_song_id) then
    raise exception 'DUPLICATE_SONG';
  end if;
  if v_yt is null and exists (
       select 1 from public.songs where band_id = b.id and youtube_id is null
       and lower(title) = lower(v_title) and lower(coalesce(artist, '')) = lower(coalesce(v_artist, ''))
       and id is distinct from p_song_id) then
    raise exception 'DUPLICATE_TITLE';
  end if;

  if p_song_id is null then
    -- 방장 자유 추가 모드면 방장은 개수 제한 없음
    if not (b.leader_unlimited and me.role = 'leader')
       and (select count(*) from public.songs where member_id = me.id) >= b.songs_per_member then
      if b.songs_per_member = 0 then raise exception 'LEADER_ADDS_ONLY'; end if;
      raise exception 'SONG_LIMIT';
    end if;
    insert into public.songs (band_id, member_id, youtube_id, title, artist,
                              highlight_start, highlight_end, comment)
    values (b.id, me.id, v_yt, v_title, v_artist, v_hs, v_he, v_comment)
    returning id into v_id;
  else
    update public.songs set
      youtube_id = v_yt, title = v_title, artist = v_artist,
      highlight_start = v_hs, highlight_end = v_he, comment = v_comment,
      -- 영상이 바뀌면 예전 영상 기준으로 찾은 스트리밍 링크는 버림
      links = case when youtube_id is not distinct from v_yt then links else '{}'::jsonb end
    where id = p_song_id and member_id = me.id
    returning id into v_id;
    if v_id is null then raise exception 'NOT_YOURS'; end if;
  end if;

  return jsonb_build_object('ok', true, 'song_id', v_id);
end $$;


-- ---------------------------------------------------------------------
--  7. 권한 다시 확인 (바꾼 함수도 브라우저에서 부를 수 있게)
-- ---------------------------------------------------------------------

do $$
declare
  fn text;
  fns text[] := array[
    'public.get_state(text)',
    'public.update_settings(text, jsonb)',
    'public.save_song(text, uuid, text, text, text, int, int, text)'
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
