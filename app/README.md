# 셋리스트 — 밴드 곡 선정 앱 v1 (다수결)

방장이 방을 만들고 → 멤버가 유튜브 링크로 곡을 올리고 → 하이라이트를 같이 듣고 → 투표해서 공연 곡을 정하는 모바일 웹앱.
설계 기준은 `밴드 곡 선정 앱 · 화면 설계(IA)` 문서. 이 폴더가 그 v1 구현이야.

```
React (Vite)  ──RPC 호출──▶  Supabase (Postgres + DB 함수)      배포: Vercel
     │
     └─ YouTube IFrame Player API (보이는 미니 플레이어)
```

---

## 0. 전체 연동 그림 — "GitHub main이 기준"

```
           git push (main)
 내 PC ───────────────────────▶ GitHub: dojikkk/band-song-test
                                   │
         ┌─────────────────────────┼──────────────────────────┐
         ▼                         ▼                          ▼
  Supabase GitHub 연동        Vercel GitHub 연동        GitHub Actions
  app/supabase/migrations/    app/ 을 빌드해서 배포      주 2회 Supabase 깨우기
  새 파일만 DB에 자동 적용     (웹사이트 자동 갱신)      (7일 미사용 일시정지 방지)
```

- **DB 구조를 바꾸고 싶으면** → `app/supabase/migrations/`에 새 SQL 파일 추가 → push. 끝. (6번 참고)
- **화면을 바꾸고 싶으면** → `app/src/` 고치고 push. Vercel이 알아서 다시 배포.

## 1. Supabase 준비

DB 내용은 전부 `supabase/migrations/20261006120000_init.sql` 한 파일에 있어 (테이블 5개 + 함수 14개).

**연동 켜기 (한 번만)** — Supabase 대시보드 → 프로젝트 → **Project Settings → Integrations → GitHub**
1. **Authorize GitHub** → `dojikkk/band-song-test` 선택
2. **Supabase directory**: `app` ← `supabase/` 폴더가 들어 있는 경로
3. **Production branch**: `main`, **Deploy to production** 켜기
4. 이제 main에 push될 때마다 아직 안 들어간 마이그레이션 파일이 자동으로 적용돼. (무료 플랜도 됨)

**키 확인** — **Project Settings → API Keys** (또는 상단 **Connect** 버튼)
- Project URL — `https://xxxx.supabase.co`
- **Publishable key** (`sb_publishable_...`). 화면에 없으면 Legacy 탭의 `anon` `public` 키도 똑같이 돼.
- ⚠ `service_role` / `secret` 키는 절대 쓰지 마. 모든 잠금을 무시하는 관리자 열쇠야.

> 연동 없이 손으로 하고 싶으면: **SQL Editor → New query**에 init 파일을 통째로 붙여넣고 Run. 여러 번 실행해도 안전하게 짜 뒀어.
> "destructive operation" 경고가 뜨면 그냥 실행해도 돼 (권한 거두는 `revoke` 문장 때문).

## 2. 내 컴퓨터에서 실행

```bash
cd app
npm install                 # 처음 한 번
copy .env.example .env.local   # (맥/리눅스는 cp)
# .env.local 열어서 위에서 복사한 URL과 키 넣기
npm run dev
```

- 브라우저에서 `http://localhost:5173` 열기.
- 같은 와이파이의 폰에서 보고 싶으면 터미널에 뜨는 `Network: http://192.168.x.x:5173` 주소로 접속.
- ⚠ `index.html`을 더블클릭해서 파일로 열면 안 돼. 유튜브가 오류 150/153으로 막아. 꼭 `npm run dev` 주소로.

## 3. 인터넷에 올리기 (Vercel)

1. https://vercel.com → GitHub로 로그인 → **Add New → Project** → `band-song-test` 선택.
2. **Root Directory** 를 `app` 으로 지정 (Framework는 Vite로 자동 인식).
3. **Environment Variables** 에 `.env.local`과 같은 두 줄 추가:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. **Deploy**. 이후엔 main에 push할 때마다 자동 배포돼. 나온 `https://….vercel.app` 주소가 단톡방에 뿌릴 주소야.
   방장 화면의 "초대하기"를 누르면 `주소/?c=참여코드` 형태의 링크가 복사돼.

> 환경변수를 나중에 바꿨으면 Vercel에서 **Redeploy** 해야 반영돼. (`VITE_` 값은 빌드할 때 코드에 박히거든)

---

## 4. 폴더 구조 — 어디에 뭐가 있나

