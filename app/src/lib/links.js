// 크로스플랫폼 링크 — 같은 곡을 Spotify·Apple Music·멜론 등에서 열기
//
// 1) 곡을 올릴 때 Odesli(song.link) 공개 API로 유튜브 링크를 넣으면
//    Spotify·Apple Music의 "정확한" 곡 링크를 찾아 DB에 저장 (실패해도 괜찮음)
// 2) 저장된 링크가 없으면 각 서비스의 "검색" 링크로 대신 연결 (항상 동작)

const PLATFORMS = [
  { key: 'spotify', label: 'Spotify', search: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}` },
  { key: 'apple', label: 'Apple Music', search: (q) => `https://music.apple.com/kr/search?term=${encodeURIComponent(q)}` },
  { key: 'melon', label: '멜론', search: (q) => `https://www.melon.com/search/total/index.htm?q=${encodeURIComponent(q)}` },
  {
    key: 'youtube_music',
    label: 'YT Music',
    search: (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`,
  },
];

function query(song) {
  return [song.artist, song.title].filter(Boolean).join(' ').trim();
}

// 화면에 보여줄 링크 목록: 저장된 정확한 링크 우선, 없으면 검색 링크
export function streamLinks(song) {
  const q = query(song);
  const saved = song.links || {};
  return PLATFORMS.map((p) => ({
    key: p.key,
    label: p.label,
    href: saved[p.key] || p.search(q),
    exact: Boolean(saved[p.key]),
  }));
}

// Odesli로 정확한 링크 찾기 (최대 5초). 못 찾으면 null
export async function lookupExactLinks(youtubeId) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const url = `https://api.song.link/v1-alpha.1/links?userCountry=KR&url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${youtubeId}`,
    )}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const by = data.linksByPlatform || {};
    const out = {};
    if (by.spotify?.url) out.spotify = by.spotify.url;
    if (by.appleMusic?.url) out.apple = by.appleMusic.url;
    if (by.youtubeMusic?.url) out.youtube_music = by.youtubeMusic.url;
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
