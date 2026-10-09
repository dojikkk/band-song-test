// get_state 결과에서 화면이 자주 꺼내 쓰는 값들

// 곡 id → 그 곡이 들어 있는 그룹 목록
export function groupsBySong(state) {
  const map = new Map();
  for (const g of state.groups || []) {
    for (const id of g.song_ids) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(g);
    }
  }
  return map;
}

// 그룹 안의 곡 객체들 (곡 올린 순서 유지)
export function songsInGroup(state, group) {
  const set = new Set(group.song_ids);
  return state.songs.filter((s) => set.has(s.id));
}

// 내 표를 그룹별로: { [groupId]: [songId...] } — 점수제는 높은 점수(=높은 순위)부터
export function myBallots(state) {
  const by = {};
  for (const v of state.my_votes || []) {
    (by[v.group_id] ||= []).push(v);
  }
  const out = {};
  for (const [gid, list] of Object.entries(by)) {
    out[gid] = list.sort((a, b) => b.points - a.points).map((v) => v.song_id);
  }
  return out;
}

// 그룹 탭에 보여줄 이름: 그룹을 안 쓰는 방이면 그룹이 '전체' 하나뿐
export function showGroupTabs(state) {
  return (state.groups || []).length > 1 || state.band.use_groups;
}

export function memberName(state, id) {
  return state.members.find((m) => m.id === id)?.name ?? '나간 멤버';
}

export const activeMembers = (state) => state.members.filter((m) => m.status !== 'pending');

// 투표 제한: 이 사람이 투표에서 빠진 그룹 id 모음
export function blockedGroupIds(state, memberId) {
  return new Set((state.vote_blocks || []).filter((b) => b.member_id === memberId).map((b) => b.group_id));
}

// 이 사람이 투표할 수 있는 그룹 수 (서버가 안 주면 = 전체 그룹 수)
export const voteGroupCount = (state, m) => m.vote_groups ?? (state.groups || []).length;

// 투표 현황에 셀 사람: 투표할 그룹이 하나라도 있는 멤버
export const eligibleVoters = (state) => activeMembers(state).filter((m) => voteGroupCount(state, m) > 0);