```
app/
├─ supabase/
│  ├─ config.toml             ← Supabase CLI·GitHub 연동이 읽는 설정 (거의 안 만짐)
│  └─ migrations/             ← DB 변경 이력. 파일 하나 = 변경 한 번
│     └─ 20261006120000_init.sql   ← 테이블 + 잠금(RLS) + DB 함수 전부
├─ src/
│  ├─ lib/
│  │  ├─ api.js               ← DB 함수 호출을 한곳에 모음 + 에러코드 → 한국어 문장
│  │  ├─ supabase.js          ← Supabase 연결
│  │  ├─ rooms.js             ← "이 기기에서 들어간 방" 기억 (localStorage)
│  │  ├─ youtube.js           ← 링크 해석, IFrame API 로딩, 시간 표기
│  │  └─ time.js              ← 마감일 표시
│  ├─ hooks/useBandState.js   ← 방 상태 가져오기 + 실시간 갱신
│  ├─ player/                 ← 미니 플레이어 (화면에 딱 하나)
│  ├─ screens/
│  │  ├─ Entry / JoinFlow / CreateBand   ← [A] 진입
│  │  ├─ SetupWizard + settings/         ← [B] 방장 설정 4단계
│  │  ├─ Room.jsx                        ← [C] 공용 화면 뼈대 (status에 따라 변신)
│  │  └─ room/
│  │     ├─ Collecting / AddSongSheet    ← [C-1] 곡 수합
│  │     ├─ Voting                       ← [C-2] 투표
│  │     ├─ Results                      ← [C-3] 결과·확정
│  │     ├─ LeaderPanel / SettingsSheet  ← [D] 방장 오버레이
│  │     └─ MeSheet                      ← 내 메뉴 (PIN 바꾸기, 로그아웃)
│  └─ components/             ← 카드, 버튼, 시트 같은 공용 부품
└─ index.html
```

## 5. 동작 원리 (꼭 이해하고 갈 3가지)

### ① 데이터 모델
`bands` (방·설정·단계) / `members` (이름·PIN해시·역할) / `sessions` (로그인 토큰 해시) / `songs` / `votes`.
- `UNIQUE(band_id, lower(name))` → 이름 중복을 DB가 막음
- `UNIQUE(song_id, member_id)` → 한 곡에 한 표를 DB가 막음
- `UNIQUE(band_id, youtube_id)` → 같은 영상 두 번 올리기 금지

### ② 보안 = "브라우저는 테이블을 직접 못 만진다"
- 모든 테이블에 RLS를 켜고 **정책을 하나도 안 만듦** → anon 키로는 어떤 행도 읽기/쓰기 불가.
- 브라우저는 `create_band`, `get_state`, `submit_votes` 같은 **DB 함수만** 부를 수 있어.
  함수는 `security definer`(DB 주인 권한)로 돌면서 토큰으로 "누가 불렀는지" 확인하고 규칙을 검사해.
- 그래서 **애초에 브라우저로 내려오지 않는 것들**:
  PIN 해시 · 남의 투표 · (익명일 때) 곡 올린 사람 · (마감 전) 득표수 — 방장 포함.
  개발자 도구를 열어도 없는 데이터는 못 봐. "UI로 가리기"가 아니라 "안 보내기".
- PIN은 bcrypt 해시로 저장. 5번 틀리면 5분 → 10분 → 15분… 잠금 (4자리 PIN 무차별 대입 방지).
- 로그인 토큰도 DB엔 해시만 저장. 방장이 PIN을 초기화하면 그 멤버의 기존 로그인은 전부 끊김.

### ③ 상태 전이
```
설정중(setup) ─방장─▶ 곡수합(collecting) ─방장─▶ 투표중(voting) ─방장─▶ 확정(done)
```
- `advance_status(token, 지금단계)` 하나로만 넘어감. "지금 단계"가 DB와 다르면 거절 → 버튼 두 번 눌러서 두 단계 넘어가는 사고 방지.
- 마감일은 안내·독촉용. 자동으로 넘어가지 않음. 정족수도 강제 안 함 (방장 메뉴에 "독촉 메시지 복사" 있음).
- 되돌리기는 없음 (v1 단순화). 넘기기 전에 확인 단계를 한 번 거침.

### 실시간 갱신은 이렇게
누가 뭘 바꾸면 그 브라우저가 Supabase Realtime 채널에 **"바뀌었어" 신호만** 쏴 (데이터는 안 실음).
신호를 받은 사람들은 `get_state`를 다시 불러. 신호를 놓쳐도 15초마다, 앱으로 돌아올 때마다 새로 가져와.
데이터는 늘 DB 함수로만 받으니 익명·비공개 규칙이 실시간 기능 때문에 새는 일이 없어.

---

## 5-1. DB를 바꾸는 법 (마이그레이션)

DB는 "지금 모습"이 아니라 **"바뀐 순서"를 파일로** 남겨. 그래야 GitHub만 보면 DB가 어떻게 생겼는지 알 수 있고, 연동이 알아서 적용해 줘.

1. `app/supabase/migrations/`에 새 파일 추가. 이름은 `날짜시각_설명.sql` (앞 14자리 숫자 순서대로 적용됨)
   - 예: `20261020093000_add_song_note.sql`
   - Supabase CLI가 있으면 `npx supabase migration new add_song_note` 로 이름을 자동으로 만들어 줌
2. 바꿀 내용만 SQL로 적기. 예) 함수를 고칠 땐 `create or replace function ...` 전체를 새 파일에 다시 쓰기
3. 커밋 → `git push` → Supabase가 그 파일만 적용 (대시보드 **Database → Migrations**에서 확인)

