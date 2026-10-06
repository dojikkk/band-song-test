// 곡 카드: 썸네일(누르면 미니 플레이어로 재생) + 제목/아티스트 + 하이라이트 + 코멘트
import Icon from './Icon';
import { usePlayer } from '../player/PlayerContext';
import { fmtTime, thumbUrl } from '../lib/youtube';

export default function SongCard({ song, queue, showSubmitter = true, badge, children, className = '' }) {
  const player = usePlayer();
  const isCurrent = player?.current?.id === song.id;
  const isPlaying = isCurrent && player.playing;

  return (
    <article className={`card song${isCurrent ? ' is-current' : ''} ${className}`}>
      <div className="song-top">
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
        <div className="song-meta">
          <div className="song-title">
            {badge}
            {song.title}
          </div>
          <div className="song-sub">
            {song.artist || '아티스트 미입력'}
            {showSubmitter && (
              <span className="by">{song.mine ? '내가 올림' : song.submitter ? `${song.submitter} 추천` : '익명 추천'}</span>
            )}
          </div>
          {song.highlight_start != null ? (
            <span className="hl-tag">
              ✦ {fmtTime(song.highlight_start)}–{fmtTime(song.highlight_end)}
            </span>
          ) : (
            <span className="hl-tag none">처음부터 재생</span>
          )}
        </div>
      </div>
      {song.comment && <p className="song-comment">{song.comment}</p>}
      {children}
    </article>
  );
}
