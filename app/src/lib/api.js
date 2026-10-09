// DB 함수(RPC) 호출을 한곳에 모아둔 파일.
// 화면 코드는 supabase를 직접 안 부르고 여기 함수만 씀 → 나중에 바꿀 곳이 한 군데.
import { supabase } from './supabase';

// DB가 돌려주는 에러 코드 → 사람이 읽을 문장
const MESSAGES = {
  NO_BAND: '그런 참여코드는 없어요. 코드를 다시 확인해 주세요.',
  NAME_TAKEN: '이미 있는 이름이에요. 다른 이름을 써 주세요. 전에 들어왔었다면 "다시 들어왔어요"를 눌러요.',
  NO_MEMBER: '이 방에 그 이름은 없어요. 처음이라면 "처음 왔어요"를 눌러요.',
  BAND_FULL: '방 인원이 다 찼어요. 방장에게 인원수를 늘려 달라고 해 주세요.',
  BAD_NAME: '이름은 1~12글자로 써 주세요.',
  BAD_BAND_NAME: '밴드 이름은 1~30글자로 써 주세요.',
  BAD_PIN: 'PIN은 숫자 4자리예요.',
  SESSION_EXPIRED: '로그인이 풀렸어요. 코드·이름·PIN으로 다시 들어와 주세요.',
  LEADER_ONLY: '방장만 할 수 있어요.',
  BAND_DONE: '이미 확정된 방이라 바꿀 수 없어요.',
  BAD_SETTINGS: '설정 값이 범위를 벗어났어요.',
  MAX_BELOW_CURRENT: '지금 들어온 사람보다 인원수를 적게 할 수는 없어요.',
  LOCKED_ANON_SONGS: '곡 익명 여부는 곡 수합을 시작한 뒤엔 바꿀 수 없어요.',
  LOCKED_VOTE_RULES: '투표가 시작돼서 투표 규칙은 바꿀 수 없어요.',
  STALE_STATUS: '그새 단계가 바뀌었어요. 화면을 새로 불러올게요.',
  NO_SONGS: '올라온 곡이 하나도 없어서 투표를 시작할 수 없어요.',
  NOT_COLLECTING: '지금은 곡 수합 단계가 아니에요.',
  BAD_YOUTUBE: '유튜브 링크를 인식하지 못했어요.',
  BAD_TITLE: '곡 제목을 1~100글자로 써 주세요.',
  BAD_HIGHLIGHT: '하이라이트 끝이 시작보다 뒤여야 해요.',
  DUPLICATE_SONG: '이미 누가 올린 영상이에요. 다른 곡을 골라 주세요.',
  SONG_LIMIT: '올릴 수 있는 곡 수를 다 채웠어요. 기존 곡을 교체해 주세요.',
  NOT_YOURS: '내가 올린 곡만 바꾸거나 취소할 수 있어요.',
  NOT_VOTING: '지금은 투표 단계가 아니에요.',
  NO_VOTES: '최소 한 곡은 골라 주세요.',
  TOO_MANY_VOTES: '고를 수 있는 곡 수를 넘었어요.',
  BAD_SONG: '없는 곡이에요. 화면을 새로 불러올게요.',
  VOTE_LOCKED: '이 방은 투표 후 수정이 꺼져 있어요.',
  NOT_DONE: '투표가 마감된 뒤에 할 수 있어요.',
  USE_CHANGE_PIN: '내 PIN은 내 메뉴의 "PIN 바꾸기"에서 바꿔요.',
  // V2
  PENDING_APPROVAL: '방장이 아직 입장을 승인하지 않았어요.',
  GROUPS_LOCKED: '투표가 시작돼서 그룹은 더 바꿀 수 없어요.',
  BAD_GROUP_NAME: '그룹 이름은 1~20글자로 써 주세요.',
  GROUP_LIMIT: '그룹은 10개까지 만들 수 있어요.',
  GROUP_NAME_TAKEN: '이미 있는 그룹 이름이에요.',
  BAD_GROUP: '없는 그룹이에요. 화면을 새로 불러올게요.',
  MULTI_GROUP_OFF: '한 곡은 그룹 하나에만 넣을 수 있어요. (설정에서 "여러 그룹에 넣기"를 켜면 가능)',
  MULTI_GROUP_IN_USE: '두 그룹 이상에 들어간 곡이 있어서 끌 수 없어요. 먼저 한 그룹으로 정리해 주세요.',
  NO_GROUPS: '그룹을 하나 이상 만들어야 투표를 시작할 수 있어요.',
  UNGROUPED_SONGS: '아직 그룹에 안 넣은 곡이 있어요. 모든 곡을 그룹에 넣어야 투표를 시작할 수 있어요.',
  INCOMPLETE_RANKING: '그룹 안의 곡을 전부 순위 매겨야 제출할 수 있어요.',
  CANNOT_REMOVE_LEADER: '방장은 내보낼 수 없어요.',
  KICK_LOCKED: '투표 중에는 곡을 올린 멤버를 내보낼 수 없어요. (다른 사람 순위표가 깨져서)',
  TOO_MANY_PARTS: '파트는 6개까지 고를 수 있어요.',
  BAD_SLOT_NAME: '파트 이름은 1~12글자로 써 주세요.',
  SLOT_LIMIT: '한 곡에 파트는 12개까지예요.',
  DUPLICATE_SLOT: '이 곡에 이미 있는 파트예요.',
  BAD_SLOT: '없는 파트예요. 화면을 새로 불러올게요.',
  // V3
  LOCKED_YOUTUBE: '유튜브 링크 사용 여부는 곡 수합을 시작한 뒤엔 바꿀 수 없어요.',
  UNLIMITED_NAMED_ONLY: '방장 자유 추가 모드에서는 곡을 익명으로 올릴 수 없어요.',
  UNLIMITED_ANON_LOCKED: '곡을 익명으로 받는 중이라 방장 자유 추가 모드를 켤 수 없어요. (켜면 올린 사람이 드러나요)',
  ZERO_SONGS_NEEDS_UNLIMITED: '인당 0곡이면 방장 자유 추가 모드를 켜야 해요.',
  LEADER_ADDS_ONLY: '이 방은 방장이 후보곡을 올려요. 멤버는 듣고 투표만 하면 돼요.',
  NEED_ARTIST: '아티스트를 적어 주세요.',
  BAD_ARTIST: '아티스트는 60글자까지 쓸 수 있어요.',
  DUPLICATE_TITLE: '같은 제목·아티스트의 곡이 이미 올라와 있어요.',
};

