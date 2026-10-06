import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true }, // 같은 와이파이의 폰에서도 열어 볼 수 있게
  build: { chunkSizeWarningLimit: 700 }, // supabase-js가 커서 기본 경고(500KB)를 살짝 올림
});
