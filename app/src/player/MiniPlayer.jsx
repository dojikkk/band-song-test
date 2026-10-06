// 보이는 미니 플레이어 (유튜브 규정 준수 버전)
//  - 플레이어는 가리지 않고 그대로 보여줌 (폭 = 화면 폭, 16:9, 높이 200px 이상)
//  - 그 아래에 우리 파형·하이라이트·버튼을 붙이고, 버튼은 IFrame API로 조종
//  - 하이라이트: loadVideoById({ startSeconds, endSeconds }) → 구간 끝나면 자동 정지
//  - 광고: 못 막음. 대신 보이니까 직접 "건너뛰기" 가능 + 끝나면 하이라이트로 이어짐
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import Wave from '../components/Wave';
import { usePlayer } from './PlayerContext';
import { fmtTime, loadYouTubeApi, watchUrl, ytErrorText } from '../lib/youtube';
import { markListened } from '../lib/listened';

const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

export default function MiniPlayer() {
  const player = usePlayer();
  if (!player?.current) return null;
  return <PlayerSheet />;
}

function PlayerSheet() {
  const { bandId, current: song, next, play, stop, setPlaying, controls } = usePlayer();
  const hostRef = useRef(null);
  const ytRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [ytState, setYtState] = useState(S.UNSTARTED);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(0);
  const [err, setErr] = useState(null);
  const [mode, setMode] = useState('highlight'); // 'highlight' | 'full'
  const [nonce, setNonce] = useState(0); // "다시 듣기" 누를 때마다 +1
  const [stuck, setStuck] = useState(false);
  const [adTicks, setAdTicks] = useState(0); // 구간 앞에서 재생 중인 상태가 이어진 횟수(0.25초 단위)
  const lastSongId = useRef(null);
  const rangeRef = useRef({ start: 0 });

  const hasHl = song.highlight_start != null;
  const range = useMemo(
    () => ({
      start: hasHl && mode === 'highlight' ? song.highlight_start : 0,
      end: hasHl && mode === 'highlight' ? song.highlight_end ?? null : null,
    }),
    [song, hasHl, mode],
  );

  rangeRef.current = range;

  // 플레이어는 시트가 열릴 때 한 번 만들고, 닫힐 때 없앰
  useEffect(() => {
    let dead = false;
    loadYouTubeApi()
      .then((YT) => {
        if (dead || !hostRef.current) return;
        const el = document.createElement('div');
        hostRef.current.appendChild(el);
        ytRef.current = new YT.Player(el, {
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: () => !dead && setReady(true),
            onStateChange: (e) => {
              if (dead) return;
              setYtState(e.data);
              setPlaying(e.data === S.PLAYING);
            },
            onError: (e) => !dead && setErr(e.data),
          },
        });
      })
      .catch(() => setErr('api'));
    return () => {
      dead = true;
      setPlaying(false);
      try {
        ytRef.current?.destroy();
      } catch {
        /* 이미 없어짐 */
      }
      ytRef.current = null;
    };
  }, [setPlaying]);

  // 곡이 바뀌거나 모드/다시듣기 → 해당 구간 로드
  useEffect(() => {
    const p = ytRef.current;
    if (!ready || !p) return;
    if (lastSongId.current !== song.id) {
      lastSongId.current = song.id;
      if (mode !== 'highlight') {
        setMode('highlight'); // 새 곡은 늘 하이라이트부터. 바뀐 모드로 이 효과가 다시 돎
        return;
      }
    }
    setErr(null);
    setStuck(false);
    setAdTicks(0);
    setT(range.start);
    const req = { videoId: song.youtube_id, startSeconds: range.start };
    if (range.end != null) req.endSeconds = range.end;
    p.loadVideoById(req);
    // 3초 지나도 시작 안 하면 (모바일 자동재생 차단 등) 안내
    const timer = setTimeout(() => {
      const st = ytRef.current?.getPlayerState?.();
      if (st === S.UNSTARTED || st === S.CUED) setStuck(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [ready, song.id, song.youtube_id, mode, nonce, range.start, range.end]);

  // 진행 시간 읽기
  useEffect(() => {
    if (!ready) return undefined;
    const id = setInterval(() => {
      const p = ytRef.current;
      if (!p?.getCurrentTime) return;
      setT(p.getCurrentTime() || 0);
      const d = p.getDuration?.() || 0;
      if (d) setDuration(d);
      const st = p.getPlayerState?.();
      if (st === S.PLAYING) setStuck(false);
      // 광고 추정: "재생 중"인데 시간이 하이라이트 시작보다 한참 앞에 머물러 있음
      const start = rangeRef.current.start;
      const before = start > 2 && (p.getCurrentTime() || 0) < start - 1.5;
      const busyNow = st === S.PLAYING || st === S.BUFFERING;
      setAdTicks((n) => (before && busyNow ? n + 1 : 0));
    }, 250);
    return () => clearInterval(id);
  }, [ready]);

  const togglePlay = () => {
    const p = ytRef.current;
    if (!p) return;
    if (ytState === S.PLAYING || ytState === S.BUFFERING) p.pauseVideo();
    else if (ytState === S.ENDED) setNonce((n) => n + 1);
    else p.playVideo();
  };

  // 곡 카드의 ▶ 를 다시 누르면 여기 토글이 불림
  useEffect(() => {
    controls.current = { toggle: togglePlay };
    return () => {
      controls.current = null;
    };
  });

  // 파형 진행: 현재 시간이 구간 안에 있을 때만 채움 (광고 중엔 안 채움)
  const end = range.end ?? (duration || null);
  const inRange = end != null && t >= range.start - 0.75 && t <= end + 0.75;
  const progress = inRange ? Math.min(1, Math.max(0, (t - range.start) / (end - range.start))) : 0;
  const busy = ytState === S.PLAYING || ytState === S.BUFFERING;

  // "청취 후 투표"용: 하이라이트를 60% 넘게 들었거나(없으면 30초) 끝까지 들으면 '들음'으로 기록
  const heard =
    (ytState === S.ENDED && mode === 'highlight') ||
    (ytState === S.PLAYING && (hasHl ? inRange && progress >= 0.6 : t >= 30));
  useEffect(() => {
    if (heard) markListened(bandId, song.id);
  }, [heard, bandId, song.id]);
  const adLikely = adTicks >= 6; // 1.5초 넘게 이어질 때만 (곡 넘길 때 잠깐 0초인 건 무시)

  const seekTo = (frac) => {
    const p = ytRef.current;
    if (!p || end == null) return;
    p.seekTo(range.start + frac * (end - range.start), true);
    if (ytState !== S.PLAYING) p.playVideo();
  };

  let notice = null;
  if (err != null) {
    notice = <p className="pl-notice pl-err">{err === 'api' ? '유튜브 플레이어를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.' : ytErrorText(err)}</p>;
  } else if (adLikely) {
    notice = <p className="pl-notice">광고 재생 중이에요. 끝나면 하이라이트로 이어져요. 영상의 ‘건너뛰기’를 눌러도 돼요.</p>;
  } else if (stuck) {
    notice = <p className="pl-notice">재생이 시작되지 않으면 위 영상 화면을 한 번 눌러 주세요.</p>;
  } else if (ytState === S.ENDED && mode === 'highlight' && hasHl) {
    notice = <p className="pl-notice pl-done">하이라이트 끝. 다시 듣거나 다음 곡으로 넘어가요.</p>;
  }

  return (
    <section className="player" aria-label="미니 플레이어">
      <div className="pl-frame" ref={hostRef} />
      <div className="pl-body">
        <div className="pl-head">
          <div className="pl-meta">
            <div className="pl-title">{song.title}</div>
            <div className="pl-sub">
              {song.artist || '아티스트 미입력'}
              {hasHl && (
                <span className="hl-tag">
                  ✦ {fmtTime(song.highlight_start)}–{fmtTime(song.highlight_end)}
                </span>
              )}
            </div>
          </div>
          <button className="icon-btn" onClick={stop} aria-label="플레이어 닫기">
            <Icon name="close" />
          </button>
        </div>

        <Wave seed={song.youtube_id} progress={progress} onSeek={end != null ? seekTo : null} />
        <div className="pl-time">
          <span>{fmtTime(inRange ? t : range.start)}</span>
          <span>{end != null ? fmtTime(end) : ''}</span>
        </div>

        <div className="pl-controls">
          <button className="icon-btn" onClick={() => setNonce((n) => n + 1)} aria-label="처음부터 다시 듣기">
            <Icon name="replay" />
          </button>
          <button className="play-btn big" onClick={togglePlay} aria-label={busy ? '일시정지' : '재생'}>
            <Icon name={busy ? 'pause' : 'play'} size={24} />
          </button>
          <button
            className="icon-btn"
            onClick={() => next && play(next)}
            disabled={!next}
            aria-label="다음 곡"
          >
            <Icon name="next" />
          </button>
        </div>

        <div className="pl-foot">
          {hasHl ? (
            <div className="seg" role="group" aria-label="재생 범위">
              <button className={mode === 'highlight' ? 'on' : ''} onClick={() => setMode('highlight')}>
                하이라이트
              </button>
              <button className={mode === 'full' ? 'on' : ''} onClick={() => setMode('full')}>
                처음부터
              </button>
            </div>
          ) : (
            <span className="muted small">하이라이트 없이 처음부터 재생해요</span>
          )}
          <a className="link small" href={watchUrl(song.youtube_id, range.start)} target="_blank" rel="noreferrer">
            유튜브에서 열기 <Icon name="external" size={14} />
          </a>
        </div>
        {notice}
      </div>
    </section>
  );
}
