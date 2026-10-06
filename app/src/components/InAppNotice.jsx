// 카카오톡 인앱 브라우저로 열렸을 때만 보이는 안내.
// 인앱 브라우저는 유튜브 로그인이 안 돼 있어서 광고가 더 자주 나오고, 기록도 따로 저장됨.
// kakaotalk://web/openExternal 은 카톡이 지원하는 "기본 브라우저로 열기" 주소.
import { useState } from 'react';
import Icon from './Icon';

const IS_KAKAO = typeof navigator !== 'undefined' && /KAKAOTALK/i.test(navigator.userAgent);

export default function InAppNotice({ href }) {
  const [hidden, setHidden] = useState(false);
  if (!IS_KAKAO || hidden) return null;
  const openExternal = () => {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
  };
  return (
    <div className="inapp" role="note">
      <p>
        카톡 안에서 열렸어요. 폰 기본 브라우저로 열면 유튜브 광고가 덜 나오고 재생도 매끄러워요. 브라우저를 바꾸면
        이름과 PIN으로 한 번 더 들어와야 해요.
      </p>
      <div className="row-btns">
        <button className="ghost-btn small" onClick={() => setHidden(true)}>
          그냥 쓸게요
        </button>
        <button className="primary-btn small" onClick={openExternal}>
          <Icon name="external" size={15} /> 브라우저로 열기
        </button>
      </div>
    </div>
  );
}