export class AppError extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
  get text() {
    if (this.code === 'WRONG_PIN') {
      return `PIN이 달라요. ${this.extra.tries_left}번 더 틀리면 잠시 잠겨요.`;
    }
    if (this.code === 'LOCKED') {
      const min = Math.max(1, Math.ceil((this.extra.seconds_left || 60) / 60));
      return `PIN을 여러 번 틀려서 ${min}분 동안 잠겼어요. 기억이 안 나면 방장에게 PIN 초기화를 부탁해요.`;
    }
    if (this.code === 'NETWORK') {
      return '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.';
    }
    return MESSAGES[this.code] || `문제가 생겼어요 (${this.code})`;
  }
}

async function rpc(fn, args) {
  let res;
  try {
    res = await supabase.rpc(fn, args);
  } catch {
    throw new AppError('NETWORK');
  }
  const { data, error } = res;
  if (error) {
    // DB 함수의 raise exception 'CODE' 는 error.message 로 옴
    const code = /^[A-Z_]+$/.test(error.message || '') ? error.message : null;
    if (code) throw new AppError(code);
    if (!error.code || error.message?.includes('Failed to fetch')) throw new AppError('NETWORK');
    throw new AppError(error.message || 'UNKNOWN');
  }
  if (data && data.ok === false) throw new AppError(data.error, data);
  return data;
}

