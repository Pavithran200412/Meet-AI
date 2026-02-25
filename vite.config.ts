import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  const HF_TOKEN = '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';

  return {
    plugins: [react()],
    define: {
      'process.env': JSON.stringify({
        ...env,
        HF_TOKEN: HF_TOKEN,
        API_KEY: process.env.API_KEY || env.API_KEY || ''
        // DO NOT add GITHUB_TOKEN or other secrets here — Vite inlines define()
        // values as literals into the client bundle, leaking them publicly.
      }),
      'process.version': JSON.stringify('v16.0.0'),
    },
    build: {
      target: 'modules',
      outDir: 'dist',
      sourcemap: false
    },
    optimizeDeps: {
      exclude: [],
      include: ['p-retry']
    }
  };
});