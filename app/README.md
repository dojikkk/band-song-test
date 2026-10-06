# 셋리스트 — 밴드 곡 선정 앱 v2

방장이 방을 만들고 → 멤버가 유튜브 링크로 곡을 올리고 → 하이라이트를 같이 듣고 → 투표해서 공연 곡을 정하고
→ 파트를 나누고 → 합주 일정까지 잡는 모바일 웹앱.
설계 기준은 `밴드 곡 선정 앱 · 화면 설계(IA)` 문서.

| | 들어 있는 기능 |
|---|---|
| v1 | 참여코드+이름+PIN 입장, 방장 설정 4단계, 곡 수합(유튜브+하이라이트+코멘트), 다수결 투표, 결과·선정, PIN 초기화 |
| v2 | **점수제(보르다)**, **그룹(파트) 분류**, **입장 승인·내보내기·참여코드 재발급**, **파트 배분**, **합주 일정 조율**, **Spotify·Apple Music·멜론 링크**, 청취 후 투표 옵션 |

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

DB 내용은 `supabase/migrations/` 안의 파일들이야. 번호 순서대로 적용돼.
- `20261006120000_init.sql` — v1: 테이블 5개 + 함수 14개
- `20261007000000_v2.sql` — v2: 그룹·점수·승인·파트·합주 (기존 데이터는 그대로 두고 덧붙임)

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
│     ├─ 20261006120000_init.sql   ← v1: 테이블 + 잠금(RLS) + DB 함수
│     └─ 20261007000000_v2.sql     ← v2: 그룹·점수제·승인·파트·합주·링크
├─ src/
│  ├─ lib/
│  │  ├─ api.js               ← DB 함수 호출을 한곳에 모음 + 에러코드 → 한국어 문장
│  │  ├─ supabase.js          ← Supabase 연결
│  │  ├─ rooms.js             ← "이 기기에서 들어간 방" 기억 (localStorage)
│  │  ├─ youtube.js           ← 링크 해석, IFrame API 로딩, 시간 표기
│  │  ├─ links.js             ← Spotify·Apple Music·멜론 링크 (정확한 링크 → 없으면 검색)
│  │  ├─ listened.js          ← "청취 후 투표"용 들은 곡 기억
│  │  ├─ selectors.js         ← 상태에서 그룹·내 표 등 꺼내는 도우미
│  │  └─ time.js              ← 마감일·합주 날짜/시간 표시
│  ├─ hooks/useBandState.js   ← 방 상태 가져오기 + 실시간 갱신
│  ├─ player/                 ← 미니 플레이어 (화면에 딱 하나)
│  ├─ screens/
│  │  ├─ Entry / JoinFlow / CreateBand   ← [A] 진입
│  │  ├─ SetupWizard + settings/         ← [B] 방장 설정 4단계
│  │  ├─ Room.jsx                        ← [C] 공용 화면 뼈대 (status에 따라 변신 + 탭)
│  │  ├─ PendingRoom.jsx                 ← 입장 승인 대기 화면
│  │  └─ room/
│  │     ├─ Collecting / AddSongSheet    ← [C-1] 곡 수합
│  │     ├─ GroupSheet                   ← 그룹 나누기 (방장)
│  │     ├─ Voting                       ← [C-2] 투표 (다수결 / 순위 매기기, 그룹별)
│  │     ├─ Results                      ← [C-3] 결과·확정 (그룹별)
│  │     ├─ Parts                        ← 파트 탭: 내 파트, 손들기, 배정
│  │     ├─ Schedule                     ← 합주 일정 탭: 가능 시간 표, 합주 확정
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
| 청취 후 투표 | v1엔 안 넣음 → **v2에서 옵션으로 추가** (아래 표) |
| 결과 화면에 뭐가 보이나 | 방장이 고른 **최종 선정 곡** + **전체 득표 순위**. 공개 투표면 곡마다 찍은 사람 이름도 |
| 투표 결과 중간 수정 범위 | **던진 표 바꾸기만** (설정에서 끌 수 있음). 단계 되돌리기는 없음 |
| 방장 이탈 | 방장은 방을 못 나감. 로그아웃만 가능. 권한 위임 없음 |
| 인당 투표 수 | 다수결 · 인당 N곡까지 (1~N개 자유롭게, 0개는 안 됨) |

**v2에서 새로 정한 것** (설계 문서에 비어 있던 부분)

