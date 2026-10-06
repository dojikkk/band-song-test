// Supabase 연결 — 주소와 키는 .env.local 에서 읽어옴 (README 참고)
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

// 우리 앱은 Supabase 로그인(Auth)을 안 쓰고, 자체 세션 토큰(코드+이름+PIN)을 씀.
// 그래서 auth 쪽 자동 저장/갱신은 꺼둠.
export const supabase = isConfigured
  ? createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;
