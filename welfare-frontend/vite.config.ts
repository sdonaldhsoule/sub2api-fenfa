import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

function normalizeViteBase(base: string | undefined): string {
  const value = (base ?? '/').trim();
  const normalized = value.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');

  return normalized ? `/${normalized}/` : '/';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    base: normalizeViteBase(env.VITE_WELFARE_APP_BASE),
    plugins: [react()],
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      setupFiles: './src/test/setup.ts'
    }
  };
});
