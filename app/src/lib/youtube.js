// 유튜브 관련 도우미: 링크 해석, IFrame API 로딩, 시간 표기

// 여러 형태의 유튜브 링크에서 영상 ID(11글자)와 시작 시각(t=)을 뽑음
//   https://youtu.be/ID?t=47 · youtube.com/watch?v=ID · /shorts/ID · /live/ID
//   music.youtube.com/watch?v=ID · m.youtube.com · /embed/ID · ID만 붙여넣기
export function parseYouTube(input) {
  const raw = (input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return { id: raw, start: null };

  let url;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, '');
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1, 12);
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v');
    if (!id) {
      const m = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})/);
      if (m) id = m[1];
    }
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return { id, start: parseTimeParam(url.searchParams.get('t') || url.searchParams.get('start')) };
}

// t=47, t=1m30s, t=90s 형태
function parseTimeParam(t) {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return null;
  const sec = (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
  return sec || null;
}

// 초 → "1:05"
export function fmtTime(sec) {
  if (sec == null || Number.isNaN(sec)) return '–:––';
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

// "1:05" / "65" / "1:02:03" → 초. 비어 있으면 null, 이상하면 NaN
export function parseTime(text) {
  const t = (text || '').trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export function thumbUrl(id) {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

export function watchUrl(id, start) {
  return `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`;
}

// 영상 제목 "QWER - 고민중독 (Official MV)" → { artist: 'QWER', title: '고민중독' }
export function guessTitleArtist(videoTitle, channel) {
  const clean = (s) =>
    s
      .replace(/[([【][^)\]】]*(official|mv|m\/v|music video|lyric|audio|live|teaser|가사|뮤직비디오)[^)\]】]*[)\]】]/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  const t = clean(videoTitle || '');
  const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash) return { artist: dash[1].trim().slice(0, 60), title: dash[2].trim().slice(0, 100) };
  const artist = (channel || '').replace(/\s*-\s*Topic$/i, '').trim();
  return { artist: artist.slice(0, 60), title: t.slice(0, 100) };
}

// IFrame Player API 스크립트는 페이지당 한 번만 로드
let apiPromise = null;
export function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('YT_API_LOAD_FAILED'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

// 유튜브 플레이어 에러 코드 → 안내 문장
export function ytErrorText(code) {
  if (code === 'api') {
    return '유튜브 플레이어를 불러오지 못했어요. 인터넷 연결을 확인해 주세요. 링크가 맞다면 곡은 그대로 올릴 수 있어요.';
  }
  if (code === 101 || code === 150) {
    return '이 영상은 다른 곳에서 재생하는 게 막혀 있어요(퍼가기 차단). 라이브 클립이나 음원 영상 같은 다른 링크로 바꿔 주세요.';
  }
  if (code === 153) {
    return '이 주소에서는 유튜브가 재생을 막아요. 파일을 직접 열지 말고 localhost나 배포된 https 주소로 열어 주세요.';
  }
  if (code === 100) return '영상이 없거나 비공개예요.';
  if (code === 2) return '영상 ID가 잘못됐어요.';
  if (code === 5) return '이 브라우저에서 재생할 수 없는 영상이에요.';
  return `영상을 재생하지 못했어요 (오류 ${code}).`;
}

// 영상 ID로 늘 같은 모양이 나오는 장식용 파형 높이
export function waveHeights(seed, count = 44) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const r = (h >>> 16) / 65536;
    const env = 0.55 + 0.45 * Math.sin((i / count) * Math.PI);
    out.push(Math.round((18 + r * 82) * env));
  }
  return out;
}
