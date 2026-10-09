// [C-1] 곡 올리기 / 교체
//  · 유튜브를 쓰는 방: 유튜브 링크 + 하이라이트 구간 + 코멘트
//    미리보기 플레이어로 직접 들으면서 "지금 위치"를 눌러 구간을 잡음.
//  · 유튜브를 안 쓰는 방: 제목 + 아티스트(+ 코멘트)만. 플레이어·하이라이트 없음
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Button, Sheet, TextField } from '../../components/ui';
import { errorText, saveSong, setSongLinks } from '../../lib/api';
import { lookupExactLinks } from '../../lib/links';
import {
  fmtTime,
  guessTitleArtist,
  loadYouTubeApi,
  parseTime,
  parseYouTube,
  watchUrl,
  ytErrorText,
} from '../../lib/youtube';

const BLOCKING = [2, 100, 101, 150]; // 이 오류면 저장 막음 (아무도 못 들음)

export default function AddSongSheet(props) {
  return props.band.youtube_enabled ? <YouTubeSongSheet {...props} /> : <TextSongSheet {...props} />;
}

// 유튜브 없이 제목 + 아티스트만
function TextSongSheet({ token, band, editing, onClose, onSaved }) {
  const [title, setTitle] = useState(editing?.title || '');
  const [artist, setArtist] = useState(editing?.artist || '');
  const [comment, setComment] = useState(editing?.comment || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const canSave = title.trim() && artist.trim();

  const save = async (e) => {
    e?.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await saveSong(token, {
        id: editing?.id,
        youtube_id: null,
        title,
        artist,
        comment: band.allow_comments ? comment : null,
      });
      onSaved(editing ? '곡을 바꿨어요' : '곡을 올렸어요');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={editing ? '곡 수정하기' : '곡 올리기'}
      onClose={onClose}
      footer={
        <Button busy={busy} onClick={save} disabled={!canSave}>
          {editing ? '이대로 바꾸기' : '올리기'}
        </Button>
      }
    >
      <form className="stack" onSubmit={save}>
        <p className="hint">
          이 방은 유튜브 링크 없이 제목과 아티스트만 올려요. 다들 곡 카드의 <strong>다른 앱</strong> 버튼으로 각자 음악
          앱에서 찾아 들어요.
        </p>
        <TextField
          label="곡 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 100))}
          placeholder="예: 고민중독"
          autoFocus={!editing}
          autoComplete="off"
        />
        <TextField
          label="아티스트"
          value={artist}
          onChange={(e) => setArtist(e.target.value.slice(0, 60))}
          placeholder="예: QWER"
          autoComplete="off"
        />
        {band.allow_comments && <CommentField value={comment} onChange={setComment} />}
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Sheet>
  );
}

function CommentField({ value, onChange }) {
  return (
    <div className="field">
      <label htmlFor="cm">추천 이유</label>
      <textarea
        id="cm"
        rows={2}
        value={value}
        maxLength={200}
        onChange={(e) => onChange(e.target.value)}
        placeholder="예: 보컬 키 딱 맞고 드럼 필인이 재밌어요"
      />
      <p className="hint right">{value.length}/200</p>
    </div>
  );
}

// 유튜브 링크 + 하이라이트
function YouTubeSongSheet({ token, band, editing, onClose, onSaved, notify }) {
  const [link, setLink] = useState(editing?.youtube_id ? watchUrl(editing.youtube_id) : '');
  const parsed = useMemo(() => parseYouTube(link), [link]);
  const videoId = parsed?.id || null;

  const [title, setTitle] = useState(editing?.title || '');
  const [artist, setArtist] = useState(editing?.artist || '');
  const [start, setStart] = useState(editing?.highlight_start != null ? fmtTime(editing.highlight_start) : '');
  const [end, setEnd] = useState(editing?.highlight_end != null ? fmtTime(editing.highlight_end) : '');
  const [comment, setComment] = useState(editing?.comment || '');
  const [embedErr, setEmbedErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const touched = useRef({ title: !!editing, artist: !!editing });
  const previewRef = useRef(null);

  // 링크에 ?t=47 이 있으면 하이라이트 시작으로 미리 채움
  useEffect(() => {
    setEmbedErr(null);
    if (parsed?.start != null && !start) {
      setStart(fmtTime(parsed.start));
      if (!end) setEnd(fmtTime(parsed.start + 30));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // 영상 정보가 오면 제목/아티스트 자동 채우기 (직접 고친 칸은 안 건드림)
  const onMeta = ({ title: vt, author }) => {
    if (!vt) return;
    const g = guessTitleArtist(vt, author);
    if (!touched.current.title) setTitle(g.title);
    if (!touched.current.artist) setArtist(g.artist);
  };

  const sStart = parseTime(start);
  const sEnd = parseTime(end);
  const hlError =
    Number.isNaN(sStart) || Number.isNaN(sEnd)
      ? '시간은 1:05 처럼 써 주세요.'
      : sStart != null && sEnd == null
        ? '끝 시간도 넣어 주세요.'
        : sStart == null && sEnd != null
          ? '시작 시간도 넣어 주세요.'
          : sStart != null && sEnd <= sStart
            ? '끝이 시작보다 뒤여야 해요.'
            : null;

  const canSave = videoId && title.trim() && !hlError && !BLOCKING.includes(embedErr);

  const markHere = (which) => {
    const t = previewRef.current?.time();
    if (t == null) return;
    const sec = Math.floor(t);
    if (which === 'start') {
      setStart(fmtTime(sec));
      if (!end || (sEnd != null && sEnd <= sec)) setEnd(fmtTime(sec + 30));
    } else {
      setEnd(fmtTime(Math.max(sec, (sStart ?? 0) + 1)));
    }
  };

  const save = async (e) => {
    e?.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const res = await saveSong(token, {
        id: editing?.id,
        youtube_id: videoId,
        title,
        artist,
        highlight_start: sStart,
        highlight_end: sEnd,
        comment: band.allow_comments ? comment : null,
      });
      onSaved(editing ? '곡을 바꿨어요' : '곡을 올렸어요');
      // 다른 앱(Spotify·Apple Music) 정확한 링크를 뒤에서 찾아 저장 — 실패해도 검색 링크로 대체됨
      if (!editing || editing.youtube_id !== videoId) {
        lookupExactLinks(videoId).then((links) => {
          if (links) setSongLinks(token, res.song_id, links).then(() => notify?.(), () => {});
        });
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={editing ? '곡 교체하기' : '곡 올리기'}
      onClose={onClose}
      footer={
        <Button busy={busy} onClick={save} disabled={!canSave}>
          {editing ? '이 곡으로 바꾸기' : '올리기'}
        </Button>
      }
    >
      <form className="stack" onSubmit={save}>
        <TextField
          label="유튜브 링크"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://youtu.be/..."
          inputMode="url"
          autoComplete="off"
          autoFocus={!editing}
          hint={link && !videoId ? '유튜브 영상 링크를 붙여 넣어 주세요. (공유 버튼 → 링크 복사)' : null}
        />

        {videoId && (
          <>
            <Preview ref={previewRef} videoId={videoId} onMeta={onMeta} onError={setEmbedErr} />
            {embedErr != null && <p className="form-error">{ytErrorText(embedErr)}</p>}

            <div className="hl-editor">
              <div className="hl-head">
                <strong>하이라이트 구간</strong>
                <span className="muted small">선택 · 비우면 처음부터 재생</span>
              </div>
              <div className="hl-grid">
                <div className="field compact">
                  <label htmlFor="hs">시작</label>
                  <input id="hs" value={start} onChange={(e) => setStart(e.target.value)} placeholder="0:47" inputMode="numeric" />
                  <button type="button" className="ghost-btn small" onClick={() => markHere('start')}>
                    지금 위치
                  </button>
                </div>
                <div className="field compact">
                  <label htmlFor="he">끝</label>
                  <input id="he" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="1:17" inputMode="numeric" />
                  <button type="button" className="ghost-btn small" onClick={() => markHere('end')}>
                    지금 위치
                  </button>
                </div>
              </div>
              {hlError ? (
                <p className="form-error small">{hlError}</p>
              ) : (
                sStart != null && (
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => previewRef.current?.playRange(sStart, sEnd)}
                  >
                    ✦ {fmtTime(sStart)}–{fmtTime(sEnd)} 구간 들어보기 ({sEnd - sStart}초)
                  </button>
                )
              )}
            </div>

            <TextField
              label="곡 제목"
              value={title}
              onChange={(e) => {
                touched.current.title = true;
                setTitle(e.target.value.slice(0, 100));
              }}
              placeholder="영상 제목에서 자동으로 채워져요"
            />
            <TextField
              label="아티스트"
              value={artist}
              onChange={(e) => {
                touched.current.artist = true;
                setArtist(e.target.value.slice(0, 60));
              }}
              placeholder="선택"
            />
            {band.allow_comments && <CommentField value={comment} onChange={setComment} />}
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Sheet>
  );
}

// 곡 올리기용 미리보기 플레이어 (보이는 플레이어 · 자동재생 안 함)
const Preview = forwardRef(function Preview({ videoId, onMeta, onError }, ref) {
  const hostRef = useRef(null);
  const ytRef = useRef(null);
  const readyRef = useRef(false);
  const cbs = useRef({ onMeta, onError });
  cbs.current = { onMeta, onError };
  const latestId = useRef(videoId);
  latestId.current = videoId;
  const [t, setT] = useState(0);

  const readMeta = () => {
    try {
      const d = ytRef.current?.getVideoData?.();
      if (d?.title) cbs.current.onMeta({ title: d.title, author: d.author });
    } catch {
      /* 무시 */
    }
  };

  useImperativeHandle(ref, () => ({
    time: () => ytRef.current?.getCurrentTime?.() ?? null,
    playRange: (s, e) => {
      const req = { videoId: latestId.current, startSeconds: s };
      if (e != null) req.endSeconds = e;
      ytRef.current?.loadVideoById(req);
    },
  }));

  // 처음 한 번 생성
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
          videoId,
          playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: () => {
              readyRef.current = true;
              // 준비되는 사이에 링크가 바뀌었으면 최신 영상으로
              if (latestId.current !== videoId) ytRef.current.cueVideoById({ videoId: latestId.current });
              else readMeta();
            },
            onStateChange: (e) => {
              if (e.data === 5 || e.data === 1) readMeta();
            },
            onError: (e) => cbs.current.onError(e.data),
          },
        });
      })
      .catch(() => cbs.current.onError('api'));
    const id = setInterval(() => {
      const p = ytRef.current;
      if (p?.getCurrentTime) setT(p.getCurrentTime() || 0);
    }, 300);
    return () => {
      dead = true;
      clearInterval(id);
      try {
        ytRef.current?.destroy();
      } catch {
        /* 무시 */
      }
      ytRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 링크를 바꾸면 영상만 교체 (자동재생 X)
  useEffect(() => {
    if (readyRef.current && ytRef.current) ytRef.current.cueVideoById({ videoId });
  }, [videoId]);

  return (
    <div className="preview">
      <div className="pl-frame" ref={hostRef} />
      <div className="preview-time">지금 위치 {fmtTime(t)}</div>
    </div>
  );
});
