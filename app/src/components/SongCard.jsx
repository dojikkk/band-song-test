// 곡 카드: 썸네일(누르면 미니 플레이어로 재생) + 제목/아티스트 + 하이라이트 + 코멘트
//          + 그룹 표시 + 다른 서비스에서 듣기 링크
// 유튜브 영상이 없는 곡(유튜브 링크를 안 쓰는 방)은 플레이어·하이라이트 없이
// 제목·아티스트만 보여 주고, 음악 앱 링크를 바로 펼칠 수 있게 함.
import { useState } from 'react';
import Icon from './Icon';
import { usePlayer } from '../player/PlayerContext';
import { fmtTime, thumbUrl } from '../lib/youtube';
import { streamLinks } from '../lib/links';

export default function SongCard({
  song,
  queue,
  showSubmitter = true,
  badge,
  groups,
  children,
  className = '',
  hideTitle = false, // 점수제 상세보기처럼 제목·아티스트를 바깥에서 이미 보여 줄 때
}) {
  const player = usePlayer();
  const [showLinks, setShowLinks] = useState(false);
  const hasVideo = Boolean(song.youtube_id);
  const isCurrent = hasVideo && player?.current?.id === song.id;
  const isPlaying = isCurrent && player.playing;

  return (
    <article className={`card song${isCurrent ? ' is-current' : ''}${hasVideo ? '' : ' text-only'} ${className}`}>
      <div className="song-top">
        {hasVideo ? (
          <button
            className="thumb"
            onClick={() => player.play(song, queue)}
            aria-label={isPlaying ? `${song.title} 일시정지` : `${song.title} 듣기`}
          >
            <img
              src={thumbUrl(song.youtube_id)}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
            <span className="thumb-btn">
              <Icon name={isPlaying ? 'eq' : 'play'} size={18} className={isPlaying ? 'eq' : ''} />
            </span>
          </button>
        ) : (
          <span className="cover" style={{ '--hue': hue(song.title + (song.artist || '')) }} aria-hidden="true">
            <Icon name="note" size={20} />
          </span>
        )}
        <div className="song-meta">
          {!hideTitle && (
            <div className="song-title">
              {badge}
              {song.title}
            </div>
          )}
          <div className="song-sub">
            {!hideTitle && (song.artist || '아티스트 미입력')}
            {showSubmitter && (
              <span className="by">{song.mine ? '내가 올림' : song.submitter ? `${song.submitter} 추천` : '익명 추천'}</span>
            )}
          </div>
          <div className="tag-row">
            {hasVideo &&
              (song.highlight_start != null ? (
                <span className="hl-tag">
                  ✦ {fmtTime(song.highlight_start)}–{fmtTime(song.highlight_end)}
                </span>
              ) : (
                <span className="hl-tag none">처음부터 재생</span>
              ))}
            {groups?.map((g) => (
              <span key={g.id} className="group-tag">
                {g.name}
              </span>
            ))}
            <button
              className={`links-toggle${hasVideo ? '' : ' main'}`}
              onClick={() => setShowLinks((v) => !v)}
              aria-expanded={showLinks}
              aria-label={hasVideo ? '다른 앱에서 듣기' : '음악 앱에서 찾아 듣기'}
            >
              {hasVideo ? '다른 앱' : '음악 앱에서 듣기'}
            </button>
          </div>
        </div>
      </div>
      {showLinks && (
        <div className="stream-links">
          {streamLinks(song).map((l) => (
            <a key={l.key} href={l.href} target="_blank" rel="noreferrer" title={l.exact ? '정확한 곡 링크' : '검색 결과로 열기'}>
              {l.label}
              {!l.exact && <small>검색</small>}
            </a>
          ))}
        </div>
      )}
      {song.comment && <p className="song-comment">{song.comment}</p>}
      {children}
    </article>
  );
}

// 목록용 작은 표지: 유튜브 곡은 썸네일, 텍스트 곡은 색 블록 + 음표
export function SongThumb({ song, className = '' }) {
  if (song.youtube_id) {
    return (
      <img
        className={className}
        src={thumbUrl(song.youtube_id)}
        alt=""
        loading="lazy"
        onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
      />
    );
  }
  return (
    <span className={`cover mini ${className}`} style={{ '--hue': hue(song.title + (song.artist || '')) }} aria-hidden="true">
      <Icon name="note" size={14} />
    </span>
  );
}

// 제목마다 늘 같은 색이 나오게 (커버 자리 장식용)
function hue(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}