| 항목 | 정한 것 |
|---|---|
| 그룹 나누는 화면 | 방장 메뉴/곡 수합 화면의 **그룹 나누기** → 그룹 만들고, 곡마다 그룹 칩을 눌러 넣기. 곡 수합 중 아무 때나, 투표 시작 전까지 |
| 그룹 없는 방 | 투표 시작 순간 '전체' 그룹 하나가 자동으로 생김 → 투표·결과는 늘 "그룹별"로 같은 방식 |
| 미분류 곡 | 그룹 쓰는 방은 모든 곡이 그룹에 들어가야 투표 시작 가능 (점수제 공정성 때문에 DB가 막음). 빈 그룹은 자동 삭제 |
| 다수결 + 그룹 | 그룹마다 N곡까지 고르기 |
| 점수제 화면 | 좋은 순서대로 눌러서 순위 매기기 (누르면 1위, 2위…). 다 매겨야 "제출" 버튼이 켜짐 |
| 결과 | 그룹마다 따로 순위. 그룹끼리는 비교 안 함. 공개 투표면 "민수 4, 준호 3"처럼 누가 몇 점 줬는지 |
| 입장 승인 | 승인 방식이면 들어온 사람은 '대기' → 방장 메뉴 맨 위에 승인/거절. 대기자는 정원에 포함 |
| 내보내기 | 방장만, 방장은 못 내보냄. **투표 중엔 곡을 올린 사람은 못 내보냄** (남의 순위표가 깨져서) |
| 참여코드 재발급 | 예전 코드·링크는 막히고, 이미 들어온 사람은 그대로 |
| 파트 배분 | 방장이 정한 **기본 편성**(보컬·기타1·기타2·베이스·드럼·키보드)으로 선정곡마다 자리가 자동 생성 → 멤버가 "할래요" 손들기 → 방장이 배정. 곡마다 자리 추가/삭제 가능 |
| 합주 일정 | when2meet 방식: 방장이 날짜(최대 3주)·시간대를 열면 각자 1시간 칸을 칠함 → "모두 보기"에서 겹치는 시간 → 방장이 합주 확정(장소·메모) → 구글 캘린더 추가 링크 |
| 다른 앱 링크 | 곡 올릴 때 Odesli(song.link)로 Spotify·Apple Music 정확한 링크를 찾아 저장. 못 찾으면 검색 링크로 대체 (멜론은 항상 검색) |
| 청취 후 투표 | 옵션. 하이라이트 60% 이상 들어야 고를 수 있음. **각 기기 기준**이라 강제력보단 "듣고 투표하자" 장치 |

추가로 정한 것:
- **설정 잠금** — 곡 수합이 시작되면 "올린 사람 숨기기"는 고정, 투표가 시작되면 "투표 방식 / 그룹 사용 / 인당 표 수 / 익명 투표 / 표 수정 허용"은 고정. 확정 후엔 이름·인원·입장 방식·파트 편성만 수정 가능. 진행 중에 약속을 바꾸면 안 되니까. (DB 함수가 강제)
- **방장 결과 비공개** — 투표 중엔 방장 메뉴에도 "누가 투표했는지(참여 여부)"만 보여. 뭘 찍었는지/득표수는 마감 때 모두 동시에.
- **카톡 인앱 브라우저** — 감지되면 "브라우저로 열기" 안내를 띄움 (광고·로그인 문제 때문).

## 7. 알아 둘 한계

- **Supabase 무료 플랜은 7일 동안 요청이 없으면 일시정지돼.** 맨 아래 [부록]의 GitHub Actions를 추가하면 월·목마다 한 번씩 깨워 줘. (안 넣었으면 곡 선정 전에 대시보드에서 Restore)
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
drop table if exists public.rehearsals, public.availability_responses, public.availability, public.schedule_polls,
  public.slot_requests, public.song_slots, public.song_group_items, public.song_groups,
  public.votes, public.songs, public.sessions, public.members, public.bands cascade;
drop schema if exists private cascade;
delete from supabase_migrations.schema_migrations;
-- → 그다음 migrations 파일들을 번호 순서대로 SQL Editor에서 Run (또는 아무 커밋이나 push해서 연동이 다시 적용하게)
```

## 9. 아직 안 넣은 것 (다음 후보)
- **밴드가 직접 녹음한 파일 올리기** — Supabase Storage + 업로드 권한을 확인하는 서버 함수(Edge Function)가 필요. 무료 저장 공간 1GB라 용량 정책도 같이 정해야 함
- **카톡 알림** (마감 임박, 승인 요청 등) — 카카오 비즈 채널 승인이 필요해서 개인 프로젝트로는 무거움
- **단계 되돌리기** — 지금은 일부러 막아 둠 (넘기기 전 확인 단계로 대신)

---

## 부록: Supabase 깨우기 GitHub Actions (선택)

보안상 `.github/workflows/` 파일은 GitHub 웹에서 직접 만드는 걸 추천해.

1. GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret** 두 개
   - `SUPABASE_URL` = `https://xxxx.supabase.co`
   - `SUPABASE_ANON_KEY` = publishable 키 (어차피 웹앱에 공개되는 키)
2. 저장소 → **Add file → Create new file** → 이름 `.github/workflows/supabase-keepalive.yml` → 아래 붙여넣고 Commit
3. **Actions** 탭 → "Supabase 깨우기" → **Run workflow** 로 한 번 돌려 보기 (초록 체크면 성공)

```yaml
name: Supabase 깨우기
on:
  schedule:
    - cron: '17 0 * * 1,4' # 매주 월·목 오전 9시 17분 (한국 시간)
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: DB 함수 한 번 호출하기
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: |
          status=$(curl -sS -o response.json -w '%{http_code}' -X POST "$SUPABASE_URL/rest/v1/rpc/peek_band" \
            -H "apikey: $SUPABASE_KEY" -H "Content-Type: application/json" \
            -d '{"p_invite_code":"KEEPALIVE"}')
          echo "HTTP $status"; cat response.json; echo
          test "$status" = "200"
```
GitHub는 저장소에 60일 동안 커밋이 없으면 예약 작업을 멈춰. 그럴 땐 Actions 탭에서 다시 켜면 돼.