⚠ 규칙 두 개
- **이미 적용된 파일은 절대 고치지 말기.** Supabase는 "이 번호는 이미 했음"으로 기억해서 고쳐도 다시 안 돌려. 바꿀 게 있으면 항상 새 파일.
- 대시보드 SQL Editor에서 직접 DB를 고치면 GitHub 파일과 실제 DB가 어긋나. 고칠 건 파일로.

## 6. 설계 문서의 "미정 사항"을 이렇게 정했어 (바꾸고 싶으면 말해)

| 미정 사항 | v1에서 정한 것 |
|---|---|
| 하이라이트 필수/선택 | **선택.** 비우면 처음부터 재생. 링크에 `?t=47`이 있으면 0:47–1:17로 자동 채움 |
| 청취 후 투표 | **안 넣음.** 대신 미니 플레이어에 "다음 곡" 버튼으로 연속 듣기 |
| 결과 화면에 뭐가 보이나 | 방장이 고른 **최종 선정 곡** + **전체 득표 순위**. 공개 투표면 곡마다 찍은 사람 이름도 |
| 투표 결과 중간 수정 범위 | **던진 표 바꾸기만** (설정에서 끌 수 있음). 단계 되돌리기는 없음 |
| 방장 이탈 | 방장은 방을 못 나감. 로그아웃만 가능. 권한 위임 없음 |
| 인당 투표 수 | 다수결 · 인당 N곡까지 (1~N개 자유롭게, 0개는 안 됨) |

추가로 정한 것:
- **설정 잠금** — 곡 수합이 시작되면 "올린 사람 숨기기"는 고정, 투표가 시작되면 "인당 표 수 / 익명 투표 / 표 수정 허용"은 고정. 진행 중에 약속을 바꾸면 안 되니까. (DB 함수가 강제)
- **방장 결과 비공개** — 투표 중엔 방장 메뉴에도 "누가 투표했는지(참여 여부)"만 보여. 뭘 찍었는지/득표수는 마감 때 모두 동시에.
- **카톡 인앱 브라우저** — 감지되면 "브라우저로 열기" 안내를 띄움 (광고·로그인 문제 때문).

## 7. 알아 둘 한계

- **Supabase 무료 플랜은 7일 동안 요청이 없으면 일시정지돼.** 그래서 `.github/workflows/supabase-keepalive.yml`이 월·목마다 한 번씩 깨워. 저장소 Secrets에 `SUPABASE_URL`, `SUPABASE_ANON_KEY`가 있어야 동작해. 단, GitHub는 저장소에 60일간 커밋이 없으면 예약 작업을 멈추니까 그럴 땐 Actions 탭에서 다시 켜기.
- **유튜브 광고는 못 막아.** 보이는 플레이어라서 직접 "건너뛰기"를 누를 수 있고, 광고가 끝나면 하이라이트 시작점으로 이어져.
- **퍼가기 차단 영상**(유명 공식 뮤비에 많음)은 미리보기에서 오류가 뜨고 저장이 막혀. 라이브 클립·음원 영상 링크로 바꾸게 안내함.
- **아이폰은 첫 재생이 자동으로 안 될 수 있어.** 그럴 땐 "영상 화면을 한 번 눌러 주세요" 안내가 뜸 (보이는 플레이어라 가능한 해결).
- **익명 곡 + 참여 현황**: 방장이 독촉할 수 있게 "누가 곡을 몇 개 올렸는지"는 보여. 그래서 사람이 아주 적으면 타이밍으로 추측은 가능해. 이게 싫으면 말해 — 방장에게만 보이게 바꿀 수 있어.

## 8. 관리자용 SQL (Supabase SQL Editor)

**방장이 PIN을 잊었을 때** (방장 PIN은 앱에서 초기화해 줄 사람이 없음):
```sql
update public.members
set pin_hash = extensions.crypt('0000', extensions.gen_salt('bf', 8)),
    failed_attempts = 0, locked_until = null, must_change_pin = true
where lower(name) = lower('준호')
  and band_id = (select id from public.bands where invite_code = 'ABC123');
-- → 0000으로 들어오면 새 PIN 정하라는 창이 뜸
```

**방 전체 보기 / 지우기**
```sql
select name, invite_code, status, created_at from public.bands order by created_at desc;
delete from public.bands where invite_code = 'ABC123';   -- 멤버·곡·투표까지 같이 지워짐
```

**DB를 통째로 비우고 처음부터 다시** (데이터 전부 사라짐, 신중히)
```sql
drop table if exists public.votes, public.songs, public.sessions, public.members, public.bands cascade;
drop schema if exists private cascade;
delete from supabase_migrations.schema_migrations where version = '20261006120000';
-- → 그다음 init 파일을 SQL Editor에서 다시 Run (또는 아무 커밋이나 push해서 연동이 다시 적용하게)
```

## 9. v2에서 얹을 것 (설계 문서 6장)
점수제(보르다) · 그룹(파트) 분류 · 초대 승인 방식 · 추방 · 파트 배분/합주 일정 · 스포티파이/애플뮤직 링크.
설정 화면에 자리는 이미 "다음 버전에서 열려요"로 잡아 뒀어.