// [A] 진입
export const createBand = (bandName, leaderName, pin) =>
  rpc('create_band', { p_band_name: bandName, p_leader_name: leaderName, p_pin: pin });
export const peekBand = (code) => rpc('peek_band', { p_invite_code: code });
export const joinBand = (code, name, pin) =>
  rpc('join_band', { p_invite_code: code, p_name: name, p_pin: pin });
export const loginMember = (code, name, pin) =>
  rpc('login_member', { p_invite_code: code, p_name: name, p_pin: pin });
export const logout = (token) => rpc('logout', { p_token: token });
export const changePin = (token, pin) => rpc('change_pin', { p_token: token, p_new_pin: pin });

// [C] 상태
export const getState = (token) => rpc('get_state', { p_token: token });

// [B] 설정
export const updateSettings = (token, patch) =>
  rpc('update_settings', { p_token: token, p_patch: patch });

// [D-2] 진행
export const advanceStatus = (token, from) =>
  rpc('advance_status', { p_token: token, p_from: from });

// [C-1] 곡
export const saveSong = (token, song) =>
  rpc('save_song', {
    p_token: token,
    p_song_id: song.id ?? null,
    p_youtube_id: song.youtube_id,
    p_title: song.title,
    p_artist: song.artist ?? null,
    p_highlight_start: song.highlight_start ?? null,
    p_highlight_end: song.highlight_end ?? null,
    p_comment: song.comment ?? null,
  });
export const deleteSong = (token, songId) =>
  rpc('delete_song', { p_token: token, p_song_id: songId });

// [C-2] 투표 — 그룹 하나씩 제출. 점수제면 songIds 순서가 곧 순위(1등이 맨 앞)
export const submitBallot = (token, groupId, songIds) =>
  rpc('submit_ballot', { p_token: token, p_group_id: groupId, p_song_ids: songIds });

// 그룹 나누기 (방장)
export const createGroup = (token, name) => rpc('create_group', { p_token: token, p_name: name });
export const renameGroup = (token, groupId, name) =>
  rpc('rename_group', { p_token: token, p_group_id: groupId, p_name: name });
export const deleteGroup = (token, groupId) => rpc('delete_group', { p_token: token, p_group_id: groupId });
export const setSongGroups = (token, songId, groupIds) =>
  rpc('set_song_groups', { p_token: token, p_song_id: songId, p_group_ids: groupIds });

// 스트리밍 링크
export const setSongLinks = (token, songId, links) =>
  rpc('set_song_links', { p_token: token, p_song_id: songId, p_links: links });

// [C-3] 결과
export const setSelected = (token, songId, selected) =>
  rpc('set_selected', { p_token: token, p_song_id: songId, p_selected: selected });

// [D-1] 멤버
export const resetPin = (token, memberId) =>
  rpc('reset_pin', { p_token: token, p_member_id: memberId });
export const approveMember = (token, memberId) =>
  rpc('approve_member', { p_token: token, p_member_id: memberId });
export const removeMember = (token, memberId) =>
  rpc('remove_member', { p_token: token, p_member_id: memberId });
export const regenerateInviteCode = (token) => rpc('regenerate_invite_code', { p_token: token });
export const setMyParts = (token, parts) => rpc('set_my_parts', { p_token: token, p_parts: parts });

// 파트 배분
export const addSlot = (token, songId, name) => rpc('add_slot', { p_token: token, p_song_id: songId, p_name: name });
export const removeSlot = (token, slotId) => rpc('remove_slot', { p_token: token, p_slot_id: slotId });
export const assignSlot = (token, slotId, memberId) =>
  rpc('assign_slot', { p_token: token, p_slot_id: slotId, p_member_id: memberId });
export const toggleSlotRequest = (token, slotId) =>
  rpc('toggle_slot_request', { p_token: token, p_slot_id: slotId });

export function errorText(e) {
  return e instanceof AppError ? e.text : '문제가 생겼어요. 잠시 뒤 다시 해 주세요.';
}
