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

// [C-2] 투표
export const submitVotes = (token, songIds) =>
  rpc('submit_votes', { p_token: token, p_song_ids: songIds });

// [C-3] 결과
export const setSelected = (token, songId, selected) =>
  rpc('set_selected', { p_token: token, p_song_id: songId, p_selected: selected });

// [D-1] 멤버
export const resetPin = (token, memberId) =>
  rpc('reset_pin', { p_token: token, p_member_id: memberId });

export function errorText(e) {
  return e instanceof AppError ? e.text : '문제가 생겼어요. 잠시 뒤 다시 해 주세요.';
}
